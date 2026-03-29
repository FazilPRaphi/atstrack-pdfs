/**
 * pdfEngine.js
 * All PDF-specific logic: loading with pdfjs, exporting with pdf-lib,
 * and IndexedDB cache management.
 */

import * as pdfjs from "pdfjs-dist";
import { PDFDocument, degrees } from "pdf-lib";
import { uid, clamp, hexToRgbColor, mapFontFamilyToStandardFonts } from "./elementUtils";
import { PDFJS_POINTS_SCALE, createPdfPage } from "./pageUtils";

// ─── pdfjs worker setup ───────────────────────────────────────────────────────

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─── IndexedDB ────────────────────────────────────────────────────────────────

const idb = {
  db: null,
  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("PDFWise_DBX", 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore("pdf-cache");
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  },
  async set(key, val) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pdf-cache", "readwrite");
      tx.objectStore("pdf-cache").put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pdf-cache", "readonly");
      const req = tx.objectStore("pdf-cache").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async clear() {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction("pdf-cache", "readwrite");
      tx.objectStore("pdf-cache").clear();
      tx.oncomplete = () => resolve();
    });
  },
};

export const STORAGE_KEY = "editor-doc";
export const IDB_KEY = "editor-pdf-sources";
export const LEGACY_STORAGE_KEY = "pdf_pro_editor_state";
export const LEGACY_IDB_KEY = "pdf_buffers_cache";

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function loadPersistedState() {
  let doc = null;
  let fileName = "";
  let pdfSources = [];
  let warnings = [];

  // Load doc from localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.doc?.pages) {
        doc = parsed.doc;
        fileName = parsed.fileName || "";
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  } else {
    // Try legacy format
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        const { migrateLegacyState } = await import("./pageUtils");
        const migrated = migrateLegacyState(parsed.pages, parsed.fileName);
        doc = migrated.doc;
        fileName = migrated.fileName;
      } catch {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
  }

  // Load pdf sources from IDB
  try {
    const cached = await idb.get(IDB_KEY);
    if (cached && Array.isArray(cached)) {
      const usable = cached.filter((s) => s?.data && s.data.byteLength > 0);
      pdfSources = usable;
      if (usable.length !== cached.length) {
        warnings.push("Some cached PDFs could not be restored. Please re-upload.");
      }
    } else {
      // Try legacy IDB
      const legacyCached = await idb.get(LEGACY_IDB_KEY);
      if (legacyCached && Array.isArray(legacyCached)) {
        const usable = legacyCached.filter((s) => s?.data && s.data.byteLength > 0);
        pdfSources = usable;
      }
    }
  } catch {
    pdfSources = [];
  }

  return { doc, fileName, pdfSources, warnings };
}

export async function persistState(doc, fileName, pdfSources) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ doc, fileName }));
  if (pdfSources.length > 0) {
    try {
      await idb.set(IDB_KEY, pdfSources);
    } catch {
      // IDB might be unavailable
    }
  }
}

export async function clearPersistedState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  await idb.clear();
}

// ─── PDF loading ──────────────────────────────────────────────────────────────

/**
 * Load a PDF file and return source info + new pages.
 */
export async function loadPdfFile(file) {
  if (!file || file.type !== "application/pdf") {
    throw new Error("Invalid file type. Please upload a PDF.");
  }

  const originalBuffer = await file.arrayBuffer();
  const sourceId = uid("pdf");
  const source = {
    id: sourceId,
    name: file.name,
    data: originalBuffer.slice(0),
  };

  const pdfDoc = await pdfjs.getDocument({ data: originalBuffer.slice(0) }).promise;
  const newPages = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: PDFJS_POINTS_SCALE });
    newPages.push(createPdfPage(sourceId, i, vp.width, vp.height));
  }

  return { source, pages: newPages };
}

/**
 * Render a PDF page to a canvas element.
 * Returns the viewport used (for scale tracking).
 */
export async function renderPdfPageToCanvas(
  canvas,
  pdfSource,
  pdfPageNumber,
  containerWidth,
  pdfjsDocCache
) {
  if (!pdfSource?.data || !canvas) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const sourceId = pdfSource.id;
  let docPromise = pdfjsDocCache.get(sourceId);
  if (!docPromise) {
    docPromise = pdfjs.getDocument({ data: pdfSource.data.slice(0) }).promise;
    pdfjsDocCache.set(sourceId, docPromise);
  }

  const doc = await docPromise;
  const pdfPage = await doc.getPage(pdfPageNumber || 1);
  const baseViewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE });

  const scale = containerWidth
    ? containerWidth / baseViewport.width
    : 1;

  const viewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE * scale });
  const cw = Math.max(1, Math.floor(viewport.width));
  const ch = Math.max(1, Math.floor(viewport.height));

  canvas.width = cw;
  canvas.height = ch;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;

  const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
  await renderTask.promise;

  return {
    scale,
    width: baseViewport.width,
    height: baseViewport.height,
    renderTask,
  };
}

/**
 * Render a small thumbnail of a PDF page.
 */
export async function renderPdfThumbnail(canvas, pdfSource, pdfPageNumber, pdfjsDocCache) {
  if (!pdfSource?.data || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const sourceId = pdfSource.id;
  let docPromise = pdfjsDocCache.get(sourceId);
  if (!docPromise) {
    docPromise = pdfjs.getDocument({ data: pdfSource.data.slice(0) }).promise;
    pdfjsDocCache.set(sourceId, docPromise);
  }

  const doc = await docPromise;
  const pdfPage = await doc.getPage(pdfPageNumber || 1);
  const baseViewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE });
  const scale = 120 / baseViewport.width;
  const viewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE * scale });

  const w = Math.max(1, Math.floor(viewport.width));
  const h = Math.max(1, Math.floor(viewport.height));

  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
  await renderTask.promise;

  return renderTask;
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function exportToPdf(doc, pdfSources, fileName) {
  const outPdf = await PDFDocument.create();

  // Load all source PDFs
  const loaded = new Map();
  for (const s of pdfSources) {
    if (!s?.data) continue;
    loaded.set(s.id, await PDFDocument.load(s.data.slice(0)));
  }

  // Font cache
  const fontCache = new Map();
  const getFontPair = async (ff) => {
    const { regular, bold } = mapFontFamilyToStandardFonts(ff);
    const key = `${regular}|${bold}`;
    const hit = fontCache.get(key);
    if (hit) return hit;
    const pair = {
      reg: await outPdf.embedFont(regular),
      bold: await outPdf.embedFont(bold),
    };
    fontCache.set(key, pair);
    return pair;
  };

  for (const p of doc.pages) {
    let outPage;

    if (p.type === "pdf" && p.pdfSourceId && loaded.has(p.pdfSourceId)) {
      const [copied] = await outPdf.copyPages(loaded.get(p.pdfSourceId), [
        (p.pdfPageNumber || 1) - 1,
      ]);
      outPage = outPdf.addPage(copied);
    } else {
      outPage = outPdf.addPage([p.width || 595.28, p.height || 841.89]);
    }

    const { width: pw, height: ph } = outPage.getSize();

    for (const el of p.elements || []) {
      if (!el || !Number.isFinite(el.x) || !Number.isFinite(el.y)) continue;

      if (el.type === "text") {
        const text = String(el.properties?.text ?? "");
        if (!text.trim()) continue;

        const fontSize = clamp(Number(el.properties?.fontSize ?? 16), 6, 200);
        const { reg, bold } = await getFontPair(el.properties?.fontFamily);
        const font = el.properties?.fontWeight === "bold" ? bold : reg;
        const maxWidth = Number.isFinite(el.width) ? el.width : undefined;
        const align = el.properties?.align || "left";
        const safeMaxWidth = maxWidth && maxWidth > 0 ? maxWidth : undefined;

        const firstLine = text.split("\n")[0] ?? "";
        const flw = font.widthOfTextAtSize(firstLine, fontSize);

        let x = el.x;
        if (safeMaxWidth && align === "center") x = el.x + (safeMaxWidth - flw) / 2;
        if (safeMaxWidth && align === "right") x = el.x + (safeMaxWidth - flw);

        outPage.drawText(text, {
          x: clamp(x, 0, pw),
          y: clamp(ph - el.y - fontSize, 0, ph),
          size: fontSize,
          font,
          color: hexToRgbColor(el.properties?.color),
          maxWidth: safeMaxWidth,
          lineHeight: fontSize * 1.2,
          rotate: el.rotation ? degrees(el.rotation) : undefined,
        });
      }

      if (el.type === "image") {
        const src = el.properties?.src;
        if (!src || typeof src !== "string") continue;

        const imgBytes = await fetch(src).then((r) => r.arrayBuffer());
        const isPng =
          src.startsWith("data:image/png") ||
          src.toLowerCase().includes("png");
        const image = isPng
          ? await outPdf.embedPng(imgBytes)
          : await outPdf.embedJpg(imgBytes);

        const w = Number.isFinite(el.width) ? el.width : image.width;
        const h = Number.isFinite(el.height) ? el.height : image.height;

        outPage.drawImage(image, {
          x: clamp(el.x, 0, pw),
          y: clamp(ph - el.y - h, 0, ph),
          width: clamp(w, 1, pw),
          height: clamp(h, 1, ph),
          rotate: el.rotation ? degrees(el.rotation) : undefined,
        });
      }
    }
  }

  const bytes = await outPdf.save();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  a.download = fileName
    ? fileName.replace(/\.pdf$/i, "") + "-export.pdf"
    : "export.pdf";
  a.click();
}
