/**
 * elementUtils.js
 * Element creation, snapping, alignment, and geometry helpers.
 */

import { rgb, StandardFonts } from "pdf-lib";

// ─── Core utils ───────────────────────────────────────────────────────────────

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function uid(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function hexToRgbColor(hex) {
  const safe = typeof hex === "string" ? hex : "#000000";
  if (!/^#([0-9a-fA-F]{6})$/.test(safe)) return rgb(0, 0, 0);
  return rgb(
    parseInt(safe.slice(1, 3), 16) / 255,
    parseInt(safe.slice(3, 5), 16) / 255,
    parseInt(safe.slice(5, 7), 16) / 255,
  );
}

// ─── Element factories ────────────────────────────────────────────────────────

export function createTextElement(overrides = {}) {
  return {
    id: uid("el"),
    type: "text",
    x: 72,
    y: 96,
    width: 260,
    height: 40,
    rotation: 0,
    zIndex: 0,
    properties: {
      text: "Add text",
      fontSize: 16,
      fontFamily: "Helvetica",
      color: "#000000",
      align: "left",
      fontWeight: "normal",
    },
    ...overrides,
  };
}

export function createImageElement(src, dimsPoints, overrides = {}) {
  const width = clamp(dimsPoints.width, 40, 420);
  const height = clamp(dimsPoints.height, 40, 420);
  return {
    id: uid("el"),
    type: "image",
    x: 72,
    y: 140,
    width,
    height,
    rotation: 0,
    zIndex: 0,
    properties: { src },
    ...overrides,
  };
}

export function cloneElement(el, offsetX = 16, offsetY = 16) {
  return {
    ...el,
    id: uid("el"),
    x: el.x + offsetX,
    y: el.y + offsetY,
    properties: { ...el.properties },
  };
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

export function getElementBounds(el) {
  return {
    left: el.x,
    top: el.y,
    right: el.x + (el.width ?? 0),
    bottom: el.y + (el.height ?? 0),
    cx: el.x + (el.width ?? 0) / 2,
    cy: el.y + (el.height ?? 0) / 2,
  };
}

export function getBoundingBoxOfElements(elements) {
  if (!elements.length) return null;
  const bounds = elements.map(getElementBounds);
  return {
    left: Math.min(...bounds.map((b) => b.left)),
    top: Math.min(...bounds.map((b) => b.top)),
    right: Math.max(...bounds.map((b) => b.right)),
    bottom: Math.max(...bounds.map((b) => b.bottom)),
  };
}

// ─── Snap system ──────────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 8; // pixels in point space

export function computeSnapGuides(
  movingEl,
  page,
  otherElements,
  snapEnabled,
  gridEnabled,
  gridSize,
) {
  if (!snapEnabled)
    return { snappedX: movingEl.x, snappedY: movingEl.y, guides: [] };

  const guides = [];
  let snappedX = movingEl.x;
  let snappedY = movingEl.y;

  const elW = movingEl.width ?? 0;
  const elH = movingEl.height ?? 0;

  // Grid snap
  if (gridEnabled && gridSize > 0) {
    snappedX = Math.round(movingEl.x / gridSize) * gridSize;
    snappedY = Math.round(movingEl.y / gridSize) * gridSize;
    return { snappedX, snappedY, guides: [] };
  }

  // Page center guides
  const pageCX = page.width / 2;
  const pageCY = page.height / 2;

  const snapTargetsX = [
    { val: 0, label: "page-left" },
    { val: pageCX, label: "page-cx" },
    { val: page.width, label: "page-right" },
    { val: pageCX - elW / 2, label: "page-cx-el" }, // element center at page center
  ];
  const snapTargetsY = [
    { val: 0, label: "page-top" },
    { val: pageCY, label: "page-cy" },
    { val: page.height, label: "page-bottom" },
    { val: pageCY - elH / 2, label: "page-cy-el" },
  ];

  // Other element snap targets
  for (const other of otherElements) {
    if (other.id === movingEl.id) continue;
    const b = getElementBounds(other);
    snapTargetsX.push(
      { val: b.left, label: `el-${other.id}-left` },
      { val: b.right, label: `el-${other.id}-right` },
      { val: b.cx, label: `el-${other.id}-cx` },
      { val: b.right, label: `el-${other.id}-right-align` }, // right-align to other's right
    );
    snapTargetsY.push(
      { val: b.top, label: `el-${other.id}-top` },
      { val: b.bottom, label: `el-${other.id}-bottom` },
      { val: b.cy, label: `el-${other.id}-cy` },
    );
  }

  // Find closest X snap
  let bestDX = SNAP_THRESHOLD;
  for (const t of snapTargetsX) {
    const dx = Math.abs(movingEl.x - t.val);
    if (dx < bestDX) {
      bestDX = dx;
      snappedX = t.val;
      guides.push({ axis: "x", value: t.val, label: t.label });
    }
    // Also snap element right edge
    const dxR = Math.abs(movingEl.x + elW - t.val);
    if (dxR < bestDX) {
      bestDX = dxR;
      snappedX = t.val - elW;
      guides.push({ axis: "x", value: t.val, label: t.label });
    }
  }

  // Find closest Y snap
  let bestDY = SNAP_THRESHOLD;
  for (const t of snapTargetsY) {
    const dy = Math.abs(movingEl.y - t.val);
    if (dy < bestDY) {
      bestDY = dy;
      snappedY = t.val;
      guides.push({ axis: "y", value: t.val, label: t.label });
    }
    const dyB = Math.abs(movingEl.y + elH - t.val);
    if (dyB < bestDY) {
      bestDY = dyB;
      snappedY = t.val - elH;
      guides.push({ axis: "y", value: t.val, label: t.label });
    }
  }

  return { snappedX, snappedY, guides };
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

export function mapFontFamilyToStandardFonts(fontFamily) {
  const f = (fontFamily || "Helvetica").toLowerCase();
  if (f.includes("times")) {
    return {
      regular: StandardFonts.TimesRoman,
      bold: StandardFonts.TimesRomanBold,
    };
  }
  if (f.includes("courier")) {
    return { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold };
  }
  return {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
  };
}
