import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    Download,
    FileBox,
    FileEdit,
    FileText,
    GripVertical,
    Image as ImageIcon,
    Loader2,
    Plus,
    Trash2,
    Type,
    Upload,
    X,
    XCircle,
} from "lucide-react";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";

import Navbar from "../components/Navbar";
import { auth } from "../firebase";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const STORAGE_KEY = "editor-doc";
const IDB_KEY = "editor-pdf-sources";
const LEGACY_STORAGE_KEY = "pdf_pro_editor_state";
const LEGACY_IDB_KEY = "pdf_buffers_cache";

const PDFJS_POINTS_SCALE = 72 / 96;

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

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function uid(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hexToRgbColor(hex) {
    const safe = typeof hex === "string" ? hex : "#000000";
    if (!/^#([0-9a-fA-F]{6})$/.test(safe)) return rgb(0, 0, 0);
    const r = parseInt(safe.slice(1, 3), 16) / 255;
    const g = parseInt(safe.slice(3, 5), 16) / 255;
    const b = parseInt(safe.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
}

function mapFontFamilyToStandardFonts(fontFamily) {
    const f = (fontFamily || "Helvetica").toLowerCase();
    if (f.includes("times")) return { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold };
    if (f.includes("courier")) return { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold };
    return { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold };
}

function createBlankPage() {
    return {
        id: uid("page"),
        type: "blank",
        width: 595.28,
        height: 841.89,
        scale: 1,
        elements: [],
    };
}

function createTextElement() {
    return {
        id: uid("el"),
        type: "text",
        x: 72,
        y: 96,
        width: 260,
        height: 40,
        rotation: 0,
        properties: {
            text: "Add text",
            fontSize: 16,
            fontFamily: "Helvetica",
            color: "#000000",
            align: "left",
            fontWeight: "normal",
        },
    };
}

function createImageElement(src, dimsPoints) {
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
        properties: {
            src,
        },
    };
}

function migrateLegacyState(legacyPages, legacyFileName) {
    const pages = (legacyPages || []).map((p) => {
        const type = p.type === "pdf" ? "pdf" : "blank";
        const width = typeof p.width === "number" ? p.width * PDFJS_POINTS_SCALE : 595.28;
        const height = typeof p.height === "number" ? p.height * PDFJS_POINTS_SCALE : 841.89;

        const elements = (p.elements || []).map((el) => {
            if (el.type === "text") {
                return {
                    id: el.id || uid("el"),
                    type: "text",
                    x: typeof el.x === "number" ? el.x : 72,
                    y: typeof el.y === "number" ? el.y : 96,
                    width: typeof el.width === "number" ? el.width : 260,
                    height: typeof el.height === "number" ? el.height : 40,
                    rotation: typeof el.rotation === "number" ? el.rotation : 0,
                    properties: {
                        text: el.value ?? el.properties?.text ?? "Add text",
                        fontSize: el.fontSize ?? el.properties?.fontSize ?? 16,
                        fontFamily: el.fontFamily ?? el.properties?.fontFamily ?? "Helvetica",
                        color: el.color ?? el.properties?.color ?? "#000000",
                        align: el.align ?? el.properties?.align ?? "left",
                        fontWeight:
                            (el.fontWeight ?? el.properties?.fontWeight) === "bold" ? "bold" : "normal",
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
                    properties: { src: el.src ?? el.properties?.src },
                };
            }

            return null;
        }).filter(Boolean);

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

    return {
        fileName: legacyFileName || "",
        doc: { pages },
    };
}

function TextToolbar({ position, value, onChange, onClose }) {
    if (!value) return null;

    return (
        <Motion.div
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            className="absolute z-[200] flex items-center gap-2 rounded-2xl bg-slate-900/90 border border-white/10 p-2 shadow-2xl backdrop-blur-xl"
            style={{ left: position.left, top: position.top, transform: "translate(-50%, -100%)" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-2 px-2 border-r border-white/10">
                <Type size={14} className="text-slate-400" />
                <input
                    type="number"
                    min={6}
                    max={200}
                    value={value.fontSize ?? 16}
                    onChange={(e) => onChange({ fontSize: clamp(parseInt(e.target.value || "16", 10), 6, 200) })}
                    className="w-14 bg-transparent text-sm font-bold text-white outline-none"
                />
            </div>

            <div className="flex items-center gap-2 px-2 border-r border-white/10">
                <select
                    value={value.fontFamily ?? "Helvetica"}
                    onChange={(e) => onChange({ fontFamily: e.target.value })}
                    className="bg-transparent text-sm font-bold text-white outline-none"
                >
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                </select>
            </div>

            <div className="flex items-center gap-1 px-1 border-r border-white/10">
                <button
                    onClick={() => onChange({ fontWeight: value.fontWeight === "bold" ? "normal" : "bold" })}
                    className={`p-1.5 rounded-lg transition-colors ${value.fontWeight === "bold" ? "bg-[var(--primary)] text-white" : "hover:bg-white/5 text-slate-400"
                        }`}
                    type="button"
                >
                    <Bold size={16} />
                </button>
            </div>

            <div className="flex items-center gap-1 px-1 border-r border-white/10">
                <button
                    onClick={() => onChange({ align: "left" })}
                    className={`p-1.5 rounded-lg transition-colors ${value.align === "left" ? "bg-[var(--primary)] text-white" : "hover:bg-white/5 text-slate-400"
                        }`}
                    type="button"
                >
                    <AlignLeft size={16} />
                </button>
                <button
                    onClick={() => onChange({ align: "center" })}
                    className={`p-1.5 rounded-lg transition-colors ${value.align === "center" ? "bg-[var(--primary)] text-white" : "hover:bg-white/5 text-slate-400"
                        }`}
                    type="button"
                >
                    <AlignCenter size={16} />
                </button>
                <button
                    onClick={() => onChange({ align: "right" })}
                    className={`p-1.5 rounded-lg transition-colors ${value.align === "right" ? "bg-[var(--primary)] text-white" : "hover:bg-white/5 text-slate-400"
                        }`}
                    type="button"
                >
                    <AlignRight size={16} />
                </button>
            </div>

            <div className="flex items-center gap-2 pl-2">
                <div
                    className="relative h-6 w-6 rounded-md border border-white/20 overflow-hidden cursor-pointer"
                    style={{ backgroundColor: value.color || "#000000" }}
                >
                    <input
                        type="color"
                        value={value.color || "#000000"}
                        onChange={(e) => onChange({ color: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                </div>
            </div>

            <button
                onClick={onClose}
                className="ml-1 p-2 hover:bg-white/10 text-slate-400 rounded-lg transition-colors"
                type="button"
            >
                <X size={16} />
            </button>
        </Motion.div>
    );
}

function ResizeHandle({ position, onPointerDown }) {
    const base =
        "absolute h-3 w-3 rounded-full bg-white shadow-md border border-slate-200 z-[120]";

    const map = {
        nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
        ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
        sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
        se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
    };

    return (
        <div
            className={`${base} ${map[position]}`}
            onPointerDown={onPointerDown}
            role="button"
            tabIndex={-1}
        />
    );
}

function InteractiveElement({
    element,
    pageScale,
    isSelected,
    onSelect,
    onChange,
    onDelete,
    onToolbarAnchor,
}) {
    const rootRef = useRef(null);
    const rafRef = useRef(0);
    const dragStateRef = useRef(null);

    const screen = useMemo(() => {
        const w = typeof element.width === "number" ? element.width * pageScale : undefined;
        const h = typeof element.height === "number" ? element.height * pageScale : undefined;
        return {
            left: element.x * pageScale,
            top: element.y * pageScale,
            width: w,
            height: h,
            rotate: element.rotation || 0,
        };
    }, [element, pageScale]);

    useEffect(() => {
        if (!isSelected || !rootRef.current) return;
        const r = rootRef.current.getBoundingClientRect();
        onToolbarAnchor({
            left: r.left + r.width / 2,
            top: r.top - 10,
        });
    }, [isSelected, screen.left, screen.top, screen.width, screen.height, onToolbarAnchor]);

    const setWithRaf = useCallback(
        (next) => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => onChange(next));
        },
        [onChange],
    );

    const beginDrag = useCallback(
        (e) => {
            e.stopPropagation();
            onSelect(element.id);
            const start = { x: e.clientX, y: e.clientY };
            dragStateRef.current = { type: "move", start, origin: { x: element.x, y: element.y } };
            e.currentTarget.setPointerCapture?.(e.pointerId);
        },
        [element.id, element.x, element.y, onSelect],
    );

    const beginResize = useCallback(
        (corner) => (e) => {
            e.stopPropagation();
            onSelect(element.id);
            const start = { x: e.clientX, y: e.clientY };
            dragStateRef.current = {
                type: "resize",
                corner,
                start,
                origin: {
                    x: element.x,
                    y: element.y,
                    width: element.width ?? 240,
                    height: element.height ?? 160,
                },
            };
            e.currentTarget.setPointerCapture?.(e.pointerId);
        },
        [element, onSelect],
    );

    const onPointerMove = useCallback(
        (e) => {
            const s = dragStateRef.current;
            if (!s) return;

            const dx = (e.clientX - s.start.x) / pageScale;
            const dy = (e.clientY - s.start.y) / pageScale;

            if (s.type === "move") {
                setWithRaf({ ...element, x: s.origin.x + dx, y: s.origin.y + dy });
                return;
            }

            const minSize = 20;
            const ox = s.origin.x;
            const oy = s.origin.y;
            const ow = s.origin.width;
            const oh = s.origin.height;

            let nx = ox;
            let ny = oy;
            let nw = ow;
            let nh = oh;

            if (s.corner === "se") {
                nw = clamp(ow + dx, minSize, 2000);
                nh = clamp(oh + dy, minSize, 2000);
            } else if (s.corner === "sw") {
                nw = clamp(ow - dx, minSize, 2000);
                nh = clamp(oh + dy, minSize, 2000);
                nx = ox + dx;
            } else if (s.corner === "ne") {
                nw = clamp(ow + dx, minSize, 2000);
                nh = clamp(oh - dy, minSize, 2000);
                ny = oy + dy;
            } else if (s.corner === "nw") {
                nw = clamp(ow - dx, minSize, 2000);
                nh = clamp(oh - dy, minSize, 2000);
                nx = ox + dx;
                ny = oy + dy;
            }

            setWithRaf({ ...element, x: nx, y: ny, width: nw, height: nh });
        },
        [element, pageScale, setWithRaf],
    );

    const endGesture = useCallback(() => {
        dragStateRef.current = null;
    }, []);

    const onTextBlur = useCallback(
        (e) => {
            const text = e.currentTarget.textContent ?? "";
            onChange({ ...element, properties: { ...element.properties, text } });
        },
        [element, onChange],
    );

    const wrapperClasses = useMemo(() => {
        const base =
            "absolute z-[100] group select-none rounded-lg";
        const sel = isSelected
            ? "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-white shadow-xl"
            : "hover:ring-1 hover:ring-slate-300";
        return `${base} ${sel}`;
    }, [isSelected]);

    const wrapperStyle = useMemo(() => {
        const s = {
            left: screen.left,
            top: screen.top,
            transform: `rotate(${screen.rotate}deg)`,
            transformOrigin: "top left",
        };
        if (typeof screen.width === "number") s.width = screen.width;
        if (typeof screen.height === "number") s.height = screen.height;
        return s;
    }, [screen]);

    const textStyle = useMemo(() => {
        const p = element.properties || {};
        return {
            fontSize: `${(p.fontSize ?? 16) * pageScale}px`,
            color: p.color || "#000000",
            fontWeight: p.fontWeight === "bold" ? 700 : 500,
            textAlign: p.align || "left",
            fontFamily: p.fontFamily || "Helvetica",
            width: "100%",
            height: "100%",
            outline: "none",
            whiteSpace: "pre-wrap",
            userSelect: "text",
        };
    }, [element.properties, pageScale]);

    return (
        <div
            ref={rootRef}
            className={wrapperClasses}
            style={wrapperStyle}
            onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(element.id);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
        >
            <div
                className="absolute -top-3 -left-3 cursor-move rounded-full bg-[var(--primary)] p-1.5 opacity-0 transition-opacity group-hover:opacity-100 shadow-lg"
                onPointerDown={beginDrag}
                role="button"
                tabIndex={-1}
            >
                <GripVertical size={12} className="text-white" />
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(element.id);
                }}
                className="absolute -top-3 -right-3 rounded-full bg-red-500 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 shadow-lg"
                type="button"
            >
                <X size={12} className="text-white" />
            </button>

            {element.type === "text" ? (
                <div
                    className="bg-transparent p-2 rounded-md"
                    style={{ width: "100%", height: "100%" }}
                >
                    <div
                        contentEditable={isSelected}
                        suppressContentEditableWarning
                        onBlur={onTextBlur}
                        className="w-full h-full"
                        style={textStyle}
                    >
                        {element.properties?.text ?? ""}
                    </div>
                </div>
            ) : (
                <img
                    src={element.properties?.src}
                    alt="element"
                    draggable={false}
                    className="w-full h-full rounded-md pointer-events-none"
                    style={{ objectFit: "cover" }}
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
        </div>
    );
}

const ThumbnailItem = memo(function ThumbnailItem({
    page,
    index,
    pdfSource,
    pdfjsDocCacheRef,
    isSelected,
    onSelect,
    onDelete,
}) {
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: page.id,
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let cancelled = false;

        const drawBlank = () => {
            const thumbWidth = 160;
            const scale = thumbWidth / (page.width || 1);
            const w = Math.max(1, Math.floor((page.width || 595.28) * scale));
            const h = Math.max(1, Math.floor((page.height || 841.89) * scale));

            canvas.width = w;
            canvas.height = h;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;

            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        };

        const drawPdf = async () => {
            if (!pdfSource?.data) {
                drawBlank();
                return;
            }

            const sourceId = pdfSource.id;
            let docPromise = pdfjsDocCacheRef.current.get(sourceId);
            if (!docPromise) {
                const pdfJsBuffer = pdfSource.data.slice(0);
                docPromise = pdfjs.getDocument({ data: pdfJsBuffer }).promise;
                pdfjsDocCacheRef.current.set(sourceId, docPromise);
            }

            const doc = await docPromise;
            const pdfPage = await doc.getPage(page.pdfPageNumber || 1);

            const baseViewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE });
            const thumbWidth = 160;
            const scale = thumbWidth / baseViewport.width;
            const viewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE * scale });

            const w = Math.max(1, Math.floor(viewport.width));
            const h = Math.max(1, Math.floor(viewport.height));

            canvas.width = w;
            canvas.height = h;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;

            if (renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                } catch {
                    renderTaskRef.current = null;
                }
            }

            renderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport });
            await renderTaskRef.current.promise;
        };

        const run = async () => {
            try {
                if (page.type === "pdf") await drawPdf();
                else drawBlank();
            } catch {
                if (!cancelled) drawBlank();
            }
        };

        run();

        return () => {
            cancelled = true;
            if (renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                } catch {
                    renderTaskRef.current = null;
                }
            }
        };
    }, [page.height, page.pdfPageNumber, page.type, page.width, pdfSource, pdfjsDocCacheRef]);

    const style = useMemo(
        () => ({
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
        }),
        [transform, transition, isDragging],
    );

    return (
        <div ref={setNodeRef} style={style} className="relative">
            <button
                type="button"
                onClick={() => onSelect(page.id)}
                className={`group w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${isSelected
                        ? "border-[var(--primary)]/50 bg-[var(--primary)]/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
            >
                <div className="relative shrink-0 rounded-xl bg-white shadow-inner border border-slate-100 overflow-hidden">
                    <canvas ref={canvasRef} className="block" />
                    <div className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[10px] font-black text-white border border-white/10">
                        #{index + 1}
                    </div>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-black uppercase tracking-widest text-white/90 truncate">
                        {page.type === "pdf" ? "PDF Page" : "Blank Page"}
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-slate-400 truncate">
                        {page.type === "pdf" ? `${pdfSource?.name || "PDF"} · #${page.pdfPageNumber || 1}` : `${Math.round(page.width)}×${Math.round(page.height)}`}
                    </div>
                </div>

                <div
                    {...attributes}
                    {...listeners}
                    className="shrink-0 rounded-xl bg-black/40 p-2 text-white/80 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                    title="Drag to reorder"
                >
                    <GripVertical size={16} />
                </div>
            </button>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(page.id);
                }}
                className="absolute right-3 top-3 rounded-lg bg-red-500/10 p-2 text-red-300 border border-red-500/20 opacity-0 hover:opacity-100 transition-opacity"
                title="Delete page"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
});

const PageView = memo(function PageView({
    page,
    index,
    pdfSource,
    pdfjsDocCacheRef,
    isSelected,
    selectedElementId,
    registerPageNode,
    onSelectPage,
    onSelectElement,
    onUpdatePage,
    onUpdateElement,
    onDeleteElement,
    onDeletePage,
}) {
    const canvasRef = useRef(null);
    const pageRootRef = useRef(null);
    const overlayRef = useRef(null);
    const [visible, setVisible] = useState(false);
    const [toolbarAnchor, setToolbarAnchor] = useState(null);

    useEffect(() => {
        if (!pageRootRef.current) return;
        const node = pageRootRef.current;
        const obs = new IntersectionObserver(
            (entries) => {
                const v = entries.some((e) => e.isIntersecting);
                setVisible(v);
            },
            { root: null, threshold: 0.1 },
        );
        obs.observe(node);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!pageRootRef.current) return;
        const node = pageRootRef.current;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width || 0;
            if (!w || !page.width) return;
            const scale = w / page.width;
            if (!Number.isFinite(scale)) return;
            if (Math.abs((page.scale || 1) - scale) > 0.002) onUpdatePage(page.id, { scale });
        });
        ro.observe(node);
        return () => ro.disconnect();
    }, [page.id, page.scale, page.width, onUpdatePage]);

    const renderBlank = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const s = page.scale || 1;
        const w = Math.floor(page.width * s);
        const h = Math.floor(page.height * s);
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }, [page.height, page.scale, page.width]);

    const renderPdf = useCallback(async () => {
        if (!pdfSource?.data) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const sourceId = pdfSource.id;
        let docPromise = pdfjsDocCacheRef.current.get(sourceId);
        if (!docPromise) {
            const pdfJsBuffer = pdfSource.data.slice(0);
            docPromise = pdfjs.getDocument({ data: pdfJsBuffer }).promise;
            pdfjsDocCacheRef.current.set(sourceId, docPromise);
        }

        const doc = await docPromise;
        const pdfPage = await doc.getPage(page.pdfPageNumber || 1);

        const baseViewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE });
        let containerWidth = pageRootRef.current?.clientWidth || 0;
        if (!containerWidth) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            containerWidth = pageRootRef.current?.clientWidth || baseViewport.width;
        }
        const scale = containerWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale: PDFJS_POINTS_SCALE * scale });

        const cw = Math.floor(viewport.width);
        const ch = Math.floor(viewport.height);

        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;

        await pdfPage.render({ canvasContext: ctx, viewport }).promise;

        if (Math.abs((page.scale || 1) - scale) > 0.002) onUpdatePage(page.id, { scale });
        if (Math.abs(page.width - baseViewport.width) > 0.5 || Math.abs(page.height - baseViewport.height) > 0.5) {
            onUpdatePage(page.id, { width: baseViewport.width, height: baseViewport.height });
        }
    }, [
        onUpdatePage,
        page.height,
        page.id,
        page.pdfPageNumber,
        page.scale,
        page.width,
        pdfSource,
        pdfjsDocCacheRef,
    ]);

    useEffect(() => {
        if (!visible) return;
        if (page.type === "blank") renderBlank();
        if (page.type === "pdf") renderPdf().catch(() => { });
    }, [page.type, page.scale, page.width, page.height, page.pdfPageNumber, pdfSource, visible, renderBlank, renderPdf]);

    const selectedEl = useMemo(
        () => page.elements.find((e) => e.id === selectedElementId) || null,
        [page.elements, selectedElementId],
    );

    const toolbarValue = useMemo(() => {
        if (!selectedEl || selectedEl.type !== "text") return null;
        return selectedEl.properties || {};
    }, [selectedEl]);

    const updateSelectedTextProps = useCallback(
        (patch) => {
            if (!selectedEl || selectedEl.type !== "text") return;
            onUpdateElement(page.id, selectedEl.id, {
                properties: { ...selectedEl.properties, ...patch },
            });
        },
        [onUpdateElement, page.id, selectedEl],
    );

    const overlayPointerDown = useCallback(
        (e) => {
            e.stopPropagation();
            onSelectPage(page.id);
            onSelectElement(null);
            setToolbarAnchor(null);
        },
        [onSelectElement, onSelectPage, page.id],
    );

    return (
        <div ref={(node) => registerPageNode(page.id, node)} className="w-full">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="inline-flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/90 border border-white/10">
                            <span>Page {index + 1}</span>
                        </div>

                        {page.type === "pdf" ? (
                            <div className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[11px] font-bold text-slate-300 border border-white/10">
                                <FileBox size={14} className="text-slate-400" />
                                <span className="truncate max-w-[260px]">{pdfSource?.name || "PDF"}</span>
                                <span className="text-slate-500">·</span>
                                <span className="text-slate-400">#{page.pdfPageNumber || 1}</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[11px] font-bold text-slate-300 border border-white/10">
                                <FileText size={14} className="text-slate-400" />
                                <span>Blank</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onDeletePage(page.id)}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-red-300 border border-red-500/20 hover:bg-red-500/15"
                            type="button"
                        >
                            <Trash2 size={14} />
                            <span>Delete</span>
                        </button>

                        <button
                            onClick={() => onSelectPage(page.id)}
                            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest border ${isSelected
                                    ? "bg-[var(--primary)]/15 text-white border-[var(--primary)]/30"
                                    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                                }`}
                            type="button"
                        >
                            <FileEdit size={14} />
                            <span>{isSelected ? "Selected" : "Select"}</span>
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    <div
                        className={`mx-auto relative rounded-2xl bg-white shadow-inner border ${isSelected ? "border-[var(--primary)]/40" : "border-slate-100"
                            }`}
                        ref={pageRootRef}
                        style={{
                            width: "min(920px, 100%)",
                            aspectRatio: `${page.width} / ${page.height}`,
                        }}
                        onPointerDown={overlayPointerDown}
                    >
                        <div className="page absolute inset-0">
                            <canvas ref={canvasRef} className="pdf-layer block absolute left-0 top-0" />
                            <div
                                ref={overlayRef}
                                className={`overlay-layer absolute left-0 top-0`}
                                style={{
                                    width: `${Math.floor(page.width * (page.scale || 1))}px`,
                                    height: `${Math.floor(page.height * (page.scale || 1))}px`,
                                }}
                            >
                                <AnimatePresence>
                                    {isSelected && toolbarAnchor && toolbarValue && (
                                        <TextToolbar
                                            position={{
                                                left: toolbarAnchor.left,
                                                top: toolbarAnchor.top,
                                            }}
                                            value={toolbarValue}
                                            onChange={updateSelectedTextProps}
                                            onClose={() => onSelectElement(null)}
                                        />
                                    )}
                                </AnimatePresence>

                                {page.elements.map((el) => (
                                    <InteractiveElement
                                        key={el.id}
                                        element={el}
                                        pageScale={page.scale || 1}
                                        isSelected={isSelected && selectedElementId === el.id}
                                        onSelect={(id) => {
                                            onSelectPage(page.id);
                                            onSelectElement(id);
                                        }}
                                        onChange={(next) => onUpdateElement(page.id, el.id, next)}
                                        onDelete={(id) => onDeleteElement(page.id, id)}
                                        onToolbarAnchor={(pos) => {
                                            if (!isSelected || selectedElementId !== el.id) return;
                                            const rect = overlayRef.current?.getBoundingClientRect();
                                            if (!rect) return;
                                            setToolbarAnchor({
                                                left: pos.left - rect.left,
                                                top: pos.top - rect.top,
                                            });
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {page.type === "pdf" && !pdfSource?.data && (
                            <div className="absolute inset-0 grid place-items-center text-center">
                                <div className="rounded-2xl bg-black/60 px-5 py-4 text-white border border-white/10">
                                    <div className="text-xs font-black uppercase tracking-widest">Missing PDF source</div>
                                    <div className="mt-1 text-[11px] text-white/70">Re-upload to restore rendering.</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default function EditorPro() {
    const [doc, setDoc] = useState({ pages: [] });
    const [pdfSources, setPdfSources] = useState([]);
    const [fileName, setFileName] = useState("");
    const [selectedPageId, setSelectedPageId] = useState(null);
    const [selectedElementId, setSelectedElementId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState(null);

    const pdfjsDocCacheRef = useRef(new Map());
    const saveTimerRef = useRef(null);
    const pageNodesRef = useRef(new Map());

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    useEffect(() => {
        (async () => {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed?.doc?.pages) {
                        setDoc(parsed.doc);
                        setFileName(parsed.fileName || "");
                        const first = parsed.doc.pages[0]?.id || null;
                        setSelectedPageId(first);
                    }
                } catch {
                    localStorage.removeItem(STORAGE_KEY);
                }
            } else {
                const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (legacy) {
                    try {
                        const parsed = JSON.parse(legacy);
                        const migrated = migrateLegacyState(parsed.pages, parsed.fileName);
                        setDoc(migrated.doc);
                        setFileName(migrated.fileName);
                        setSelectedPageId(migrated.doc.pages[0]?.id || null);
                    } catch {
                        localStorage.removeItem(LEGACY_STORAGE_KEY);
                    }
                }
            }

            try {
                const cached = await idb.get(IDB_KEY);
                if (cached && Array.isArray(cached)) {
                    const usable = cached.filter((s) => s?.data && s.data.byteLength > 0);
                    setPdfSources(usable);
                    if (usable.length !== cached.length) setError("Some cached PDFs could not be restored. Please re-upload.");
                }
                if (!cached) {
                    const legacyCached = await idb.get(LEGACY_IDB_KEY);
                    if (legacyCached && Array.isArray(legacyCached)) {
                        const usable = legacyCached.filter((s) => s?.data && s.data.byteLength > 0);
                        setPdfSources(usable);
                        if (usable.length !== legacyCached.length) setError("Some cached PDFs could not be restored. Please re-upload.");
                    }
                }
            } catch {
                setPdfSources([]);
            }
        })();
    }, []);

    useEffect(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ doc, fileName }));
            if (pdfSources.length) idb.set(IDB_KEY, pdfSources).catch(() => { });
        }, 250);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [doc, fileName, pdfSources]);

    const selectedPage = useMemo(
        () => doc.pages.find((p) => p.id === selectedPageId) || null,
        [doc.pages, selectedPageId],
    );

    const pdfSourcesById = useMemo(() => new Map(pdfSources.map((s) => [s.id, s])), [pdfSources]);

    const registerPageNode = useCallback((pageId, node) => {
        if (node) pageNodesRef.current.set(pageId, node);
        else pageNodesRef.current.delete(pageId);
    }, []);

    const selectAndScrollToPage = useCallback((pageId) => {
        setSelectedPageId(pageId);
        setSelectedElementId(null);
        requestAnimationFrame(() => {
            const node = pageNodesRef.current.get(pageId);
            node?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, []);

    const updatePage = useCallback((pageId, patch) => {
        setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
        }));
    }, []);

    const updateElement = useCallback((pageId, elementId, nextOrPatch) => {
        setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => {
                if (p.id !== pageId) return p;
                return {
                    ...p,
                    elements: p.elements.map((e) => {
                        if (e.id !== elementId) return e;
                        if (nextOrPatch?.id) return nextOrPatch;
                        return { ...e, ...nextOrPatch, properties: { ...e.properties, ...(nextOrPatch.properties || {}) } };
                    }),
                };
            }),
        }));
    }, []);

    const deleteElement = useCallback((pageId, elementId) => {
        setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => {
                if (p.id !== pageId) return p;
                return { ...p, elements: p.elements.filter((e) => e.id !== elementId) };
            }),
        }));
        setSelectedElementId((cur) => (cur === elementId ? null : cur));
    }, []);

    const deletePage = useCallback((pageId) => {
        setDoc((prev) => ({ ...prev, pages: prev.pages.filter((p) => p.id !== pageId) }));
        setSelectedElementId(null);
        setSelectedPageId((cur) => {
            if (cur !== pageId) return cur;
            const remaining = doc.pages.filter((p) => p.id !== pageId);
            return remaining[0]?.id || null;
        });
    }, [doc.pages]);

    const addBlankPage = useCallback(() => {
        const page = createBlankPage();
        setDoc((prev) => ({ ...prev, pages: [...prev.pages, page] }));
        setSelectedPageId(page.id);
        setSelectedElementId(null);
        if (!fileName) setFileName("Untitled Document.pdf");
    }, [fileName]);

    const appendPdf = useCallback(async (file) => {
        if (!file || file.type !== "application/pdf") return;
        setIsLoading(true);
        setError(null);
        if (!fileName) setFileName(file.name);

        try {
            const originalBuffer = await file.arrayBuffer();
            const storedBuffer = originalBuffer.slice(0);
            const pdfJsBuffer = originalBuffer.slice(0);
            const sourceId = uid("pdf");
            setPdfSources((prev) => [...prev, { id: sourceId, name: file.name, data: storedBuffer }]);

            const pdfDoc = await pdfjs.getDocument({ data: pdfJsBuffer }).promise;
            const newPages = [];

            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const viewportPoints = page.getViewport({ scale: PDFJS_POINTS_SCALE });
                newPages.push({
                    id: uid("page"),
                    type: "pdf",
                    pdfSourceId: sourceId,
                    pdfPageNumber: i,
                    width: viewportPoints.width,
                    height: viewportPoints.height,
                    scale: 1,
                    elements: [],
                });
            }

            setDoc((prev) => ({ ...prev, pages: [...prev.pages, ...newPages] }));
            setSelectedElementId(null);
            setSelectedPageId((cur) => cur || newPages[0]?.id || null);
        } catch {
            setError("Document load failed.");
        } finally {
            setIsLoading(false);
        }
    }, [fileName]);

    const removePdfSource = useCallback((sourceId) => {
        setDoc((prev) => ({
            ...prev,
            pages: prev.pages.filter((p) => p.pdfSourceId !== sourceId),
        }));
        setPdfSources((prev) => prev.filter((s) => s.id !== sourceId));
        setSelectedPageId(null);
        setSelectedElementId(null);
        pdfjsDocCacheRef.current.delete(sourceId);
    }, []);

    const addText = useCallback(() => {
        if (!selectedPageId) return;
        const el = createTextElement();
        setDoc((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => (p.id === selectedPageId ? { ...p, elements: [...p.elements, el] } : p)),
        }));
        setSelectedElementId(el.id);
    }, [selectedPageId]);

    const addImage = useCallback(() => {
        if (!selectedPageId) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });

            const dims = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const maxW = 320;
                    const scale = img.width ? Math.min(1, maxW / img.width) : 1;
                    resolve({ width: (img.width || 320) * scale, height: (img.height || 240) * scale });
                };
                img.src = dataUrl;
            });

            const el = createImageElement(dataUrl, dims);
            setDoc((prev) => ({
                ...prev,
                pages: prev.pages.map((p) => (p.id === selectedPageId ? { ...p, elements: [...p.elements, el] } : p)),
            }));
            setSelectedElementId(el.id);
        };
        input.click();
    }, [selectedPageId]);

    const onDragEnd = useCallback((event) => {
        const { active, over } = event;
        if (!active?.id || !over?.id || active.id === over.id) return;

        setDoc((prev) => {
            const oldIndex = prev.pages.findIndex((p) => p.id === active.id);
            const newIndex = prev.pages.findIndex((p) => p.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return { ...prev, pages: arrayMove(prev.pages, oldIndex, newIndex) };
        });
    }, []);

    const exportPdf = useCallback(async () => {
        if (!doc.pages.length) return;
        setIsExporting(true);
        setError(null);

        try {
            const outPdf = await PDFDocument.create();
            const loaded = new Map();

            for (const s of pdfSources) {
                if (!s?.data) continue;
                const pdfLibBuffer = s.data.slice(0);
                loaded.set(s.id, await PDFDocument.load(pdfLibBuffer));
            }

            const fontCache = new Map();
            const getFontPair = async (fontFamily) => {
                const { regular, bold } = mapFontFamilyToStandardFonts(fontFamily);
                const key = `${regular}|${bold}`;
                const hit = fontCache.get(key);
                if (hit) return hit;
                const reg = await outPdf.embedFont(regular);
                const b = await outPdf.embedFont(bold);
                const pair = { reg, bold: b };
                fontCache.set(key, pair);
                return pair;
            };

            for (const p of doc.pages) {
                let outPage;

                if (p.type === "pdf" && p.pdfSourceId && loaded.has(p.pdfSourceId)) {
                    const src = loaded.get(p.pdfSourceId);
                    const [copied] = await outPdf.copyPages(src, [(p.pdfPageNumber || 1) - 1]);
                    outPage = outPdf.addPage(copied);
                } else {
                    outPage = outPdf.addPage([p.width || 595.28, p.height || 841.89]);
                }

                const { width: pageWidth, height: pageHeight } = outPage.getSize();

                for (const el of p.elements || []) {
                    if (!el || !Number.isFinite(el.x) || !Number.isFinite(el.y)) continue;

                    const ex = el.x;
                    const ey = el.y;

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
                        const firstLineWidth = font.widthOfTextAtSize(firstLine, fontSize);
                        let x = ex;
                        if (safeMaxWidth && align === "center") x = ex + (safeMaxWidth - firstLineWidth) / 2;
                        if (safeMaxWidth && align === "right") x = ex + (safeMaxWidth - firstLineWidth);

                        const yTop = pageHeight - ey;
                        const y = yTop - fontSize;

                        outPage.drawText(text, {
                            x: clamp(x, 0, pageWidth),
                            y: clamp(y, 0, pageHeight),
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
                        const isPng = src.startsWith("data:image/png") || src.toLowerCase().includes("png");
                        const image = isPng ? await outPdf.embedPng(imgBytes) : await outPdf.embedJpg(imgBytes);

                        const w = Number.isFinite(el.width) ? el.width : image.width;
                        const h = Number.isFinite(el.height) ? el.height : image.height;

                        const y = pageHeight - ey - h;

                        outPage.drawImage(image, {
                            x: clamp(ex, 0, pageWidth),
                            y: clamp(y, 0, pageHeight),
                            width: clamp(w, 1, pageWidth),
                            height: clamp(h, 1, pageHeight),
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
        } catch (e) {
            setError(`Export Error: ${e?.message || "Unknown error"}`);
        } finally {
            setIsExporting(false);
        }
    }, [doc.pages, fileName, pdfSources]);

    const resetWorkspace = useCallback(async () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        await idb.clear();
        window.location.reload();
    }, []);

    return (
        <div className="flex h-screen flex-col bg-[#0a0b10] text-slate-100">
            <Navbar user={auth.currentUser} />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <div className="flex flex-1 overflow-hidden">
                    <aside className="w-80 border-r border-white/5 bg-white/[0.01] backdrop-blur-3xl flex flex-col p-6 overflow-y-auto">
                    <div className="mb-10">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 flex items-center gap-2">
                            <div className="h-4 w-1 bg-[var(--primary)] rounded-full" />
                            Design Toolkit
                        </h2>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={addText}
                                disabled={!selectedPageId}
                                className="flex flex-col items-start gap-3 p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-[var(--primary)]/30 hover:bg-white/[0.04] transition-all text-xs font-bold text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                type="button"
                            >
                                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-white">
                                    <Type size={18} />
                                </div>
                                <span>Text</span>
                            </button>

                            <button
                                onClick={addImage}
                                disabled={!selectedPageId}
                                className="flex flex-col items-start gap-3 p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/40 hover:bg-white/[0.04] transition-all text-xs font-bold text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                type="button"
                            >
                                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-white">
                                    <ImageIcon size={18} />
                                </div>
                                <span>Image</span>
                            </button>
                        </div>
                    </div>

                    <div className="mb-10">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 flex items-center gap-2">
                            <div className="h-4 w-1 bg-slate-500 rounded-full" />
                            Uploads
                        </h2>

                        <label className="flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/10 cursor-pointer">
                            <Upload size={16} />
                            <span>Append PDF</span>
                            <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => appendPdf(e.target.files?.[0])}
                            />
                        </label>

                        <div className="mt-4 space-y-3">
                            {pdfSources.length ? (
                                pdfSources.map((b) => (
                                    <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <FileBox size={14} className="text-slate-400 shrink-0" />
                                            <span className="text-xs truncate font-medium text-slate-300">{b.name}</span>
                                        </div>
                                        <button
                                            onClick={() => removePdfSource(b.id)}
                                            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                            title="Remove PDF and its pages"
                                            type="button"
                                        >
                                            <XCircle size={14} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-slate-600 font-medium px-2">No PDFs appended yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="mb-10">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 flex items-center gap-2">
                            <div className="h-4 w-1 bg-slate-500 rounded-full" />
                            Pages
                        </h2>

                        <button
                            onClick={addBlankPage}
                            className="flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/10"
                            type="button"
                        >
                            <Plus size={16} />
                            <span>Add Blank Page</span>
                        </button>

                        <div className="mt-4 space-y-3">
                            <SortableContext items={doc.pages} strategy={rectSortingStrategy}>
                                {doc.pages.map((p, idx) => (
                                    <ThumbnailItem
                                        key={p.id}
                                        page={p}
                                        index={idx}
                                        pdfSource={p.type === "pdf" ? pdfSourcesById.get(p.pdfSourceId) : null}
                                        pdfjsDocCacheRef={pdfjsDocCacheRef}
                                        isSelected={selectedPageId === p.id}
                                        onSelect={selectAndScrollToPage}
                                        onDelete={deletePage}
                                    />
                                ))}
                            </SortableContext>

                            {!doc.pages.length && (
                                <p className="text-xs text-slate-600 font-medium px-2">No pages yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-auto space-y-3 pt-6">
                        <button
                            onClick={exportPdf}
                            disabled={!doc.pages.length || isExporting}
                            className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-2xl bg-[var(--primary)] text-xs font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                            type="button"
                        >
                            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            <span>Export PDF</span>
                        </button>

                        <button
                            onClick={resetWorkspace}
                            className="w-full py-2 text-[10px] uppercase font-black text-slate-600 hover:text-red-400 transition-colors tracking-widest bg-white/5 hover:bg-red-500/10 rounded-xl"
                            type="button"
                        >
                            Reset Workspace
                        </button>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="w-full max-w-6xl mx-auto">
                        {error && (
                            <div className="mb-6 p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 uppercase tracking-widest">
                                {error}
                            </div>
                        )}

                        <div className="mb-8 rounded-3xl p-4 bg-white/[0.02] border border-white/10 shadow-2xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] border border-[var(--primary)]/20">
                                    <FileEdit size={22} />
                                </div>
                                <div className="overflow-hidden">
                                    <h1 className="text-sm font-black uppercase tracking-widest text-white truncate">
                                        {fileName || "Workspace"}
                                    </h1>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-400 font-bold uppercase">
                                            {doc.pages.length} Pages
                                        </span>
                                        {selectedPage && (
                                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-400 font-bold uppercase">
                                                Selected
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <label className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 cursor-pointer">
                                    <Upload size={16} />
                                    <span>Append PDF</span>
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) => appendPdf(e.target.files?.[0])}
                                    />
                                </label>

                                <button
                                    onClick={addBlankPage}
                                    className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10"
                                    type="button"
                                >
                                    <Plus size={16} />
                                    <span>Blank Page</span>
                                </button>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="flex flex-col h-[50vh] items-center justify-center gap-6">
                                <div className="h-16 w-16 border-4 border-t-[var(--primary)] border-white/5 rounded-full animate-spin" />
                                <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">Processing Document</p>
                            </div>
                        ) : doc.pages.length ? (
                            <div className="space-y-8 pb-24">
                                {doc.pages.map((page, idx) => (
                                    <PageView
                                        key={page.id}
                                        page={page}
                                        index={idx}
                                        pdfSource={page.type === "pdf" ? pdfSourcesById.get(page.pdfSourceId) : null}
                                        pdfjsDocCacheRef={pdfjsDocCacheRef}
                                        isSelected={selectedPageId === page.id}
                                        selectedElementId={selectedElementId}
                                        registerPageNode={registerPageNode}
                                        onSelectPage={(id) => setSelectedPageId(id)}
                                        onSelectElement={(id) => setSelectedElementId(id)}
                                        onUpdatePage={updatePage}
                                        onUpdateElement={(pageId, elementId, next) => {
                                            if (next?.id) updateElement(pageId, elementId, next);
                                            else updateElement(pageId, elementId, next);
                                        }}
                                        onDeleteElement={deleteElement}
                                        onDeletePage={deletePage}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="h-[55vh] flex flex-col items-center justify-center text-center">
                                <div className="h-24 w-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/5">
                                    <FileEdit size={40} className="text-slate-700" />
                                </div>
                                <h2 className="text-xl font-black text-white mb-2">Editor Workspace</h2>
                                <p className="text-sm text-slate-500 max-w-xs mb-8">
                                    Create designs from scratch or append a PDF. Pages are always appended (never overwritten).
                                </p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={addBlankPage}
                                        className="px-8 py-3 bg-white/5 rounded-2xl text-xs font-black uppercase tracking-widest transition-colors hover:bg-white/10"
                                        type="button"
                                    >
                                        Blank Canvas
                                    </button>
                                    <label className="px-8 py-3 bg-[var(--primary)] rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer hover:brightness-110 transition-all text-white">
                                        Upload PDF
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            className="hidden"
                                            onChange={(e) => appendPdf(e.target.files?.[0])}
                                        />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
                </div>
            </DndContext>
        </div>
    );
}
