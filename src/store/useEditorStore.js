/**
 * useEditorStore.js
 * Central state management for the PDF editor engine.
 * Uses React context + useReducer for predictable state updates.
 */

import { createContext, useContext, useReducer, useCallback, useRef } from "react";
import { uid, clamp } from "../elementUtils";
import { createBlankPage } from "../pageUtils";

// ─── Initial State ────────────────────────────────────────────────────────────

export const INITIAL_STATE = {
  doc: { pages: [] },
  pdfSources: [],
  fileName: "",
  selectedPageId: null,
  selectedElementIds: [], // multi-select support
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  gridEnabled: false,
  gridSize: 20,
  snapEnabled: true,
  showGuides: true,
  isLoading: false,
  isExporting: false,
  error: null,
};

// ─── Action Types ─────────────────────────────────────────────────────────────

export const A = {
  SET_DOC: "SET_DOC",
  SET_PAGES: "SET_PAGES",
  ADD_PAGE: "ADD_PAGE",
  UPDATE_PAGE: "UPDATE_PAGE",
  DELETE_PAGE: "DELETE_PAGE",
  REORDER_PAGES: "REORDER_PAGES",

  ADD_ELEMENT: "ADD_ELEMENT",
  UPDATE_ELEMENT: "UPDATE_ELEMENT",
  DELETE_ELEMENT: "DELETE_ELEMENT",
  DELETE_ELEMENTS: "DELETE_ELEMENTS",
  DUPLICATE_ELEMENT: "DUPLICATE_ELEMENT",
  BRING_FORWARD: "BRING_FORWARD",
  SEND_BACKWARD: "SEND_BACKWARD",
  BRING_TO_FRONT: "BRING_TO_FRONT",
  SEND_TO_BACK: "SEND_TO_BACK",

  SET_SELECTED_PAGE: "SET_SELECTED_PAGE",
  SET_SELECTED_ELEMENTS: "SET_SELECTED_ELEMENTS",
  TOGGLE_ELEMENT_SELECTION: "TOGGLE_ELEMENT_SELECTION",
  CLEAR_SELECTION: "CLEAR_SELECTION",

  ADD_PDF_SOURCE: "ADD_PDF_SOURCE",
  REMOVE_PDF_SOURCE: "REMOVE_PDF_SOURCE",
  SET_PDF_SOURCES: "SET_PDF_SOURCES",

  SET_FILE_NAME: "SET_FILE_NAME",
  SET_ZOOM: "SET_ZOOM",
  SET_PAN: "SET_PAN",
  SET_GRID: "SET_GRID",
  SET_SNAP: "SET_SNAP",
  TOGGLE_GUIDES: "TOGGLE_GUIDES",

  SET_LOADING: "SET_LOADING",
  SET_EXPORTING: "SET_EXPORTING",
  SET_ERROR: "SET_ERROR",
  RESET: "RESET",
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function editorReducer(state, action) {
  switch (action.type) {
    case A.SET_DOC:
      return { ...state, doc: action.doc };

    case A.SET_PAGES:
      return { ...state, doc: { ...state.doc, pages: action.pages } };

    case A.ADD_PAGE: {
      const pages = [...state.doc.pages, action.page];
      return {
        ...state,
        doc: { ...state.doc, pages },
        selectedPageId: action.page.id,
        selectedElementIds: [],
      };
    }

    case A.UPDATE_PAGE: {
      const pages = state.doc.pages.map((p) =>
        p.id === action.pageId ? { ...p, ...action.patch } : p
      );
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.DELETE_PAGE: {
      const pages = state.doc.pages.filter((p) => p.id !== action.pageId);
      const newSelectedId =
        state.selectedPageId === action.pageId
          ? pages[0]?.id ?? null
          : state.selectedPageId;
      return {
        ...state,
        doc: { ...state.doc, pages },
        selectedPageId: newSelectedId,
        selectedElementIds: [],
      };
    }

    case A.REORDER_PAGES:
      return { ...state, doc: { ...state.doc, pages: action.pages } };

    case A.ADD_ELEMENT: {
      const pages = state.doc.pages.map((p) =>
        p.id === action.pageId
          ? { ...p, elements: [...p.elements, action.element] }
          : p
      );
      return {
        ...state,
        doc: { ...state.doc, pages },
        selectedElementIds: [action.element.id],
      };
    }

    case A.UPDATE_ELEMENT: {
      const pages = state.doc.pages.map((p) => {
        if (p.id !== action.pageId) return p;
        return {
          ...p,
          elements: p.elements.map((e) => {
            if (e.id !== action.elementId) return e;
            if (action.next?.id) return action.next;
            return {
              ...e,
              ...action.next,
              properties: { ...e.properties, ...(action.next?.properties ?? {}) },
            };
          }),
        };
      });
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.DELETE_ELEMENT: {
      const pages = state.doc.pages.map((p) =>
        p.id !== action.pageId
          ? p
          : { ...p, elements: p.elements.filter((e) => e.id !== action.elementId) }
      );
      return {
        ...state,
        doc: { ...state.doc, pages },
        selectedElementIds: state.selectedElementIds.filter((id) => id !== action.elementId),
      };
    }

    case A.DELETE_ELEMENTS: {
      const ids = new Set(action.elementIds);
      const pages = state.doc.pages.map((p) =>
        p.id !== action.pageId
          ? p
          : { ...p, elements: p.elements.filter((e) => !ids.has(e.id)) }
      );
      return {
        ...state,
        doc: { ...state.doc, pages },
        selectedElementIds: state.selectedElementIds.filter((id) => !ids.has(id)),
      };
    }

    case A.DUPLICATE_ELEMENT: {
      const pages = state.doc.pages.map((p) => {
        if (p.id !== action.pageId) return p;
        const el = p.elements.find((e) => e.id === action.elementId);
        if (!el) return p;
        const clone = {
          ...el,
          id: uid("el"),
          x: el.x + 16,
          y: el.y + 16,
          properties: { ...el.properties },
        };
        return { ...p, elements: [...p.elements, clone] };
      });
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.BRING_FORWARD: {
      const pages = state.doc.pages.map((p) => {
        if (p.id !== action.pageId) return p;
        const els = [...p.elements];
        const idx = els.findIndex((e) => e.id === action.elementId);
        if (idx < 0 || idx === els.length - 1) return p;
        [els[idx], els[idx + 1]] = [els[idx + 1], els[idx]];
        return { ...p, elements: els };
      });
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.SEND_BACKWARD: {
      const pages = state.doc.pages.map((p) => {
        if (p.id !== action.pageId) return p;
        const els = [...p.elements];
        const idx = els.findIndex((e) => e.id === action.elementId);
        if (idx <= 0) return p;
        [els[idx], els[idx - 1]] = [els[idx - 1], els[idx]];
        return { ...p, elements: els };
      });
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.BRING_TO_FRONT: {
      const pages = state.doc.pages.map((p) => {
        if (p.id !== action.pageId) return p;
        const els = [...p.elements];
        const idx = els.findIndex((e) => e.id === action.elementId);
        if (idx < 0) return p;
        const [el] = els.splice(idx, 1);
        return { ...p, elements: [...els, el] };
      });
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.SEND_TO_BACK: {
      const pages = state.doc.pages.map((p) => {
        if (p.id !== action.pageId) return p;
        const els = [...p.elements];
        const idx = els.findIndex((e) => e.id === action.elementId);
        if (idx < 0) return p;
        const [el] = els.splice(idx, 1);
        return { ...p, elements: [el, ...els] };
      });
      return { ...state, doc: { ...state.doc, pages } };
    }

    case A.SET_SELECTED_PAGE:
      return {
        ...state,
        selectedPageId: action.pageId,
        selectedElementIds: action.clearElements ? [] : state.selectedElementIds,
      };

    case A.SET_SELECTED_ELEMENTS:
      return { ...state, selectedElementIds: action.ids };

    case A.TOGGLE_ELEMENT_SELECTION: {
      const ids = state.selectedElementIds.includes(action.elementId)
        ? state.selectedElementIds.filter((id) => id !== action.elementId)
        : [...state.selectedElementIds, action.elementId];
      return { ...state, selectedElementIds: ids };
    }

    case A.CLEAR_SELECTION:
      return { ...state, selectedElementIds: [] };

    case A.ADD_PDF_SOURCE:
      return { ...state, pdfSources: [...state.pdfSources, action.source] };

    case A.REMOVE_PDF_SOURCE:
      return { ...state, pdfSources: state.pdfSources.filter((s) => s.id !== action.sourceId) };

    case A.SET_PDF_SOURCES:
      return { ...state, pdfSources: action.sources };

    case A.SET_FILE_NAME:
      return { ...state, fileName: action.fileName };

    case A.SET_ZOOM:
      return { ...state, zoom: clamp(action.zoom, 0.25, 3) };

    case A.SET_PAN:
      return { ...state, panOffset: action.panOffset };

    case A.SET_GRID:
      return {
        ...state,
        gridEnabled: action.enabled ?? state.gridEnabled,
        gridSize: action.size ?? state.gridSize,
      };

    case A.SET_SNAP:
      return { ...state, snapEnabled: action.enabled };

    case A.TOGGLE_GUIDES:
      return { ...state, showGuides: !state.showGuides };

    case A.SET_LOADING:
      return { ...state, isLoading: action.isLoading };

    case A.SET_EXPORTING:
      return { ...state, isExporting: action.isExporting };

    case A.SET_ERROR:
      return { ...state, error: action.error };

    case A.RESET:
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const EditorContext = createContext(null);

export function EditorProvider({ children, initialState }) {
  const [state, dispatch] = useReducer(editorReducer, initialState ?? INITIAL_STATE);
  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorState() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorState must be used within EditorProvider");
  return ctx.state;
}

export function useEditorDispatch() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorDispatch must be used within EditorProvider");
  return ctx.dispatch;
}

// ─── Selector hooks (prevent unnecessary re-renders) ─────────────────────────

export function useSelectedPage() {
  const { doc, selectedPageId } = useEditorState();
  return doc.pages.find((p) => p.id === selectedPageId) ?? null;
}

export function useSelectedElements() {
  const { doc, selectedPageId, selectedElementIds } = useEditorState();
  const page = doc.pages.find((p) => p.id === selectedPageId);
  if (!page) return [];
  return page.elements.filter((e) => selectedElementIds.includes(e.id));
}

export function usePdfSourcesMap() {
  const { pdfSources } = useEditorState();
  return new Map(pdfSources.map((s) => [s.id, s]));
}
