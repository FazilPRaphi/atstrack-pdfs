/**
 * historyManager.js
 * Undo/redo system with debounced snapshots and memory management.
 */

import { useCallback, useEffect, useRef } from "react";
import { useEditorState, useEditorDispatch, A } from "./store/useEditorStore";

const MAX_HISTORY = 60;
const DEBOUNCE_MS = 300;

// ─── History hook ─────────────────────────────────────────────────────────────

export function useHistory() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const pendingRef = useRef(null);
  const lastSnapshotRef = useRef(null);

  // Keys that, when changed, should generate a history snapshot
  const TRACKED_KEYS = ["doc", "pdfSources", "fileName"];

  const snapshotDoc = useCallback(() => {
    const snap = {
      doc: JSON.parse(JSON.stringify(state.doc)),
      pdfSources: state.pdfSources.map((s) => ({ id: s.id, name: s.name })), // don't clone buffers
      fileName: state.fileName,
    };
    return snap;
  }, [state.doc, state.pdfSources, state.fileName]);

  const pushSnapshot = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }
    const snap = snapshotDoc();
    // Avoid duplicate snapshots
    if (lastSnapshotRef.current && JSON.stringify(snap.doc) === JSON.stringify(lastSnapshotRef.current.doc)) return;

    undoStackRef.current = [snap, ...undoStackRef.current].slice(0, MAX_HISTORY);
    redoStackRef.current = [];
    lastSnapshotRef.current = snap;
  }, [snapshotDoc]);

  const pushSnapshotDebounced = useCallback(() => {
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(pushSnapshot, DEBOUNCE_MS);
  }, [pushSnapshot]);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    // Save current state to redo stack
    redoStackRef.current = [snapshotDoc(), ...redoStackRef.current].slice(0, MAX_HISTORY);
    const prev = undoStackRef.current.shift();
    lastSnapshotRef.current = prev;
    dispatch({ type: A.SET_DOC, doc: prev.doc });
    if (prev.fileName) dispatch({ type: A.SET_FILE_NAME, fileName: prev.fileName });
  }, [dispatch, snapshotDoc]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    undoStackRef.current = [snapshotDoc(), ...undoStackRef.current].slice(0, MAX_HISTORY);
    const next = redoStackRef.current.shift();
    lastSnapshotRef.current = next;
    dispatch({ type: A.SET_DOC, doc: next.doc });
    if (next.fileName) dispatch({ type: A.SET_FILE_NAME, fileName: next.fileName });
  }, [dispatch, snapshotDoc]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  return { undo, redo, canUndo, canRedo, pushSnapshot, pushSnapshotDebounced };
}

// ─── Keyboard shortcut hook ───────────────────────────────────────────────────

export function useKeyboardShortcuts({
  undo,
  redo,
  onDeleteSelected,
  onDuplicateSelected,
  onMoveSelected,
}) {
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const isEditing =
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";

      if (isEditing) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo?.();
        return;
      }
      if (ctrl && (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        redo?.();
        return;
      }
      if (ctrl && e.key === "d") {
        e.preventDefault();
        onDuplicateSelected?.();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteSelected?.();
        return;
      }
      // Arrow key fine movement (1pt = 1px in points)
      const STEP = e.shiftKey ? 10 : 1;
      const deltas = {
        ArrowLeft: { dx: -STEP, dy: 0 },
        ArrowRight: { dx: STEP, dy: 0 },
        ArrowUp: { dx: 0, dy: -STEP },
        ArrowDown: { dx: 0, dy: STEP },
      };
      if (deltas[e.key]) {
        e.preventDefault();
        onMoveSelected?.(deltas[e.key]);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, onDeleteSelected, onDuplicateSelected, onMoveSelected]);
}
