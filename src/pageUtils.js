/**
 * pageUtils.js
 * Page creation, migration from legacy format, and page-level helpers.
 */

import { uid } from "./elementUtils";

export const PDFJS_POINTS_SCALE = 72 / 96;

// ─── Factories ────────────────────────────────────────────────────────────────

export function createBlankPage(overrides = {}) {
    return {
        id: uid("page"),
        type: "blank",
        width: 595.28,
        height: 841.89,
        scale: 1,
        elements: [],
        ...overrides,
    };
}

export function createPdfPage(pdfSourceId, pdfPageNumber, width, height) {
    return {
        id: uid("page"),
        type: "pdf",
        pdfSourceId,
        pdfPageNumber,
        width,
        height,
        scale: 1,
        elements: [],
    };
}

// ─── Migration ────────────────────────────────────────────────────────────────

export function migrateLegacyState(legacyPages, legacyFileName) {
    const pages = (legacyPages || []).map((p) => {
        const type = p.type === "pdf" ? "pdf" : "blank";
        const width =
            typeof p.width === "number" ? p.width * PDFJS_POINTS_SCALE : 595.28;
        const height =
            typeof p.height === "number" ? p.height * PDFJS_POINTS_SCALE : 841.89;

        const elements = (p.elements || [])
            .map((el) => {
                if (el.type === "text") {
                    return {
                        id: el.id || uid("el"),
                        type: "text",
                        x: typeof el.x === "number" ? el.x : 72,
                        y: typeof el.y === "number" ? el.y : 96,
                        width: typeof el.width === "number" ? el.width : 260,
                        height: typeof el.height === "number" ? el.height : 40,
                        rotation: typeof el.rotation === "number" ? el.rotation : 0,
                        zIndex: 0,
                        properties: {
                            text: el.value ?? el.properties?.text ?? "Add text",
                            fontSize: el.fontSize ?? el.properties?.fontSize ?? 16,
                            fontFamily:
                                el.fontFamily ?? el.properties?.fontFamily ?? "Helvetica",
                            color: el.color ?? el.properties?.color ?? "#000000",
                            align: el.align ?? el.properties?.align ?? "left",
                            fontWeight:
                                (el.fontWeight ?? el.properties?.fontWeight) === "bold"
                                    ? "bold"
                                    : "normal",
                        },
                    };
                }
                if (el.type === "image") {
                    return {
                        id: el.id || uid("el"),
                        type: "image",
                        x: typeof el.x === "number" ? el.x : 72,
                        y: typeof el.y === "number" ? el.y : 140,
                        width: typeof el.width === "number" ? el.width : 240,
                        height: typeof el.height === "number" ? el.height : 160,
                        rotation: typeof el.rotation === "number" ? el.rotation : 0,
                        zIndex: 0,
                        properties: { src: el.src ?? el.properties?.src },
                    };
                }
                return null;
            })
            .filter(Boolean);

        const migrated = {
            id: p.id || uid("page"),
            type,
            width,
            height,
            scale: typeof p.scale === "number" ? p.scale : 1,
            elements,
        };

        if (type === "pdf") {
            migrated.pdfPageNumber = (p.originalPageIndex ?? 0) + 1;
            migrated.pdfSourceId = p.bufferId ?? p.pdfSourceId ?? null;
        }

        return migrated;
    });

    return { fileName: legacyFileName || "", doc: { pages } };
}

// ─── Page info helpers ────────────────────────────────────────────────────────

export function getPageLabel(page, pdfSource) {
    if (page.type === "pdf") {
        return `${pdfSource?.name ?? "PDF"} · p${page.pdfPageNumber ?? 1}`;
    }
    return `${Math.round(page.width)} × ${Math.round(page.height)} pt`;
}

export function getPageTypeLabel(page) {
    return page.type === "pdf" ? "PDF Page" : "Blank Page";
}
