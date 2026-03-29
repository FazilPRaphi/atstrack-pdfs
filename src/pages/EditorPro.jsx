/**
 * EditorPro — Refactored & Extended PDF Editor Engine
 *
 * Architecture: Context + useReducer (no external state lib)
 * New features:
 *   - Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
 *   - Zoom 25–300% (Ctrl+Wheel)
 *   - Multi-select (Shift+Click)
 *   - Snap guides (page center + element edges)
 *   - Layer management (bring forward / send backward)
 *   - Keyboard shortcuts (Delete, Ctrl+D, Arrow keys)
 *   - Page virtualization (IntersectionObserver)
 *   - Stable text editing (cursor-preserved contentEditable)
 */

import {
  createContext, useCallback, useContext, useEffect,
  useMemo, useReducer, useRef, useState, memo,
} from "react";
import {
  DndContext, KeyboardSensor, PointerSensor,
  closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, rectSortingStrategy,
  sortableKeyboardCoordinates, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
  AlignCenter, AlignLeft, AlignRight, Bold,
  ChevronDown, ChevronUp, Copy, Download, FileBox, FileEdit,
  FileText, GripVertical, Image as ImageIcon, Layers,
  Loader2, Plus, RotateCcw, RotateCw, Sparkles, Trash2,
  Type, Upload, X, XCircle, ZoomIn, ZoomOut,
} from "lucide-react";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { auth } from "../firebase";
import logo from "../assets/logo.png";
import * as pdfjs from "pdfjs-dist";
import BackButton from "../components/BackButton";

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─── Google Fonts ─────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("ep-gf")) {
  const l = document.createElement("link");
  l.id = "ep-gf"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap";
  document.head.appendChild(l);
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  pageBg: "#F5F5F3", sidebarBg: "#FDFCFA", cardBg: "#FFFFFF",
  beige: "#E8DDC7", beigeHov: "#DECEB4", green: "#0F3D3E",
  greenHov: "#0a2e2f", black: "#111111", muted: "#6B6B6B",
  border: "#E0E0E0", dot: "#D8D4CC", fieldBg: "#F9F8F6",
  errBg: "#FEF2F2", errText: "#C0392B", primary: "#0F3D3E",
  guide: "#2196F3", snap: "#FF5722",
};
const F = {
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'DM Sans', 'Helvetica Neue', sans-serif",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PDFJS_SCALE = 72 / 96;
const STORAGE_KEY = "editor-doc";
const IDB_KEY = "editor-pdf-sources";
const LEGACY_SK = "pdf_pro_editor_state";
const LEGACY_IDB = "pdf_buffers_cache";
const MAX_HISTORY = 50;
const SNAP_THRESHOLD = 8;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

// ─── Utilities ────────────────────────────────────────────────────────────────
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function uid(p) {
  return globalThis.crypto?.randomUUID
    ? `${p}-${crypto.randomUUID()}`
    : `${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function hexRgb(hex) {
  const s = typeof hex === "string" ? hex : "#000000";
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return rgb(0, 0, 0);
  return rgb(parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255);
}
function fontPair(ff) {
  const f = (ff || "").toLowerCase();
  if (f.includes("times")) return { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold };
  if (f.includes("courier")) return { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold };
  return { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold };
}

// ─── Element / Page factories ─────────────────────────────────────────────────
function mkBlankPage(o = {}) {
  return { id: uid("page"), type: "blank", width: 595.28, height: 841.89, scale: 1, elements: [], ...o };
}
function mkTextEl(o = {}) {
  return {
    id: uid("el"), type: "text", x: 72, y: 96, width: 260, height: 40,
    rotation: 0, zIndex: 0,
    properties: { text: "Add text", fontSize: 16, fontFamily: "Helvetica", color: "#000000", align: "left", fontWeight: "normal" },
    ...o,
  };
}
function mkImageEl(src, dims, o = {}) {
  return {
    id: uid("el"), type: "image",
    x: 72, y: 140,
    width: clamp(dims.width, 40, 420),
    height: clamp(dims.height, 40, 420),
    rotation: 0, zIndex: 0, properties: { src }, ...o,
  };
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────
const idb = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((res, rej) => {
      const r = indexedDB.open("PDFWise_DBX", 1);
      r.onupgradeneeded = (e) => e.target.result.createObjectStore("pdf-cache");
      r.onsuccess = (e) => { this._db = e.target.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("pdf-cache", "readwrite");
      tx.objectStore("pdf-cache").put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("pdf-cache", "readonly");
      const req = tx.objectStore("pdf-cache").get(k);
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  },
  async clear() {
    const db = await this.open();
    return new Promise((res) => {
      const tx = db.transaction("pdf-cache", "readwrite");
      tx.objectStore("pdf-cache").clear(); tx.oncomplete = res;
    });
  },
};

// ─── State / Reducer ─────────────────────────────────────────────────────────
const INIT = {
  doc: { pages: [] }, pdfSources: [], fileName: "",
  selectedPageId: null, selectedIds: [],
  zoom: 1, pan: { x: 0, y: 0 },
  gridEnabled: false, gridSize: 20, snapEnabled: true,
  isLoading: false, isExporting: false, error: null,
};

function reducer(s, a) {
  switch (a.t) {
    case "SET_DOC": return { ...s, doc: a.doc };
    case "SET_FNAME": return { ...s, fileName: a.v };
    case "SET_SOURCES": return { ...s, pdfSources: a.v };
    case "ADD_SOURCE": return { ...s, pdfSources: [...s.pdfSources, a.v] };
    case "RM_SOURCE": return { ...s, pdfSources: s.pdfSources.filter((x) => x.id !== a.id) };

    case "ADD_PAGE": return {
      ...s,
      doc: { ...s.doc, pages: [...s.doc.pages, a.page] },
      selectedPageId: a.page.id, selectedIds: [],
    };
    case "UPD_PAGE": return {
      ...s, doc: {
        ...s.doc,
        pages: s.doc.pages.map((p) => p.id === a.pid ? { ...p, ...a.patch } : p),
      },
    };
    case "DEL_PAGE": {
      const pages = s.doc.pages.filter((p) => p.id !== a.pid);
      return {
        ...s,
        doc: { ...s.doc, pages },
        selectedPageId: s.selectedPageId === a.pid ? (pages[0]?.id ?? null) : s.selectedPageId,
        selectedIds: [],
      };
    }
    case "REORDER_PAGES": return { ...s, doc: { ...s.doc, pages: a.pages } };

    case "ADD_EL": return {
      ...s,
      doc: {
        ...s.doc,
        pages: s.doc.pages.map((p) => p.id === a.pid ? { ...p, elements: [...p.elements, a.el] } : p),
      },
      selectedIds: [a.el.id],
    };
    case "UPD_EL": return {
      ...s, doc: {
        ...s.doc,
        pages: s.doc.pages.map((p) => {
          if (p.id !== a.pid) return p;
          return {
            ...p,
            elements: p.elements.map((e) => {
              if (e.id !== a.eid) return e;
              if (a.next?.id) return a.next; // full replacement
              return { ...e, ...a.next, properties: { ...e.properties, ...(a.next?.properties ?? {}) } };
            }),
          };
        }),
      },
    };
    case "DEL_EL": return {
      ...s,
      doc: {
        ...s.doc,
        pages: s.doc.pages.map((p) =>
          p.id !== a.pid ? p : { ...p, elements: p.elements.filter((e) => !a.eids.includes(e.id)) }
        ),
      },
      selectedIds: s.selectedIds.filter((id) => !a.eids.includes(id)),
    };
    case "DUP_EL": {
      let newId = null;
      const pages = s.doc.pages.map((p) => {
        if (p.id !== a.pid) return p;
        const el = p.elements.find((e) => e.id === a.eid);
        if (!el) return p;
        const clone = { ...el, id: uid("el"), x: el.x + 16, y: el.y + 16, properties: { ...el.properties } };
        newId = clone.id;
        return { ...p, elements: [...p.elements, clone] };
      });
      return { ...s, doc: { ...s.doc, pages }, selectedIds: newId ? [newId] : s.selectedIds };
    }
    case "LAYER": {
      const pages = s.doc.pages.map((p) => {
        if (p.id !== a.pid) return p;
        const els = [...p.elements];
        const i = els.findIndex((e) => e.id === a.eid);
        if (i < 0) return p;
        if (a.dir === "front") { const [el] = els.splice(i, 1); return { ...p, elements: [...els, el] }; }
        if (a.dir === "back") { const [el] = els.splice(i, 1); return { ...p, elements: [el, ...els] }; }
        if (a.dir === "fwd" && i < els.length - 1) { [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
        if (a.dir === "bwd" && i > 0) { [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
        return { ...p, elements: els };
      });
      return { ...s, doc: { ...s.doc, pages } };
    }

    case "SEL_PAGE": return { ...s, selectedPageId: a.pid, selectedIds: a.clr ? [] : s.selectedIds };
    case "SEL_ELS": return { ...s, selectedIds: a.ids };
    case "TOG_EL": {
      const ids = s.selectedIds.includes(a.id)
        ? s.selectedIds.filter((x) => x !== a.id)
        : [...s.selectedIds, a.id];
      return { ...s, selectedIds: ids };
    }
    case "CLR_SEL": return { ...s, selectedIds: [] };

    case "SET_ZOOM": return { ...s, zoom: clamp(a.v, MIN_ZOOM, MAX_ZOOM) };
    case "SET_PAN": return { ...s, pan: a.v };
    case "SET_GRID": return { ...s, gridEnabled: a.enabled ?? s.gridEnabled, gridSize: a.size ?? s.gridSize };
    case "SET_SNAP": return { ...s, snapEnabled: a.v };

    case "SET_LOADING": return { ...s, isLoading: a.v };
    case "SET_EXPORTING": return { ...s, isExporting: a.v };
    case "SET_ERR": return { ...s, error: a.v };
    case "RESET": return { ...INIT };
    default: return s;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const Ctx = createContext(null);
function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("Must be inside EditorProvider");
  return c;
}

// ─── Snap computation ─────────────────────────────────────────────────────────
function computeSnap(movingEl, page, others, enabled, gridEnabled, gridSize) {
  if (!enabled) return { sx: movingEl.x, sy: movingEl.y, guides: [] };

  if (gridEnabled && gridSize > 0) {
    return {
      sx: Math.round(movingEl.x / gridSize) * gridSize,
      sy: Math.round(movingEl.y / gridSize) * gridSize,
      guides: [],
    };
  }

  const W = movingEl.width ?? 0, H = movingEl.height ?? 0;
  const pw = page.width, ph = page.height;
  const pcx = pw / 2, pcy = ph / 2;

  const tx = [
    { v: 0 }, { v: pcx }, { v: pw },
    { v: pcx - W / 2 }, // center el at page center
  ];
  const ty = [
    { v: 0 }, { v: pcy }, { v: ph },
    { v: pcy - H / 2 },
  ];

  for (const o of others) {
    if (o.id === movingEl.id) continue;
    const ox = o.x, oy = o.y, ow = o.width ?? 0, oh = o.height ?? 0;
    tx.push({ v: ox }, { v: ox + ow }, { v: ox + ow / 2 });
    ty.push({ v: oy }, { v: oy + oh }, { v: oy + oh / 2 });
  }

  const guides = [];
  let sx = movingEl.x, sy = movingEl.y;
  let bdx = SNAP_THRESHOLD, bdy = SNAP_THRESHOLD;

  for (const t of tx) {
    const d1 = Math.abs(movingEl.x - t.v);
    if (d1 < bdx) { bdx = d1; sx = t.v; guides.push({ axis: "x", value: t.v }); }
    const d2 = Math.abs(movingEl.x + W - t.v);
    if (d2 < bdx) { bdx = d2; sx = t.v - W; guides.push({ axis: "x", value: t.v }); }
  }
  for (const t of ty) {
    const d1 = Math.abs(movingEl.y - t.v);
    if (d1 < bdy) { bdy = d1; sy = t.v; guides.push({ axis: "y", value: t.v }); }
    const d2 = Math.abs(movingEl.y + H - t.v);
    if (d2 < bdy) { bdy = d2; sy = t.v - H; guides.push({ axis: "y", value: t.v }); }
  }

  return { sx, sy, guides };
}

// ─── Legacy migration ─────────────────────────────────────────────────────────
function migrateLegacy(legacyPages, legacyFileName) {
  const pages = (legacyPages || []).map((p) => {
    const type = p.type === "pdf" ? "pdf" : "blank";
    const width = typeof p.width === "number" ? p.width * PDFJS_SCALE : 595.28;
    const height = typeof p.height === "number" ? p.height * PDFJS_SCALE : 841.89;
    const elements = (p.elements || []).map((el) => {
      if (el.type === "text") return {
        id: el.id || uid("el"), type: "text",
        x: el.x ?? 72, y: el.y ?? 96, width: el.width ?? 260, height: el.height ?? 40,
        rotation: el.rotation ?? 0, zIndex: 0,
        properties: {
          text: el.value ?? el.properties?.text ?? "Add text",
          fontSize: el.fontSize ?? el.properties?.fontSize ?? 16,
          fontFamily: el.fontFamily ?? el.properties?.fontFamily ?? "Helvetica",
          color: el.color ?? el.properties?.color ?? "#000000",
          align: el.align ?? el.properties?.align ?? "left",
          fontWeight: (el.fontWeight ?? el.properties?.fontWeight) === "bold" ? "bold" : "normal",
        },
      };
      if (el.type === "image") return {
        id: el.id || uid("el"), type: "image",
        x: el.x ?? 72, y: el.y ?? 140, width: el.width ?? 240, height: el.height ?? 160,
        rotation: el.rotation ?? 0, zIndex: 0, properties: { src: el.src ?? el.properties?.src },
      };
      return null;
    }).filter(Boolean);
    const page = { id: p.id || uid("page"), type, width, height, scale: p.scale ?? 1, elements };
    if (type === "pdf") {
      page.pdfPageNumber = (p.originalPageIndex ?? 0) + 1;
      page.pdfSourceId = p.bufferId ?? p.pdfSourceId ?? null;
    }
    return page;
  });
  return { fileName: legacyFileName || "", doc: { pages } };
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const css = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body,#root{height:100%;background:${C.pageBg}}
  body{font-family:${F.sans};-webkit-font-smoothing:antialiased;color:${C.black}}
  ::placeholder{color:#b8b4ac}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:#d0ccc4;border-radius:99px}

  .ep-nav{height:56px;background:rgba(245,245,243,0.95);backdrop-filter:blur(12px);
    border-bottom:1px solid ${C.border};display:flex;align-items:center;
    justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:200;flex-shrink:0}
  .ep-nav-logo{display:flex;align-items:center;gap:9px;font-family:${F.sans};
    font-weight:700;font-size:15px;color:${C.black};letter-spacing:-0.01em}
  .ep-nav-logo-icon{width:30px;height:30px;border-radius:8px;background:${C.beige};
    display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
  .ep-nav-right{display:flex;align-items:center;gap:10px}
  .ep-nav-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;
    border-radius:999px;border:1px solid ${C.border};background:transparent;
    font-family:${F.sans};font-size:12px;font-weight:500;color:${C.black};cursor:pointer;
    transition:background .18s,border-color .18s}
  .ep-nav-pill:hover{background:${C.beige};border-color:#ccc}
  .ep-nav-cta{background:${C.green};color:#fff;font-family:${F.sans};font-size:12px;
    font-weight:600;padding:7px 16px;border-radius:999px;border:none;cursor:pointer;
    display:flex;align-items:center;gap:6px;transition:opacity .15s}
  .ep-nav-cta:hover{opacity:.85}

  .ep-root{display:flex;height:calc(100vh - 56px);overflow:hidden}

  .ep-sidebar{width:268px;flex-shrink:0;border-right:1px solid ${C.border};
    background:${C.sidebarBg};display:flex;flex-direction:column;
    overflow-y:auto;padding:20px 16px}
  .ep-section-label{font-size:9px;font-weight:700;text-transform:uppercase;
    letter-spacing:.14em;color:${C.muted};margin-bottom:10px;
    display:flex;align-items:center;gap:6px}
  .ep-section-label::before{content:'';display:block;width:3px;height:12px;
    border-radius:2px;background:${C.green};flex-shrink:0}

  .ep-tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
  .ep-tool-btn{display:flex;flex-direction:column;align-items:flex-start;gap:8px;
    padding:12px;border-radius:12px;background:${C.cardBg};border:1px solid ${C.border};
    cursor:pointer;transition:border-color .18s,box-shadow .18s,transform .15s;
    font-family:${F.sans};font-size:11px;font-weight:600;color:${C.muted};text-align:left}
  .ep-tool-btn:hover:not(:disabled){border-color:${C.green};
    box-shadow:0 2px 12px rgba(15,61,62,.1);transform:translateY(-1px);color:${C.black}}
  .ep-tool-btn:disabled{opacity:.35;cursor:not-allowed}
  .ep-tool-icon{width:36px;height:36px;border-radius:9px;background:#F2EDE4;
    display:flex;align-items:center;justify-content:center;color:${C.green}}

  .ep-upload-label{display:flex;align-items:center;justify-content:center;gap:8px;
    padding:10px 14px;border-radius:10px;border:1.5px dashed ${C.border};
    background:transparent;cursor:pointer;font-family:${F.sans};font-size:12px;
    font-weight:600;color:${C.muted};transition:border-color .18s,background .18s,color .18s}
  .ep-upload-label:hover{border-color:${C.green};background:#F0F5F0;color:${C.black}}

  .ep-source-item{display:flex;align-items:center;justify-content:space-between;
    padding:9px 11px;border-radius:9px;background:${C.cardBg};
    border:1px solid ${C.border};margin-bottom:6px}
  .ep-source-name{font-size:11px;font-weight:500;color:${C.black};
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
  .ep-source-rm{background:none;border:none;cursor:pointer;color:${C.muted};
    padding:3px;border-radius:5px;transition:color .15s,background .15s}
  .ep-source-rm:hover{color:${C.errText};background:#FEF2F2}

  .ep-add-page-btn{display:flex;align-items:center;justify-content:center;gap:7px;
    width:100%;padding:10px;border-radius:10px;border:1.5px dashed ${C.border};
    background:transparent;font-family:${F.sans};font-size:12px;font-weight:600;
    color:${C.muted};cursor:pointer;transition:border-color .18s,background .18s,color .18s}
  .ep-add-page-btn:hover{border-color:${C.green};background:#F0F5F0;color:${C.black}}

  .ep-thumb{border-radius:11px;border:1.5px solid ${C.border};background:${C.cardBg};
    padding:10px;cursor:pointer;transition:border-color .18s,box-shadow .18s;
    position:relative;margin-bottom:6px}
  .ep-thumb:hover{border-color:#b0aca4;box-shadow:0 2px 10px rgba(0,0,0,.06)}
  .ep-thumb.active{border-color:${C.green};box-shadow:0 2px 14px rgba(15,61,62,.13)}
  .ep-thumb-inner{display:flex;align-items:center;gap:9px}
  .ep-thumb-canvas-wrap{flex-shrink:0;border-radius:7px;overflow:hidden;
    border:1px solid ${C.border};background:#fff;position:relative}
  .ep-thumb-num{position:absolute;left:4px;top:4px;border-radius:4px;
    background:rgba(0,0,0,.55);color:#fff;font-size:9px;font-weight:700;
    padding:1px 5px;line-height:1.4}
  .ep-thumb-info{flex:1;min-width:0}
  .ep-thumb-type{font-size:10px;font-weight:700;color:${C.black};letter-spacing:.02em}
  .ep-thumb-sub{font-size:9px;color:${C.muted};margin-top:2px}
  .ep-thumb-grip{flex-shrink:0;padding:5px;border-radius:6px;color:${C.muted};
    cursor:grab;transition:background .15s,color .15s;margin-left:auto}
  .ep-thumb-grip:hover{background:${C.beige};color:${C.black}}
  .ep-thumb-del{position:absolute;right:8px;top:8px;background:none;border:none;
    cursor:pointer;color:${C.border};border-radius:5px;padding:3px;
    transition:color .15s,background .15s;opacity:0}
  .ep-thumb:hover .ep-thumb-del{opacity:1}
  .ep-thumb-del:hover{color:${C.errText};background:#FEF2F2}

  .ep-sidebar-footer{margin-top:auto;padding-top:16px;border-top:1px solid ${C.border}}
  .ep-export-btn{width:100%;padding:12px;border-radius:11px;background:${C.green};
    color:#fff;font-family:${F.sans};font-size:12px;font-weight:700;
    letter-spacing:.04em;text-transform:uppercase;border:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;gap:7px;
    transition:opacity .15s,transform .15s;margin-bottom:8px}
  .ep-export-btn:hover:not(:disabled){opacity:.88;transform:translateY(-1px)}
  .ep-export-btn:disabled{opacity:.4;cursor:not-allowed}
  .ep-reset-btn{width:100%;padding:8px;border-radius:9px;background:transparent;
    border:none;font-family:${F.sans};font-size:11px;font-weight:500;
    color:${C.muted};cursor:pointer;transition:background .15s,color .15s}
  .ep-reset-btn:hover{background:#FEF2F2;color:${C.errText}}

  /* Zoom bar */
  .ep-zoom-bar{display:flex;align-items:center;gap:6px;background:${C.cardBg};
    border:1px solid ${C.border};border-radius:10px;padding:5px 8px;
    font-family:${F.sans};font-size:11px;font-weight:600;color:${C.black}}
  .ep-zoom-btn{background:none;border:none;cursor:pointer;color:${C.muted};
    padding:3px;border-radius:5px;display:flex;align-items:center;
    transition:color .15s,background .15s}
  .ep-zoom-btn:hover{color:${C.black};background:${C.beige}}
  .ep-zoom-val{min-width:38px;text-align:center;font-size:11px}

  /* Undo/Redo */
  .ep-hist-btn{background:none;border:1px solid ${C.border};cursor:pointer;
    color:${C.muted};padding:5px 9px;border-radius:7px;display:flex;align-items:center;
    gap:4px;font-family:${F.sans};font-size:11px;font-weight:500;
    transition:color .15s,background .15s,border-color .15s}
  .ep-hist-btn:hover:not(:disabled){color:${C.black};background:${C.beige};border-color:#ccc}
  .ep-hist-btn:disabled{opacity:.3;cursor:not-allowed}

  /* Main canvas */
  .ep-main{flex:1;overflow:hidden;background:${C.pageBg};position:relative}
  .ep-canvas-viewport{width:100%;height:100%;overflow:auto;padding:28px 32px 80px}
  .ep-canvas-inner{transform-origin:top left;transition:transform .15s ease}

  /* Header bar */
  .ep-header-bar{background:${C.cardBg};border:1px solid ${C.border};
    border-radius:16px;padding:16px 20px;display:flex;align-items:center;
    justify-content:space-between;margin-bottom:24px;gap:12px;flex-wrap:wrap;
    position:relative}
  .ep-header-icon{width:44px;height:44px;border-radius:12px;background:#F2EDE4;
    display:flex;align-items:center;justify-content:center;color:${C.green};flex-shrink:0}
  .ep-doc-name{font-family:${F.serif};font-size:18px;font-weight:400;
    color:${C.black};letter-spacing:-0.01em}
  .ep-doc-meta{font-size:11px;color:${C.muted};margin-top:3px}
  .ep-header-actions{display:flex;gap:8px;flex-wrap:wrap}

  /* Page card */
  .ep-page-card{background:${C.cardBg};border:1px solid ${C.border};
    border-radius:16px;overflow:hidden;margin-bottom:20px}
  .ep-page-topbar{display:flex;align-items:center;justify-content:space-between;
    padding:12px 16px;border-bottom:1px solid ${C.border};gap:8px;flex-wrap:wrap}
  .ep-page-tag{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;
    border-radius:999px;border:1px solid ${C.border};font-size:11px;
    font-weight:600;color:${C.muted};background:${C.fieldBg}}
  .ep-page-tag.green{border-color:${C.green};color:${C.green};background:#EEF5F0}
  .ep-page-actions{display:flex;gap:6px;flex-wrap:wrap}
  .ep-page-del-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;
    border-radius:999px;border:1px solid #fccaca;background:#FEF2F2;
    font-size:11px;font-weight:600;color:${C.errText};cursor:pointer;
    transition:background .15s}
  .ep-page-del-btn:hover{background:#fde8e8}
  .ep-page-sel-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;
    border-radius:999px;border:1px solid ${C.border};background:${C.fieldBg};
    font-size:11px;font-weight:600;color:${C.muted};cursor:pointer;
    transition:border-color .15s,color .15s,background .15s}
  .ep-page-sel-btn:hover,.ep-page-sel-btn.active{border-color:${C.green};
    color:${C.green};background:#EEF5F0}
  .ep-page-canvas-wrap{padding:20px;display:flex;justify-content:center}

  /* Layer btns */
  .ep-layer-btn{background:none;border:1px solid ${C.border};cursor:pointer;
    color:${C.muted};padding:4px 6px;border-radius:6px;display:flex;
    align-items:center;transition:color .15s,background .15s,border-color .15s}
  .ep-layer-btn:hover{color:${C.black};background:${C.beige};border-color:#ccc}

  /* Text toolbar */
  .ep-txt-toolbar{position:absolute;z-index:300;display:flex;align-items:center;
    gap:8px;border-radius:12px;background:${C.cardBg};border:1px solid ${C.border};
    padding:8px 10px;box-shadow:0 4px 24px rgba(0,0,0,.1);transform:translate(-50%,-100%)}
  .ep-txt-input{font-family:${F.sans};font-size:13px;font-weight:600;
    color:${C.black};background:transparent;border:none;outline:none;width:52px}
  .ep-txt-select{font-family:${F.sans};font-size:13px;font-weight:500;
    color:${C.black};background:transparent;border:none;outline:none}
  .ep-txt-divider{width:1px;height:18px;background:${C.border};flex-shrink:0}
  .ep-txt-btn{padding:5px;border-radius:7px;border:none;background:transparent;
    cursor:pointer;color:${C.muted};transition:background .15s,color .15s}
  .ep-txt-btn:hover,.ep-txt-btn.active{background:${C.beige};color:${C.black}}
  .ep-txt-close{padding:5px;border-radius:7px;border:none;background:transparent;
    cursor:pointer;color:${C.muted};transition:background .15s}
  .ep-txt-close:hover{background:#FEF2F2;color:${C.errText}}

  /* Resize handles */
  .ep-handle{position:absolute;width:10px;height:10px;border-radius:50%;
    background:#fff;border:1.5px solid ${C.green};
    box-shadow:0 1px 4px rgba(0,0,0,.15);z-index:120}

  /* Snap guides */
  .ep-guide-x{position:absolute;left:0;right:0;height:1px;background:${C.guide};
    pointer-events:none;z-index:150;opacity:.8}
  .ep-guide-y{position:absolute;top:0;bottom:0;width:1px;background:${C.guide};
    pointer-events:none;z-index:150;opacity:.8}

  /* Grid overlay */
  .ep-grid{position:absolute;inset:0;pointer-events:none;z-index:5;opacity:.4}

  /* Selection box */
  .ep-sel-box{position:absolute;border:1.5px solid ${C.green};
    background:rgba(15,61,62,.06);pointer-events:none;z-index:130;border-radius:4px}

  /* Multi-select bounding box */
  .ep-multi-bbox{position:absolute;border:2px dashed ${C.green};
    pointer-events:none;z-index:125;border-radius:6px}

  /* Error */
  .ep-error{border-radius:11px;background:#FEF2F2;border:1px solid #fccaca;
    padding:12px 16px;font-size:12px;color:${C.errText};font-weight:500;margin-bottom:16px}

  /* Empty */
  .ep-empty{display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;min-height:55vh;gap:0}
  .ep-empty-icon{width:80px;height:80px;border-radius:24px;background:${C.beige};
    display:flex;align-items:center;justify-content:center;
    color:${C.green};margin-bottom:20px;font-size:32px}

  /* Loading */
  .ep-loading{display:flex;flex-direction:column;align-items:center;
    justify-content:center;min-height:50vh;gap:14px}
  .ep-spinner{width:40px;height:40px;border:3px solid ${C.border};
    border-top-color:${C.green};border-radius:50%;animation:ep-spin .8s linear infinite}
  @keyframes ep-spin{to{transform:rotate(360deg)}}

  @media(max-width:768px){.ep-sidebar{display:none}.ep-main{padding:16px}}

  /* Toast notification */
  .ep-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(0);
    background:${C.green};color:#fff;padding:10px 22px;border-radius:999px;
    font-family:${F.sans};font-size:13px;font-weight:600;letter-spacing:.01em;
    box-shadow:0 4px 20px rgba(15,61,62,.35);z-index:9999;
    animation:ep-toast-in .22s ease,ep-toast-out .3s ease 1.8s forwards}
  @keyframes ep-toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes ep-toast-out{to{opacity:0;transform:translateX(-50%) translateY(8px)}}

  /* Active toggle highlight */
  .ep-nav-pill.ep-active{background:${C.beige};border-color:#bbb;color:${C.black}}
`;

// ─── Grid SVG overlay ─────────────────────────────────────────────────────────
function GridOverlay({ width, height, size, scale }) {
  const s = size * scale;
  if (s < 4) return null;
  const w = width * scale, h = height * scale;
  return (
    <svg className="ep-grid" width={w} height={h} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="gp" width={s} height={s} patternUnits="userSpaceOnUse">
          <path d={`M ${s} 0 L 0 0 0 ${s}`} fill="none" stroke={C.dot} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#gp)" />
    </svg>
  );
}

// ─── Snap guides overlay ──────────────────────────────────────────────────────
function SnapGuides({ guides, pageWidth, pageHeight, scale }) {
  return (
    <>
      {guides.map((g, i) =>
        g.axis === "y" ? (
          <div key={i} className="ep-guide-x" style={{ top: g.value * scale }} />
        ) : (
          <div key={i} className="ep-guide-y" style={{ left: g.value * scale }} />
        )
      )}
    </>
  );
}

// ─── Text toolbar ─────────────────────────────────────────────────────────────
function TextToolbar({ position, value, onChange, onClose }) {
  if (!value) return null;
  return (
    <Motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
      className="ep-txt-toolbar"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Type size={13} style={{ color: C.muted, flexShrink: 0 }} />
      <input
        type="number" min={6} max={200} value={value.fontSize ?? 16}
        onChange={(e) => onChange({ fontSize: clamp(parseInt(e.target.value || "16", 10), 6, 200) })}
        className="ep-txt-input"
      />
      <div className="ep-txt-divider" />
      <select value={value.fontFamily ?? "Helvetica"} onChange={(e) => onChange({ fontFamily: e.target.value })} className="ep-txt-select">
        <option value="Helvetica">Helvetica</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Courier New">Courier New</option>
      </select>
      <div className="ep-txt-divider" />
      <button className={`ep-txt-btn${value.fontWeight === "bold" ? " active" : ""}`}
        onClick={() => onChange({ fontWeight: value.fontWeight === "bold" ? "normal" : "bold" })} type="button">
        <Bold size={14} />
      </button>
      <div className="ep-txt-divider" />
      {["left", "center", "right"].map((a, i) => {
        const Icon = [AlignLeft, AlignCenter, AlignRight][i];
        return (
          <button key={a} className={`ep-txt-btn${value.align === a ? " active" : ""}`}
            onClick={() => onChange({ align: a })} type="button">
            <Icon size={14} />
          </button>
        );
      })}
      <div className="ep-txt-divider" />
      <div style={{ position: "relative", width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${C.border}`, overflow: "hidden", cursor: "pointer", background: value.color || "#000" }}>
        <input type="color" value={value.color || "#000000"} onChange={(e) => onChange({ color: e.target.value })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
      </div>
      <button className="ep-txt-close" onClick={onClose} type="button"><X size={14} /></button>
    </Motion.div>
  );
}

// ─── Resize handle ────────────────────────────────────────────────────────────
function ResizeHandle({ position, onPointerDown }) {
  const pos = {
    nw: { left: 0, top: 0, transform: "translate(-50%,-50%)", cursor: "nwse-resize" },
    ne: { right: 0, top: 0, transform: "translate(50%,-50%)", cursor: "nesw-resize" },
    sw: { left: 0, bottom: 0, transform: "translate(-50%,50%)", cursor: "nesw-resize" },
    se: { right: 0, bottom: 0, transform: "translate(50%,50%)", cursor: "nwse-resize" },
  }[position];
  return <div className="ep-handle" style={pos} onPointerDown={onPointerDown} role="button" tabIndex={-1} />;
}

// ─── Interactive element ──────────────────────────────────────────────────────
const InteractiveElement = memo(function InteractiveElement({
  element, page, pageScale, isSelected, isMultiSelected,
  onSelect, onShiftSelect, onChange, onDelete, onToolbarAnchor,
  snapEnabled, gridEnabled, gridSize,
}) {
  const rootRef = useRef(null);
  const rafRef = useRef(0);
  const dragRef = useRef(null);
  const [guides, setGuides] = useState([]);
  const textRef = useRef(null);

  const screen = useMemo(() => ({
    left: element.x * pageScale,
    top: element.y * pageScale,
    width: typeof element.width === "number" ? element.width * pageScale : undefined,
    height: typeof element.height === "number" ? element.height * pageScale : undefined,
    rotate: element.rotation || 0,
  }), [element, pageScale]);

  // Report toolbar position
  useEffect(() => {
    if (!isSelected || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    onToolbarAnchor({ left: r.left + r.width / 2, top: r.top - 10 });
  }, [isSelected, screen.left, screen.top, screen.width, screen.height, onToolbarAnchor]);

  const setWithRaf = useCallback((next) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => onChange(next));
  }, [onChange]);

  const beginDrag = useCallback((e) => {
    e.stopPropagation();
    if (e.shiftKey) { onShiftSelect(element.id); return; }
    onSelect(element.id);
    dragRef.current = {
      type: "move", start: { x: e.clientX, y: e.clientY },
      origin: { x: element.x, y: element.y },
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [element.id, element.x, element.y, onSelect, onShiftSelect]);

  const beginResize = useCallback((corner) => (e) => {
    e.stopPropagation();
    onSelect(element.id);
    dragRef.current = {
      type: "resize", corner, start: { x: e.clientX, y: e.clientY },
      origin: { x: element.x, y: element.y, width: element.width ?? 240, height: element.height ?? 160 },
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [element, onSelect]);

  const onPointerMove = useCallback((e) => {
    const s = dragRef.current;
    if (!s) return;
    const dx = (e.clientX - s.start.x) / pageScale;
    const dy = (e.clientY - s.start.y) / pageScale;

    if (s.type === "move") {
      const proposed = { ...element, x: s.origin.x + dx, y: s.origin.y + dy };
      const otherEls = page.elements.filter((el) => el.id !== element.id);
      const { sx, sy, guides: g } = computeSnap(
        proposed, page, otherEls, snapEnabled, gridEnabled, gridSize
      );
      setGuides(g);
      setWithRaf({ ...element, x: sx, y: sy });
      return;
    }

    const minSize = 20;
    let nx = s.origin.x, ny = s.origin.y, nw = s.origin.width, nh = s.origin.height;
    if (s.corner === "se") { nw = clamp(nw + dx, minSize, 2000); nh = clamp(nh + dy, minSize, 2000); }
    else if (s.corner === "sw") { nw = clamp(nw - dx, minSize, 2000); nh = clamp(nh + dy, minSize, 2000); nx = s.origin.x + dx; }
    else if (s.corner === "ne") { nw = clamp(nw + dx, minSize, 2000); nh = clamp(nh - dy, minSize, 2000); ny = s.origin.y + dy; }
    else if (s.corner === "nw") { nw = clamp(nw - dx, minSize, 2000); nh = clamp(nh - dy, minSize, 2000); nx = s.origin.x + dx; ny = s.origin.y + dy; }
    setWithRaf({ ...element, x: nx, y: ny, width: nw, height: nh });
  }, [element, page, pageScale, setWithRaf, snapEnabled, gridEnabled, gridSize]);

  const endGesture = useCallback(() => {
    dragRef.current = null;
    setGuides([]);
  }, []);

  const onTextBlur = useCallback((e) => {
    onChange({ ...element, properties: { ...element.properties, text: e.currentTarget.textContent ?? "" } });
  }, [element, onChange]);

  const ring = isMultiSelected
    ? `2px solid ${C.guide}`
    : isSelected
      ? `2px solid ${C.green}`
      : "1px solid transparent";

  const wrapStyle = useMemo(() => {
    const st = { left: screen.left, top: screen.top, transform: `rotate(${screen.rotate}deg)`, transformOrigin: "top left" };
    if (typeof screen.width === "number") st.width = screen.width;
    if (typeof screen.height === "number") st.height = screen.height;
    return st;
  }, [screen]);

  const textStyle = useMemo(() => {
    const p = element.properties || {};
    return {
      fontSize: `${(p.fontSize ?? 16) * pageScale}px`,
      color: p.color || "#000000",
      fontWeight: p.fontWeight === "bold" ? 700 : 500,
      textAlign: p.align || "left",
      fontFamily: p.fontFamily || "Helvetica",
      width: "100%", height: "100%",
      outline: "none", whiteSpace: "pre-wrap", userSelect: "text",
    };
  }, [element.properties, pageScale]);

  return (
    <div
      ref={rootRef}
      style={{
        ...wrapStyle, position: "absolute", zIndex: 100,
        userSelect: "none", borderRadius: 8, outline: ring, outlineOffset: 2,
        boxShadow: isSelected ? `0 2px 16px rgba(15,61,62,.15)` : undefined,
      }}
      onPointerDown={(e) => { e.stopPropagation(); if (e.shiftKey) onShiftSelect(element.id); else onSelect(element.id); }}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {/* Snap guides inside element coord space */}
      {guides.map((g, i) =>
        g.axis === "y"
          ? <div key={i} className="ep-guide-x" style={{ top: (g.value - element.y) * pageScale }} />
          : <div key={i} className="ep-guide-y" style={{ left: (g.value - element.x) * pageScale }} />
      )}

      {/* Drag grip */}
      <div
        className="ep-el-grip"
        style={{ position: "absolute", top: -12, left: -12, cursor: "move", borderRadius: "50%", background: C.green, padding: 5, zIndex: 110 }}
        onPointerDown={beginDrag}
        role="button" tabIndex={-1}
      >
        <GripVertical size={11} style={{ color: "#fff" }} />
      </div>

      {/* Delete */}
      <button
        className="ep-el-del"
        onClick={(e) => { e.stopPropagation(); onDelete(element.id); }}
        style={{ position: "absolute", top: -12, right: -12, borderRadius: "50%", background: "#e74c3c", border: "none", padding: 5, cursor: "pointer", zIndex: 110 }}
        type="button"
      >
        <X size={11} style={{ color: "#fff" }} />
      </button>

      {element.type === "text" ? (
        <div style={{ width: "100%", height: "100%", padding: 6 }}>
          <div
            ref={textRef}
            contentEditable={isSelected}
            suppressContentEditableWarning
            onBlur={onTextBlur}
            // Preserve cursor: don't update innerHTML if text matches
            style={textStyle}
            dangerouslySetInnerHTML={
              isSelected ? undefined : { __html: element.properties?.text ?? "" }
            }
          >
            {isSelected ? element.properties?.text ?? "" : undefined}
          </div>
        </div>
      ) : (
        <img
          src={element.properties?.src} alt="element" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 7, pointerEvents: "none" }}
        />
      )}

      {isSelected && (
        <>
          <ResizeHandle position="nw" onPointerDown={beginResize("nw")} />
          <ResizeHandle position="ne" onPointerDown={beginResize("ne")} />
          <ResizeHandle position="sw" onPointerDown={beginResize("sw")} />
          <ResizeHandle position="se" onPointerDown={beginResize("se")} />
        </>
      )}

      <style>{`
        .ep-el-grip,.ep-el-del{opacity:0;transition:opacity .15s}
        *:hover>.ep-el-grip,*:hover>.ep-el-del{opacity:1!important}
      `}</style>
    </div>
  );
});

// ─── Thumbnail item ───────────────────────────────────────────────────────────
const ThumbnailItem = memo(function ThumbnailItem({ page, index, pdfSource, pdfjsDocCache, isSelected, onSelect, onDelete }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;

    const drawBlank = () => {
      const scale = 120 / (page.width || 1);
      const w = Math.max(1, Math.floor((page.width || 595.28) * scale));
      const h = Math.max(1, Math.floor((page.height || 841.89) * scale));
      canvas.width = w; canvas.height = h;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    };

    const drawPdf = async () => {
      if (!pdfSource?.data) { drawBlank(); return; }
      const sid = pdfSource.id;
      let docPromise = pdfjsDocCache.current.get(sid);
      if (!docPromise) {
        docPromise = pdfjs.getDocument({ data: pdfSource.data.slice(0) }).promise;
        pdfjsDocCache.current.set(sid, docPromise);
      }
      const doc = await docPromise;
      const pdfPage = await doc.getPage(page.pdfPageNumber || 1);
      const bvp = pdfPage.getViewport({ scale: PDFJS_SCALE });
      const s = 120 / bvp.width;
      const vp = pdfPage.getViewport({ scale: PDFJS_SCALE * s });
      const w = Math.max(1, Math.floor(vp.width));
      const h = Math.max(1, Math.floor(vp.height));
      canvas.width = w; canvas.height = h;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { } renderTaskRef.current = null; }
      renderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport: vp });
      await renderTaskRef.current.promise;
    };

    (async () => {
      try {
        if (page.type === "pdf") await drawPdf(); else drawBlank();
      } catch { if (!cancelled) drawBlank(); }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { } renderTaskRef.current = null; }
    };
  }, [page.height, page.pdfPageNumber, page.type, page.width, pdfSource, pdfjsDocCache]);

  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
  }), [transform, transition, isDragging]);

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`ep-thumb${isSelected ? " active" : ""}`} onClick={() => onSelect(page.id)}>
        <div className="ep-thumb-inner">
          <div className="ep-thumb-canvas-wrap">
            <canvas ref={canvasRef} style={{ display: "block" }} />
            <div className="ep-thumb-num">#{index + 1}</div>
          </div>
          <div className="ep-thumb-info">
            <div className="ep-thumb-type">{page.type === "pdf" ? "PDF Page" : "Blank"}</div>
            <div className="ep-thumb-sub">
              {page.type === "pdf"
                ? `${pdfSource?.name || "PDF"} · p${page.pdfPageNumber || 1}`
                : `${Math.round(page.width)}×${Math.round(page.height)}`}
            </div>
          </div>
          <div {...attributes} {...listeners} className="ep-thumb-grip" title="Drag to reorder">
            <GripVertical size={14} />
          </div>
        </div>
        <button className="ep-thumb-del" onClick={(e) => { e.stopPropagation(); onDelete(page.id); }} title="Delete page" type="button">
          <Trash2 size={12} style={{ color: C.errText }} />
        </button>
      </div>
    </div>
  );
});

// ─── Page view ────────────────────────────────────────────────────────────────
const PageView = memo(function PageView({
  page, index, pdfSource, pdfjsDocCache,
  isSelected, selectedIds, registerPageNode,
  onSelectPage, onSelectElement, onShiftSelectElement,
  onUpdatePage, onUpdateElement, onDeleteElement, onDeletePage,
  onLayerChange, snapEnabled, gridEnabled, gridSize,
}) {
  const canvasRef = useRef(null);
  const pageRootRef = useRef(null);
  const overlayRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [toolbarAnchor, setToolbarAnchor] = useState(null);

  const selectedEl = useMemo(
    () => page.elements.find((e) => selectedIds.length === 1 && e.id === selectedIds[0]) ?? null,
    [page.elements, selectedIds]
  );
  const toolbarValue = useMemo(
    () => (!selectedEl || selectedEl.type !== "text" ? null : selectedEl.properties || {}),
    [selectedEl]
  );

  // Intersection observer for virtualization
  useEffect(() => {
    if (!pageRootRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.05 }
    );
    obs.observe(pageRootRef.current);
    return () => obs.disconnect();
  }, []);

  // ResizeObserver for scale tracking
  useEffect(() => {
    if (!pageRootRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 0;
      if (!w || !page.width) return;
      const scale = w / page.width;
      if (Number.isFinite(scale) && Math.abs((page.scale || 1) - scale) > 0.002) {
        onUpdatePage(page.id, { scale });
      }
    });
    ro.observe(pageRootRef.current);
    return () => ro.disconnect();
  }, [page.id, page.scale, page.width, onUpdatePage]);

  const renderBlank = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = page.scale || 1;
    const w = Math.floor(page.width * s), h = Math.floor(page.height * s);
    canvas.width = w; canvas.height = h;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
  }, [page.height, page.scale, page.width]);

  const renderPdf = useCallback(async () => {
    if (!pdfSource?.data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sid = pdfSource.id;
    let docPromise = pdfjsDocCache.current.get(sid);
    if (!docPromise) {
      docPromise = pdfjs.getDocument({ data: pdfSource.data.slice(0) }).promise;
      pdfjsDocCache.current.set(sid, docPromise);
    }
    const doc = await docPromise;
    const pdfPage = await doc.getPage(page.pdfPageNumber || 1);
    const baseVp = pdfPage.getViewport({ scale: PDFJS_SCALE });

    let containerW = pageRootRef.current?.clientWidth || 0;
    if (!containerW) {
      await new Promise((r) => requestAnimationFrame(r));
      containerW = pageRootRef.current?.clientWidth || baseVp.width;
    }
    const scale = containerW / baseVp.width;
    const viewport = pdfPage.getViewport({ scale: PDFJS_SCALE * scale });
    const cw = Math.floor(viewport.width), ch = Math.floor(viewport.height);
    canvas.width = cw; canvas.height = ch;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;

    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { } }
    renderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport });
    await renderTaskRef.current.promise;

    if (Math.abs((page.scale || 1) - scale) > 0.002) onUpdatePage(page.id, { scale });
    if (Math.abs(page.width - baseVp.width) > 0.5 || Math.abs(page.height - baseVp.height) > 0.5) {
      onUpdatePage(page.id, { width: baseVp.width, height: baseVp.height });
    }
  }, [onUpdatePage, page.height, page.id, page.pdfPageNumber, page.scale, page.width, pdfSource, pdfjsDocCache]);

  useEffect(() => {
    if (!visible) return;
    if (page.type === "blank") renderBlank();
    if (page.type === "pdf") renderPdf().catch(() => { });
    return () => { if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { } } };
  }, [page.type, page.scale, page.width, page.height, page.pdfPageNumber, pdfSource, visible, renderBlank, renderPdf]);

  const updateSelectedTextProps = useCallback((patch) => {
    if (!selectedEl || selectedEl.type !== "text") return;
    onUpdateElement(page.id, selectedEl.id, { properties: { ...selectedEl.properties, ...patch } });
  }, [onUpdateElement, page.id, selectedEl]);

  const ps = page.scale || 1;

  // Multi-select bounding box
  const multiBBox = useMemo(() => {
    if (selectedIds.length < 2) return null;
    const selectedEls = page.elements.filter((e) => selectedIds.includes(e.id));
    if (!selectedEls.length) return null;
    const lefts = selectedEls.map((e) => e.x * ps);
    const tops = selectedEls.map((e) => e.y * ps);
    const rights = selectedEls.map((e) => (e.x + (e.width ?? 0)) * ps);
    const bottoms = selectedEls.map((e) => (e.y + (e.height ?? 0)) * ps);
    return {
      left: Math.min(...lefts) - 4,
      top: Math.min(...tops) - 4,
      width: Math.max(...rights) - Math.min(...lefts) + 8,
      height: Math.max(...bottoms) - Math.min(...tops) + 8,
    };
  }, [selectedIds, page.elements, ps]);

  return (
    <div ref={(node) => registerPageNode(page.id, node)} className="ep-page-card">
      <div className="ep-page-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="ep-page-tag">Page {index + 1}</span>
          <span className="ep-page-tag" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {page.type === "pdf" ? <FileBox size={11} /> : <FileText size={11} />}
            {page.type === "pdf" ? `${pdfSource?.name || "PDF"} · #${page.pdfPageNumber || 1}` : "Blank"}
          </span>
        </div>
        <div className="ep-page-actions">
          {/* Layer controls — only show when element selected */}
          {selectedEl && (
            <div style={{ display: "flex", gap: 4 }}>
              <button className="ep-layer-btn" onClick={() => onLayerChange(page.id, selectedEl.id, "fwd")} title="Bring forward" type="button">
                <ChevronUp size={12} />
              </button>
              <button className="ep-layer-btn" onClick={() => onLayerChange(page.id, selectedEl.id, "bwd")} title="Send backward" type="button">
                <ChevronDown size={12} />
              </button>
              <button className="ep-layer-btn" onClick={() => onLayerChange(page.id, selectedEl.id, "front")} title="Bring to front" type="button">
                <Layers size={12} />
              </button>
            </div>
          )}
          <button className="ep-page-del-btn" onClick={() => onDeletePage(page.id)} type="button">
            <Trash2 size={12} /> Delete
          </button>
          <button className={`ep-page-sel-btn${isSelected ? " active" : ""}`} onClick={() => onSelectPage(page.id)} type="button">
            <FileEdit size={12} /> {isSelected ? "Selected" : "Select"}
          </button>
        </div>
      </div>

      <div className="ep-page-canvas-wrap">
        <div
          ref={pageRootRef}
          style={{
            position: "relative", background: "#fff", borderRadius: 10,
            border: `1px solid ${isSelected ? C.green : C.border}`,
            boxShadow: isSelected ? `0 0 0 2px ${C.green}22` : "0 2px 16px rgba(0,0,0,.06)",
            width: "min(820px, 100%)",
            aspectRatio: `${page.width} / ${page.height}`,
            transition: "border-color .2s, box-shadow .2s",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelectPage(page.id);
            if (!e.shiftKey) onSelectElement(null);
            setToolbarAnchor(null);
          }}
        >
          <canvas ref={canvasRef} style={{ display: "block", position: "absolute", left: 0, top: 0 }} />

          {/* Grid overlay */}
          {gridEnabled && (
            <GridOverlay width={page.width} height={page.height} size={gridSize} scale={ps} />
          )}

          <div
            ref={overlayRef}
            style={{
              position: "absolute", left: 0, top: 0,
              width: `${Math.floor(page.width * ps)}px`,
              height: `${Math.floor(page.height * ps)}px`,
            }}
          >
            <AnimatePresence>
              {isSelected && toolbarAnchor && toolbarValue && (
                <TextToolbar
                  position={{ left: toolbarAnchor.left, top: toolbarAnchor.top }}
                  value={toolbarValue}
                  onChange={updateSelectedTextProps}
                  onClose={() => onSelectElement(null)}
                />
              )}
            </AnimatePresence>

            {/* Multi-select bounding box */}
            {multiBBox && (
              <div className="ep-multi-bbox" style={{
                left: multiBBox.left, top: multiBBox.top,
                width: multiBBox.width, height: multiBBox.height,
              }} />
            )}

            {page.elements.map((el) => (
              <InteractiveElement
                key={el.id}
                element={el}
                page={page}
                pageScale={ps}
                isSelected={isSelected && selectedIds.length === 1 && selectedIds[0] === el.id}
                isMultiSelected={isSelected && selectedIds.length > 1 && selectedIds.includes(el.id)}
                onSelect={(id) => { onSelectPage(page.id); onSelectElement(id); }}
                onShiftSelect={(id) => { onSelectPage(page.id); onShiftSelectElement(id); }}
                onChange={(next) => onUpdateElement(page.id, el.id, next)}
                onDelete={(id) => onDeleteElement(page.id, id)}
                onToolbarAnchor={(pos) => {
                  if (!isSelected || !selectedIds.includes(el.id)) return;
                  const rect = overlayRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setToolbarAnchor({ left: pos.left - rect.left, top: pos.top - rect.top });
                }}
                snapEnabled={snapEnabled}
                gridEnabled={gridEnabled}
                gridSize={gridSize}
              />
            ))}
          </div>

          {page.type === "pdf" && !pdfSource?.data && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <div style={{ background: "rgba(245,245,243,.92)", borderRadius: 10, padding: "12px 18px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.black }}>Missing PDF source</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Re-upload to restore rendering.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Dot decoration ───────────────────────────────────────────────────────────
function DotGrid() {
  return (
    <div style={{ position: "absolute", top: 16, right: 18, display: "grid", gridTemplateColumns: "repeat(4,7px)", gap: 5, pointerEvents: "none" }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: C.dot, display: "block" }} />
      ))}
    </div>
  );
}

// ─── Zoom bar ─────────────────────────────────────────────────────────────────
function ZoomBar({ zoom, onZoom }) {
  return (
    <div className="ep-zoom-bar">
      <button className="ep-zoom-btn" onClick={() => onZoom(zoom - 0.1)} title="Zoom out" type="button">
        <ZoomOut size={13} />
      </button>
      <span className="ep-zoom-val">{Math.round(zoom * 100)}%</span>
      <button className="ep-zoom-btn" onClick={() => onZoom(zoom + 0.1)} title="Zoom in" type="button">
        <ZoomIn size={13} />
      </button>
    </div>
  );
}

// ─── Main EditorPro ───────────────────────────────────────────────────────────
export default function EditorPro() {
  const [state, dispatch] = useReducer(reducer, INIT);
  const {
    doc, pdfSources, fileName, selectedPageId, selectedIds,
    zoom, gridEnabled, gridSize, snapEnabled, isLoading, isExporting, error,
  } = state;

  // ── Toast notification ───────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // ── Share / Copy link ────────────────────────────────────────────────────
  const shareDoc = useCallback(async () => {
    try {
      // Build a compact sharable snapshot (no binary buffers)
      const snapshot = {
        fileName,
        pages: doc.pages.map((p) => ({
          id: p.id, type: p.type, width: p.width, height: p.height,
          elements: p.elements,
        })),
        exportedAt: new Date().toISOString(),
      };
      const json = JSON.stringify(snapshot);
      // Try writing to clipboard
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        showToast('✓ Document state copied to clipboard');
      } else {
        // Fallback: create a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('✓ Copied (fallback mode)');
      }
    } catch {
      showToast('⚠ Copy failed — check clipboard permissions');
    }
  }, [doc.pages, fileName, showToast]);

  // Undo/redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const pendingSnap = useRef(null);
  const lastSnapDoc = useRef(null);

  const pdfjsDocCache = useRef(new Map());
  const saveTimer = useRef(null);
  const pageNodes = useRef(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Undo/Redo ─────────────────────────────────────────────────────────────
  const snapDoc = useCallback(() => JSON.parse(JSON.stringify(doc)), [doc]);

  const pushHistory = useCallback(() => {
    if (pendingSnap.current) clearTimeout(pendingSnap.current);
    pendingSnap.current = setTimeout(() => {
      const snap = snapDoc();
      if (lastSnapDoc.current && JSON.stringify(snap) === JSON.stringify(lastSnapDoc.current)) return;
      undoStack.current = [snap, ...undoStack.current].slice(0, MAX_HISTORY);
      redoStack.current = [];
      lastSnapDoc.current = snap;
    }, 300);
  }, [snapDoc]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const current = snapDoc();
    redoStack.current = [current, ...redoStack.current].slice(0, MAX_HISTORY);
    const prev = undoStack.current.shift();
    lastSnapDoc.current = prev;
    dispatch({ t: "SET_DOC", doc: prev });
  }, [snapDoc]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    const current = snapDoc();
    undoStack.current = [current, ...undoStack.current].slice(0, MAX_HISTORY);
    const next = redoStack.current.shift();
    lastSnapDoc.current = next;
    dispatch({ t: "SET_DOC", doc: next });
  }, [snapDoc]);

  // Push history on significant doc changes
  useEffect(() => { pushHistory(); }, [doc.pages.length]); // eslint-disable-line

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const p = JSON.parse(saved);
          if (p?.doc?.pages) {
            dispatch({ t: "SET_DOC", doc: p.doc });
            dispatch({ t: "SET_FNAME", v: p.fileName || "" });
            dispatch({ t: "SEL_PAGE", pid: p.doc.pages[0]?.id ?? null, clr: true });
          }
        } catch { localStorage.removeItem(STORAGE_KEY); }
      } else {
        const leg = localStorage.getItem(LEGACY_SK);
        if (leg) {
          try {
            const p = JSON.parse(leg);
            const m = migrateLegacy(p.pages, p.fileName);
            dispatch({ t: "SET_DOC", doc: m.doc });
            dispatch({ t: "SET_FNAME", v: m.fileName });
            dispatch({ t: "SEL_PAGE", pid: m.doc.pages[0]?.id ?? null, clr: true });
          } catch { localStorage.removeItem(LEGACY_SK); }
        }
      }
      try {
        const cached = await idb.get(IDB_KEY);
        if (cached?.length) {
          const usable = cached.filter((s) => s?.data?.byteLength > 0);
          dispatch({ t: "SET_SOURCES", v: usable });
          if (usable.length !== cached.length) dispatch({ t: "SET_ERR", v: "Some PDFs couldn't be restored. Please re-upload." });
        } else {
          const leg = await idb.get(LEGACY_IDB);
          if (leg?.length) dispatch({ t: "SET_SOURCES", v: leg.filter((s) => s?.data?.byteLength > 0) });
        }
      } catch { /* IDB unavailable */ }
    })();
  }, []);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ doc, fileName }));
      if (pdfSources.length) idb.set(IDB_KEY, pdfSources).catch(() => { });
    }, 250);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [doc, fileName, pdfSources]);

  // ── Zoom with Ctrl+Wheel ───────────────────────────────────────────────────
  const viewportRef = useRef(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      dispatch({ t: "SET_ZOOM", v: clamp(state.zoom + delta, MIN_ZOOM, MAX_ZOOM) });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [state.zoom]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tgt = e.target;
      if (tgt.isContentEditable || tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y")) { e.preventDefault(); redo(); return; }
      if (ctrl && e.key === "d") {
        e.preventDefault();
        if (selectedPageId && selectedIds[0]) dispatch({ t: "DUP_EL", pid: selectedPageId, eid: selectedIds[0] });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        if (selectedPageId) dispatch({ t: "DEL_EL", pid: selectedPageId, eids: selectedIds });
        return;
      }
      // Arrow keys
      const STEP = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
      if (delta && selectedIds.length && selectedPageId) {
        e.preventDefault();
        const page = doc.pages.find((p) => p.id === selectedPageId);
        if (!page) return;
        selectedIds.forEach((eid) => {
          const el = page.elements.find((e) => e.id === eid);
          if (!el) return;
          dispatch({ t: "UPD_EL", pid: selectedPageId, eid, next: { x: el.x + delta[0], y: el.y + delta[1] } });
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, selectedIds, selectedPageId, doc.pages]);

  // ── Memos ─────────────────────────────────────────────────────────────────
  const selectedPage = useMemo(() => doc.pages.find((p) => p.id === selectedPageId) ?? null, [doc.pages, selectedPageId]);
  const pdfSourcesById = useMemo(() => new Map(pdfSources.map((s) => [s.id, s])), [pdfSources]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const registerPageNode = useCallback((id, node) => {
    if (node) pageNodes.current.set(id, node); else pageNodes.current.delete(id);
  }, []);

  const selectAndScroll = useCallback((pid) => {
    dispatch({ t: "SEL_PAGE", pid, clr: true });
    requestAnimationFrame(() => pageNodes.current.get(pid)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const updatePage = useCallback((pid, patch) => dispatch({ t: "UPD_PAGE", pid, patch }), []);
  const updateElement = useCallback((pid, eid, next) => dispatch({ t: "UPD_EL", pid, eid, next }), []);
  const deleteElement = useCallback((pid, eid) => dispatch({ t: "DEL_EL", pid, eids: [eid] }), []);
  const deletePage = useCallback((pid) => dispatch({ t: "DEL_PAGE", pid }), []);

  const addBlankPage = useCallback(() => {
    const page = mkBlankPage();
    dispatch({ t: "ADD_PAGE", page });
    if (!fileName) dispatch({ t: "SET_FNAME", v: "Untitled Document.pdf" });
  }, [fileName]);

  const appendPdf = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") return;
    dispatch({ t: "SET_LOADING", v: true });
    dispatch({ t: "SET_ERR", v: null });
    if (!fileName) dispatch({ t: "SET_FNAME", v: file.name });
    try {
      const buf = await file.arrayBuffer();
      const sourceId = uid("pdf");
      dispatch({ t: "ADD_SOURCE", v: { id: sourceId, name: file.name, data: buf.slice(0) } });
      const pdfDoc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pg = await pdfDoc.getPage(i);
        const vp = pg.getViewport({ scale: PDFJS_SCALE });
        const page = { id: uid("page"), type: "pdf", pdfSourceId: sourceId, pdfPageNumber: i, width: vp.width, height: vp.height, scale: 1, elements: [] };
        dispatch({ t: "ADD_PAGE", page });
      }
    } catch { dispatch({ t: "SET_ERR", v: "Document load failed." }); }
    finally { dispatch({ t: "SET_LOADING", v: false }); }
  }, [fileName]);

  const removePdfSource = useCallback((sid) => {
    dispatch({ t: "SET_SOURCES", v: pdfSources.filter((s) => s.id !== sid) });
    const newPages = doc.pages.filter((p) => p.pdfSourceId !== sid);
    dispatch({ t: "SET_DOC", doc: { ...doc, pages: newPages } });
    pdfjsDocCache.current.delete(sid);
  }, [doc, pdfSources]);

  const addText = useCallback(() => {
    if (!selectedPageId) return;
    dispatch({ t: "ADD_EL", pid: selectedPageId, el: mkTextEl() });
  }, [selectedPageId]);

  const addImage = useCallback(() => {
    if (!selectedPageId) return;
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
      });
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { const s = Math.min(1, 320 / (img.width || 320)); resolve({ width: (img.width || 320) * s, height: (img.height || 240) * s }); };
        img.src = dataUrl;
      });
      dispatch({ t: "ADD_EL", pid: selectedPageId, el: mkImageEl(dataUrl, dims) });
    };
    input.click();
  }, [selectedPageId]);

  const onDragEnd = useCallback(({ active, over }) => {
    if (!active?.id || !over?.id || active.id === over.id) return;
    const pages = doc.pages;
    const oi = pages.findIndex((p) => p.id === active.id);
    const ni = pages.findIndex((p) => p.id === over.id);
    if (oi < 0 || ni < 0) return;
    dispatch({ t: "REORDER_PAGES", pages: arrayMove(pages, oi, ni) });
  }, [doc.pages]);

  const exportPdf = useCallback(async () => {
    if (!doc.pages.length) return;
    dispatch({ t: "SET_EXPORTING", v: true });
    dispatch({ t: "SET_ERR", v: null });
    try {
      const outPdf = await PDFDocument.create();
      const loaded = new Map();
      for (const s of pdfSources) {
        if (!s?.data) continue;
        loaded.set(s.id, await PDFDocument.load(s.data.slice(0)));
      }
      const fontCache = new Map();
      const getFontPair = async (ff) => {
        const { regular, bold } = fontPair(ff);
        const key = `${regular}|${bold}`;
        if (fontCache.has(key)) return fontCache.get(key);
        const pair = { reg: await outPdf.embedFont(regular), bold: await outPdf.embedFont(bold) };
        fontCache.set(key, pair); return pair;
      };
      for (const p of doc.pages) {
        let outPage;
        if (p.type === "pdf" && p.pdfSourceId && loaded.has(p.pdfSourceId)) {
          const [copied] = await outPdf.copyPages(loaded.get(p.pdfSourceId), [(p.pdfPageNumber || 1) - 1]);
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
            const fs = clamp(Number(el.properties?.fontSize ?? 16), 6, 200);
            const { reg, bold } = await getFontPair(el.properties?.fontFamily);
            const font = el.properties?.fontWeight === "bold" ? bold : reg;
            const mw = Number.isFinite(el.width) ? el.width : undefined;
            const align = el.properties?.align || "left";
            const smw = mw && mw > 0 ? mw : undefined;
            const fl = (el.properties?.text ?? "").split("\n")[0] ?? "";
            const flw = font.widthOfTextAtSize(fl, fs);
            let x = el.x;
            if (smw && align === "center") x = el.x + (smw - flw) / 2;
            if (smw && align === "right") x = el.x + (smw - flw);
            outPage.drawText(text, {
              x: clamp(x, 0, pw), y: clamp(ph - el.y - fs, 0, ph),
              size: fs, font, color: hexRgb(el.properties?.color),
              maxWidth: smw, lineHeight: fs * 1.2,
              rotate: el.rotation ? degrees(el.rotation) : undefined,
            });
          }
          if (el.type === "image") {
            const src = el.properties?.src;
            if (!src) continue;
            const imgBytes = await fetch(src).then((r) => r.arrayBuffer());
            const isPng = src.startsWith("data:image/png") || src.toLowerCase().includes("png");
            const image = isPng ? await outPdf.embedPng(imgBytes) : await outPdf.embedJpg(imgBytes);
            const w = Number.isFinite(el.width) ? el.width : image.width;
            const h = Number.isFinite(el.height) ? el.height : image.height;
            outPage.drawImage(image, {
              x: clamp(el.x, 0, pw), y: clamp(ph - el.y - h, 0, ph),
              width: clamp(w, 1, pw), height: clamp(h, 1, ph),
              rotate: el.rotation ? degrees(el.rotation) : undefined,
            });
          }
        }
      }
      const bytes = await outPdf.save();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      a.download = fileName ? fileName.replace(/\.pdf$/i, "") + "-export.pdf" : "export.pdf";
      a.click();
    } catch (err) {
      dispatch({ t: "SET_ERR", v: `Export error: ${err?.message || "Unknown"}` });
    } finally {
      dispatch({ t: "SET_EXPORTING", v: false });
    }
  }, [doc.pages, fileName, pdfSources]);

  const resetWorkspace = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_SK);
    await idb.clear(); window.location.reload();
  }, []);

  const layerChange = useCallback((pid, eid, dir) => {
    dispatch({ t: "LAYER", pid, eid, dir });
  }, []);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      {/* Toast */}
      {toast && <div className="ep-toast">{toast}</div>}
      <BackButton />
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.pageBg }}>

        {/* Navbar */}
        <nav className="ep-nav">
          <div className="ep-nav-logo" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={logo} alt="Logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
            ATSTRACK-PDFS <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 4 }}>Editor</span>
          </div>
          <div className="ep-nav-right">
            {/* Undo / Redo */}
            <button className="ep-hist-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" type="button">
              <RotateCcw size={12} /> Undo
            </button>
            <button className="ep-hist-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" type="button">
              <RotateCw size={12} /> Redo
            </button>
            {/* Zoom */}
            <ZoomBar zoom={zoom} onZoom={(v) => dispatch({ t: "SET_ZOOM", v })} />
            {/* Grid toggle */}
            <button
              className="ep-nav-pill"
              onClick={() => dispatch({ t: "SET_GRID", enabled: !gridEnabled })}
              style={gridEnabled ? { background: C.beige, borderColor: "#ccc" } : {}}
              type="button"
            >
              Grid {gridEnabled ? "On" : "Off"}
            </button>
            {/* Snap toggle */}
            <button
              className="ep-nav-pill"
              onClick={() => dispatch({ t: "SET_SNAP", v: !snapEnabled })}
              style={snapEnabled ? { background: C.beige, borderColor: "#ccc" } : {}}
              type="button"
            >
              Snap {snapEnabled ? "On" : "Off"}
            </button>
            <button
              className="ep-nav-pill"
              onClick={shareDoc}
              title="Copy document state to clipboard"
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
              </svg>
              Share
            </button>
          </div>
        </nav>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="ep-root">

            {/* Sidebar */}
            <aside className="ep-sidebar">
              <div style={{ marginBottom: 20 }}>
                <div className="ep-section-label">Design Tools</div>
                <div className="ep-tool-grid">
                  <button className="ep-tool-btn" onClick={addText} disabled={!selectedPageId} type="button">
                    <div className="ep-tool-icon"><Type size={16} /></div>
                    Text
                  </button>
                  <button className="ep-tool-btn" onClick={addImage} disabled={!selectedPageId} type="button">
                    <div className="ep-tool-icon"><ImageIcon size={16} /></div>
                    Image
                  </button>
                  {selectedIds.length === 1 && selectedPageId && (
                    <>
                      <button className="ep-tool-btn" onClick={() => dispatch({ t: "DUP_EL", pid: selectedPageId, eid: selectedIds[0] })} type="button">
                        <div className="ep-tool-icon"><Copy size={16} /></div>
                        Duplicate
                      </button>
                      <button className="ep-tool-btn" onClick={() => dispatch({ t: "DEL_EL", pid: selectedPageId, eids: selectedIds })} type="button"
                        style={{ borderColor: "#fccaca" }}>
                        <div className="ep-tool-icon" style={{ background: "#FEF2F2" }}><Trash2 size={16} style={{ color: C.errText }} /></div>
                        <span style={{ color: C.errText }}>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Shortcuts hint */}
              <div style={{ marginBottom: 20, padding: "10px 12px", borderRadius: 10, background: "#F2EDE4", border: `1px solid ${C.beige}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: C.muted, marginBottom: 6 }}>Shortcuts</div>
                {[
                  ["Ctrl+Z", "Undo"], ["Ctrl+Shift+Z", "Redo"],
                  ["Ctrl+D", "Duplicate"], ["Delete", "Remove"],
                  ["Shift+Click", "Multi-select"], ["↑↓←→", "Nudge 1pt"],
                  ["Shift+↑↓←→", "Nudge 10pt"], ["Ctrl+Scroll", "Zoom"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <code style={{ fontSize: 9, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px", color: C.black }}>{k}</code>
                    <span style={{ fontSize: 9, color: C.muted }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Upload */}
              <div style={{ marginBottom: 20 }}>
                <div className="ep-section-label">Upload</div>
                <label className="ep-upload-label">
                  <Upload size={13} /> Append PDF
                  <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => appendPdf(e.target.files?.[0])} />
                </label>
                <div style={{ marginTop: 10 }}>
                  {pdfSources.length ? pdfSources.map((b) => (
                    <div key={b.id} className="ep-source-item">
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <FileBox size={12} style={{ color: C.muted, flexShrink: 0 }} />
                        <span className="ep-source-name">{b.name}</span>
                      </div>
                      <button className="ep-source-rm" onClick={() => removePdfSource(b.id)} title="Remove" type="button">
                        <XCircle size={13} />
                      </button>
                    </div>
                  )) : <p style={{ fontSize: 11, color: C.muted, paddingLeft: 2 }}>No PDFs appended yet.</p>}
                </div>
              </div>

              {/* Pages */}
              <div style={{ marginBottom: 20 }}>
                <div className="ep-section-label">Pages</div>
                <button className="ep-add-page-btn" onClick={addBlankPage} type="button">
                  <Plus size={13} /> Add Blank Page
                </button>
                <div style={{ marginTop: 10 }}>
                  <SortableContext items={doc.pages} strategy={rectSortingStrategy}>
                    {doc.pages.map((p, idx) => (
                      <ThumbnailItem
                        key={p.id} page={p} index={idx}
                        pdfSource={p.type === "pdf" ? pdfSourcesById.get(p.pdfSourceId) : null}
                        pdfjsDocCache={pdfjsDocCache}
                        isSelected={selectedPageId === p.id}
                        onSelect={selectAndScroll}
                        onDelete={deletePage}
                      />
                    ))}
                  </SortableContext>
                  {!doc.pages.length && <p style={{ fontSize: 11, color: C.muted, paddingLeft: 2 }}>No pages yet.</p>}
                </div>
              </div>

              {/* Footer */}
              <div className="ep-sidebar-footer">
                <button className="ep-export-btn" onClick={exportPdf} disabled={!doc.pages.length || isExporting} type="button">
                  {isExporting ? <Loader2 size={14} style={{ animation: "ep-spin .8s linear infinite" }} /> : <Download size={14} />}
                  Export PDF
                </button>
                <button className="ep-reset-btn" onClick={resetWorkspace} type="button">Reset Workspace</button>
              </div>
            </aside>

            {/* Main canvas */}
            <main className="ep-main">
              <div
                ref={viewportRef}
                className="ep-canvas-viewport"
                style={{ cursor: "default" }}
              >
                <div
                  className="ep-canvas-inner"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                >
                  <div style={{ maxWidth: 960, margin: "0 auto" }}>
                    {error && <div className="ep-error">{error}</div>}

                    {/* Header bar */}
                    <div className="ep-header-bar" style={{ position: "relative" }}>
                      <DotGrid />
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div className="ep-header-icon"><FileEdit size={20} /></div>
                        <div>
                          <div className="ep-doc-name">{fileName || "Untitled Workspace"}</div>
                          <div className="ep-doc-meta">
                            {doc.pages.length} page{doc.pages.length !== 1 ? "s" : ""}
                            {selectedIds.length > 1 ? ` · ${selectedIds.length} elements selected` : selectedPage ? " · Page selected" : ""}
                          </div>
                        </div>
                      </div>
                      <div className="ep-header-actions">
                        <label className="ep-nav-pill" style={{ cursor: "pointer" }}>
                          <Upload size={12} /> Append PDF
                          <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => appendPdf(e.target.files?.[0])} />
                        </label>
                        <button className="ep-nav-pill" onClick={addBlankPage} type="button">
                          <Plus size={12} /> Blank Page
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                      <div className="ep-loading">
                        <div className="ep-spinner" />
                        <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>
                          Processing Document…
                        </p>
                      </div>
                    ) : doc.pages.length ? (
                      doc.pages.map((page, idx) => (
                        <PageView
                          key={page.id}
                          page={page}
                          index={idx}
                          pdfSource={page.type === "pdf" ? pdfSourcesById.get(page.pdfSourceId) : null}
                          pdfjsDocCache={pdfjsDocCache}
                          isSelected={selectedPageId === page.id}
                          selectedIds={selectedPageId === page.id ? selectedIds : []}
                          registerPageNode={registerPageNode}
                          onSelectPage={(id) => dispatch({ t: "SEL_PAGE", pid: id })}
                          onSelectElement={(id) => dispatch({ t: "SEL_ELS", ids: id ? [id] : [] })}
                          onShiftSelectElement={(id) => dispatch({ t: "TOG_EL", id })}
                          onUpdatePage={updatePage}
                          onUpdateElement={updateElement}
                          onDeleteElement={deleteElement}
                          onDeletePage={deletePage}
                          onLayerChange={layerChange}
                          snapEnabled={snapEnabled}
                          gridEnabled={gridEnabled}
                          gridSize={gridSize}
                        />
                      ))
                    ) : (
                      <div className="ep-empty">
                        <div className="ep-empty-icon">✏️</div>
                        <h2 style={{ fontFamily: F.serif, fontSize: 26, fontWeight: 400, color: C.black, marginBottom: 8, letterSpacing: "-0.01em" }}>
                          Editor Workspace
                        </h2>
                        <p style={{ fontSize: 13, color: C.muted, maxWidth: 320, lineHeight: 1.7, marginBottom: 28, fontWeight: 300 }}>
                          Create designs from scratch or append a PDF. Pages are always appended — never overwritten.
                        </p>
                        <div style={{ display: "flex", gap: 10 }}>
                          <button className="ep-nav-pill" style={{ padding: "10px 22px", fontSize: 13 }} onClick={addBlankPage} type="button">
                            Blank Canvas
                          </button>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 22px", borderRadius: 999, background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F.sans }}>
                            <Upload size={13} /> Upload PDF
                            <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => appendPdf(e.target.files?.[0])} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </main>

          </div>
        </DndContext>
      </div>
    </>
  );
}
