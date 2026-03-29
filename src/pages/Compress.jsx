/**
 * src/pages/Compress.jsx
 *
 * Compress PDF — Fully self-contained page component.
 * Design system: #F4F1EA bg · white card · #E6B36A accent · DM Serif / DM Sans
 *
 * Features:
 *  - Large file upload (50MB+) via drag-and-drop or click
 *  - Large file warning (>50MB)
 *  - 3 compression levels (Low / Medium / High)
 *  - Multi-stage animated progress bar (upload → compress → finalize)
 *  - Result display (original / compressed / saved %)
 *  - Download button
 *  - Full error handling
 *
 * FIX: pollJobStatus returns result directly (not wrapped in .data).
 *      Removed response.data usage — now reads result fields directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import api from "../api";

/* ─── Google Fonts injection (matches EditorPro) ───────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("cp-gf")) {
  const l = document.createElement("link");
  l.id = "cp-gf";
  l.rel = "stylesheet";
  l.href =
    "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap";
  document.head.appendChild(l);
}

/* ─── Design tokens ────────────────────────────────────────────────────────── */
const T = {
  bg: "#F4F1EA",
  card: "#FFFFFF",
  accent: "#E6B36A",
  accentDark: "#C9933E",
  accentLight: "#FBF3E4",
  accentBorder: "#F0D5A8",
  green: "#2D6A4F",
  greenBg: "#EAF4EE",
  greenBorder: "#A8D5B5",
  red: "#C0392B",
  redBg: "#FEF2F2",
  redBorder: "#FCCACA",
  text: "#111111",
  muted: "#6B6B6B",
  border: "#E0DAD0",
  borderHov: "#C8C0B0",
  inputBg: "#FAF8F4",
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'DM Sans', 'Helvetica Neue', sans-serif",
};

/* ─── Compression level config ─────────────────────────────────────────────── */
const LEVELS = [
  {
    id: "low",
    label: "Low",
    sublabel: "High Quality",
    description: "Minimal compression. Best for printing or archiving.",
    icon: "◈",
    bars: 1,
  },
  {
    id: "medium",
    label: "Medium",
    sublabel: "Balanced",
    description: "Good compression with excellent quality retention.",
    icon: "◈◈",
    bars: 2,
  },
  {
    id: "high",
    label: "High",
    sublabel: "Max Compression",
    description: "Smallest file size. Best for web sharing or email.",
    icon: "◈◈◈",
    bars: 3,
  },
];

/* ─── Stage config for progress display ────────────────────────────────────── */
const STAGES = [
  { id: "uploading", label: "Uploading…", min: 0, max: 60 },
  { id: "compressing", label: "Compressing…", min: 60, max: 90 },
  { id: "finalizing", label: "Finalizing…", min: 90, max: 100 },
];

/* ─── Utility helpers ──────────────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round(((b - a) / b) * 100);
}

function getStage(progress) {
  if (progress < 60) return STAGES[0];
  if (progress < 90) return STAGES[1];
  return STAGES[2];
}

/* ─── CSS ──────────────────────────────────────────────────────────────────── */
const css = `
  .cp-root {
    min-height: 100vh;
    background: ${T.bg};
    font-family: ${T.sans};
    -webkit-font-smoothing: antialiased;
    color: ${T.text};
    padding: 48px 16px 80px;
  }

  /* Subtle dot-grid background texture */
  .cp-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: radial-gradient(circle, #c8bfaa 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.22;
    pointer-events: none;
    z-index: 0;
  }

  .cp-inner {
    position: relative;
    z-index: 1;
    max-width: 620px;
    margin: 0 auto;
  }

  /* Page header */
  .cp-header {
    text-align: center;
    margin-bottom: 40px;
    animation: cp-fadein 0.5s ease both;
  }
  .cp-header-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border-radius: 999px;
    background: ${T.accentLight};
    border: 1px solid ${T.accentBorder};
    font-size: 11px;
    font-weight: 600;
    color: ${T.accentDark};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  .cp-title {
    font-family: ${T.serif};
    font-size: clamp(28px, 5vw, 38px);
    font-weight: 400;
    color: ${T.text};
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-bottom: 10px;
  }
  .cp-title em {
    font-style: italic;
    color: ${T.accentDark};
  }
  .cp-subtitle {
    font-size: 14px;
    color: ${T.muted};
    font-weight: 400;
    line-height: 1.6;
  }

  /* Card */
  .cp-card {
    background: ${T.card};
    border-radius: 20px;
    border: 1px solid ${T.border};
    box-shadow: 0 4px 32px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04);
    padding: 32px;
    animation: cp-fadein 0.5s 0.1s ease both;
  }

  .cp-section {
    margin-bottom: 28px;
  }
  .cp-section:last-child {
    margin-bottom: 0;
  }

  .cp-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${T.muted};
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cp-label::before {
    content: '';
    display: block;
    width: 3px;
    height: 12px;
    border-radius: 2px;
    background: ${T.accent};
    flex-shrink: 0;
  }

  /* ── Drop zone ── */
  .cp-dropzone {
    border: 2px dashed ${T.border};
    border-radius: 14px;
    padding: 36px 24px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, transform 0.15s;
    background: ${T.inputBg};
    position: relative;
    outline: none;
  }
  .cp-dropzone:hover,
  .cp-dropzone.drag-over {
    border-color: ${T.accent};
    background: ${T.accentLight};
    transform: translateY(-1px);
  }
  .cp-dropzone:focus-visible {
    border-color: ${T.accent};
    box-shadow: 0 0 0 3px ${T.accentBorder};
  }
  .cp-dropzone.has-file {
    border-style: solid;
    border-color: ${T.accentBorder};
    background: ${T.accentLight};
  }
  .cp-dropzone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }
  .cp-drop-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: ${T.card};
    border: 1px solid ${T.border};
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 14px;
    font-size: 22px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    transition: transform 0.2s;
  }
  .cp-dropzone:hover .cp-drop-icon,
  .cp-dropzone.drag-over .cp-drop-icon {
    transform: scale(1.08);
  }
  .cp-drop-primary {
    font-size: 14px;
    font-weight: 600;
    color: ${T.text};
    margin-bottom: 4px;
  }
  .cp-drop-secondary {
    font-size: 12px;
    color: ${T.muted};
  }
  .cp-drop-secondary span {
    color: ${T.accent};
    font-weight: 600;
    cursor: pointer;
  }

  /* File pill (selected state) */
  .cp-file-pill {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 11px;
    background: ${T.card};
    border: 1px solid ${T.accentBorder};
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  }
  .cp-file-icon {
    width: 38px;
    height: 38px;
    border-radius: 9px;
    background: ${T.accentLight};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .cp-file-name {
    font-size: 13px;
    font-weight: 600;
    color: ${T.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
  .cp-file-size {
    font-size: 11px;
    color: ${T.muted};
    margin-top: 2px;
  }
  .cp-file-remove {
    margin-left: auto;
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: ${T.muted};
    padding: 4px;
    border-radius: 6px;
    font-size: 16px;
    line-height: 1;
    transition: color 0.15s, background 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cp-file-remove:hover {
    color: ${T.red};
    background: ${T.redBg};
  }

  /* Large file warning */
  .cp-warning {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    background: #FFFBEB;
    border: 1px solid #FDE68A;
    margin-top: 10px;
    animation: cp-fadein 0.3s ease both;
  }
  .cp-warning-icon {
    font-size: 15px;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .cp-warning-text {
    font-size: 12px;
    font-weight: 500;
    color: #92400E;
    line-height: 1.5;
  }

  /* ── Compression level cards ── */
  .cp-level-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  @media (max-width: 480px) {
    .cp-level-grid { grid-template-columns: 1fr; }
  }
  .cp-level-card {
    position: relative;
    padding: 16px 14px;
    border-radius: 12px;
    border: 1.5px solid ${T.border};
    background: ${T.inputBg};
    cursor: pointer;
    transition: border-color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.15s;
    text-align: left;
    font-family: ${T.sans};
    outline: none;
  }
  .cp-level-card:hover {
    border-color: ${T.borderHov};
    transform: translateY(-1px);
  }
  .cp-level-card:focus-visible {
    box-shadow: 0 0 0 3px ${T.accentBorder};
  }
  .cp-level-card.selected {
    border-color: ${T.accent};
    background: ${T.accentLight};
    box-shadow: 0 2px 12px rgba(230,179,106,0.2);
  }
  .cp-level-check {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1.5px solid ${T.border};
    background: ${T.card};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: transparent;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .cp-level-card.selected .cp-level-check {
    border-color: ${T.accent};
    background: ${T.accent};
    color: #fff;
  }
  .cp-level-icon {
    font-size: 11px;
    letter-spacing: -1px;
    color: ${T.accent};
    font-weight: 700;
    margin-bottom: 8px;
    display: block;
  }
  .cp-level-name {
    font-size: 14px;
    font-weight: 700;
    color: ${T.text};
    margin-bottom: 2px;
  }
  .cp-level-sub {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${T.muted};
    margin-bottom: 8px;
  }
  .cp-level-desc {
    font-size: 11px;
    color: ${T.muted};
    line-height: 1.5;
    font-weight: 400;
  }
  /* Compression bars */
  .cp-level-bars {
    display: flex;
    gap: 3px;
    margin-top: 10px;
  }
  .cp-level-bar {
    height: 3px;
    flex: 1;
    border-radius: 99px;
    background: ${T.border};
    transition: background 0.2s;
  }
  .cp-level-card.selected .cp-level-bar.filled {
    background: ${T.accent};
  }
  .cp-level-card:not(.selected) .cp-level-bar.filled {
    background: #c8bfaa;
  }

  /* ── Divider ── */
  .cp-divider {
    height: 1px;
    background: ${T.border};
    margin: 24px 0;
  }

  /* ── Process button ── */
  .cp-btn-primary {
    width: 100%;
    padding: 15px 24px;
    border-radius: 12px;
    background: ${T.text};
    color: #fff;
    font-family: ${T.sans};
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.03em;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s, transform 0.15s, background 0.15s;
  }
  .cp-btn-primary:hover:not(:disabled) {
    background: #222;
    transform: translateY(-1px);
  }
  .cp-btn-primary:disabled {
    opacity: 0.38;
    cursor: not-allowed;
    transform: none;
  }
  .cp-btn-primary.processing {
    background: ${T.muted};
    cursor: not-allowed;
  }

  /* ── Progress section ── */
  .cp-progress-wrap {
    margin-top: 24px;
    animation: cp-fadein 0.35s ease both;
  }
  .cp-progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .cp-progress-stage {
    font-size: 13px;
    font-weight: 600;
    color: ${T.text};
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .cp-progress-pct {
    font-size: 13px;
    font-weight: 700;
    color: ${T.accentDark};
    font-variant-numeric: tabular-nums;
    min-width: 38px;
    text-align: right;
  }
  /* Power bar track */
  .cp-bar-track {
    height: 8px;
    border-radius: 99px;
    background: ${T.inputBg};
    border: 1px solid ${T.border};
    overflow: hidden;
    position: relative;
  }
  /* Animated shimmer inside track */
  .cp-bar-track::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%);
    background-size: 200% 100%;
    animation: cp-shimmer 1.6s linear infinite;
    pointer-events: none;
  }
  .cp-bar-fill {
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, ${T.accent} 0%, ${T.accentDark} 100%);
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    box-shadow: 0 0 8px rgba(230,179,106,0.5);
  }
  /* Stage dots */
  .cp-stage-dots {
    display: flex;
    gap: 6px;
    margin-top: 12px;
    justify-content: center;
  }
  .cp-stage-dot {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    color: ${T.muted};
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid ${T.border};
    background: transparent;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }
  .cp-stage-dot.active {
    color: ${T.accentDark};
    border-color: ${T.accentBorder};
    background: ${T.accentLight};
  }
  .cp-stage-dot.done {
    color: ${T.green};
    border-color: ${T.greenBorder};
    background: ${T.greenBg};
  }
  .cp-stage-dot-indicator {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .cp-stage-dot.active .cp-stage-dot-indicator {
    animation: cp-pulse 1s ease infinite;
  }

  /* ── Spinner ── */
  .cp-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: cp-spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  .cp-spinner-dark {
    border-color: rgba(17,17,17,0.2);
    border-top-color: ${T.text};
  }

  /* ── Result card ── */
  .cp-result {
    border-radius: 14px;
    border: 1px solid ${T.greenBorder};
    background: ${T.greenBg};
    padding: 22px 20px;
    animation: cp-fadein 0.45s ease both;
    margin-top: 24px;
  }
  .cp-result-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }
  .cp-result-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: ${T.green};
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    flex-shrink: 0;
  }
  .cp-result-title {
    font-size: 15px;
    font-weight: 700;
    color: ${T.green};
  }
  .cp-result-title span {
    font-family: ${T.serif};
    font-size: 18px;
    font-style: italic;
  }
  .cp-result-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 18px;
  }
  .cp-result-stat {
    text-align: center;
    padding: 14px 10px;
    border-radius: 10px;
    background: rgba(255,255,255,0.7);
    border: 1px solid rgba(168,213,181,0.5);
  }
  .cp-result-stat-val {
    font-size: 18px;
    font-weight: 700;
    color: ${T.text};
    font-family: ${T.serif};
    display: block;
    margin-bottom: 3px;
  }
  .cp-result-stat.highlight .cp-result-stat-val {
    color: ${T.green};
  }
  .cp-result-stat-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${T.muted};
  }
  /* Size bar comparison */
  .cp-size-bar-wrap {
    background: rgba(255,255,255,0.6);
    border-radius: 10px;
    border: 1px solid rgba(168,213,181,0.4);
    padding: 14px;
    margin-bottom: 16px;
  }
  .cp-size-bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: ${T.muted};
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .cp-size-bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }
  .cp-size-bar-row:last-child { margin-bottom: 0; }
  .cp-size-bar-name {
    font-size: 11px;
    font-weight: 600;
    color: ${T.muted};
    width: 72px;
    flex-shrink: 0;
  }
  .cp-size-bar-track {
    flex: 1;
    height: 6px;
    border-radius: 99px;
    background: rgba(168,213,181,0.3);
    overflow: hidden;
  }
  .cp-size-bar-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.8s 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .cp-size-bar-fill.original { background: #94A3B8; }
  .cp-size-bar-fill.compressed { background: ${T.green}; }
  .cp-size-bar-bytes {
    font-size: 11px;
    font-weight: 600;
    color: ${T.text};
    width: 56px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Download button */
  .cp-btn-download {
    width: 100%;
    padding: 13px 24px;
    border-radius: 11px;
    background: ${T.green};
    color: #fff;
    font-family: ${T.sans};
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.02em;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s, transform 0.15s;
  }
  .cp-btn-download:hover {
    opacity: 0.88;
    transform: translateY(-1px);
  }

  /* Reset button */
  .cp-btn-reset {
    width: 100%;
    padding: 10px;
    border-radius: 9px;
    background: transparent;
    border: none;
    font-family: ${T.sans};
    font-size: 12px;
    font-weight: 500;
    color: ${T.muted};
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    margin-top: 8px;
  }
  .cp-btn-reset:hover {
    color: ${T.red};
    background: ${T.redBg};
  }

  /* ── Error ── */
  .cp-error {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    background: ${T.redBg};
    border: 1px solid ${T.redBorder};
    margin-top: 16px;
    animation: cp-fadein 0.3s ease both;
  }
  .cp-error-icon {
    font-size: 16px;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .cp-error-text {
    font-size: 13px;
    font-weight: 500;
    color: ${T.red};
    line-height: 1.5;
  }
  .cp-error-text strong {
    display: block;
    font-size: 13px;
    margin-bottom: 2px;
  }

  /* ── Keyframes ── */
  @keyframes cp-fadein {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cp-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes cp-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes cp-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.75); }
  }

  /* ── Responsive ── */
  @media (max-width: 480px) {
    .cp-card { padding: 20px 16px; }
    .cp-result-grid { grid-template-columns: 1fr; }
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function Compress() {
  /* ── State ── */
  const [file, setFile] = useState(null);
  const [level, setLevel] = useState("medium");
  const [isDragOver, setIsDragOver] = useState(false);

  // Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(null); // "uploading" | "compressing" | "finalizing"

  // Results
  const [result, setResult] = useState(null); // { originalSize, compressedSize, downloadUrl }
  const [error, setError] = useState(null);

  /* ── Refs ── */
  const fileInputRef = useRef(null);
  const simulationRef = useRef(null); // stores interval id
  const cancelTokenRef = useRef(null);

  /* ── Inject CSS once ── */
  useEffect(() => {
    if (document.getElementById("cp-styles")) return;
    const el = document.createElement("style");
    el.id = "cp-styles";
    el.textContent = css;
    document.head.appendChild(el);
    return () => {
      const s = document.getElementById("cp-styles");
      if (s) s.remove();
    };
  }, []);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
      if (cancelTokenRef.current) cancelTokenRef.current.cancel("Component unmounted");
    };
  }, []);

  /* ── File validation ── */
  const validateFile = useCallback((f) => {
    if (!f) return "No file selected.";
    if (f.type !== "application/pdf") return "Only PDF files are supported.";
    return null;
  }, []);

  /* ── File selection handler ── */
  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f);
    setError(null);
    setResult(null);
    setProgress(0);
    setCurrentStage(null);
  }, [validateFile]);

  const onInputChange = (e) => {
    const f = e.target.files?.[0];
    handleFileSelect(f);
    e.target.value = "";
  };

  /* ── Drag & drop ── */
  const onDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragOver(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    handleFileSelect(f);
  };

  /* ── Progress simulation (compressing + finalizing stages) ── */
  const startSimulation = useCallback((fromPct, toPct, durationMs, onComplete) => {
    if (simulationRef.current) clearInterval(simulationRef.current);
    const steps = 30;
    const stepMs = durationMs / steps;
    const increment = (toPct - fromPct) / steps;
    let current = fromPct;

    simulationRef.current = setInterval(() => {
      current += increment;
      if (current >= toPct) {
        current = toPct;
        clearInterval(simulationRef.current);
        simulationRef.current = null;
        onComplete?.();
      }
      setProgress(Math.round(current));
    }, stepMs);
  }, []);

  /* ── Main compress handler ── */
  const handleCompress = useCallback(async () => {
    if (!file || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setCurrentStage("uploading");

    // Create a cancel token for axios
    const CancelToken = axios.CancelToken;
    cancelTokenRef.current = CancelToken.source();

    try {
      // ── Stage 1: Upload (0 → 60%) via real onUploadProgress ──
      // api.compressPdf posts the file, gets a jobId, then polls until done.
      // We pass onUploadProgress to track the upload portion (0→60%).
      // The returned `data` is the final polled result object directly.
      const data = await api.compressPdf(file, level, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const uploadPct = Math.round((progressEvent.loaded / progressEvent.total) * 60);
            setProgress(Math.min(uploadPct, 60));
          }
        },
        cancelToken: cancelTokenRef.current.token,
      });

      // ── Stage 2: Simulated compression (60 → 90%) ──
      setCurrentStage("compressing");

      // Compression time: scale with file size. Large files = longer simulation.
      const fileMB = file.size / (1024 * 1024);
      const compressMs = Math.min(Math.max(fileMB * 150, 800), 4000);

      await new Promise((resolve) => startSimulation(60, 90, compressMs, resolve));

      // ── Stage 3: Finalizing (90 → 100%) ──
      setCurrentStage("finalizing");
      await new Promise((resolve) => startSimulation(90, 100, 600, resolve));

      // ── FIX: pollJobStatus returns the result object directly (not wrapped in .data) ──
      const originalSize = data.originalSize ?? file.size;
      const compressedSize = data.compressedSize ?? data.size ?? null;
      const downloadUrl = data.downloadUrl ?? null;

      if (!downloadUrl) throw new Error("No download URL returned from server.");

      setResult({
        originalSize,
        compressedSize: compressedSize ?? originalSize,
        downloadUrl,
      });
    } catch (err) {
      if (axios.isCancel(err)) return; // unmounted, silently exit

      // Determine user-friendly message
      let msg = "Something went wrong. Please try again.";

      if (err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout")) {
        msg = "The request timed out. Large files may take up to a minute — please try again.";
      } else if (err.response?.status === 413) {
        msg = "File too large for the server. Please try a smaller file or a higher compression level.";
      } else if (err.response?.status === 415) {
        msg = "Invalid file format. Only PDF files are supported.";
      } else if (err.response?.status === 404) {
        msg = "API endpoint not found. Please check your server configuration.";
      } else if (err.response?.status >= 500) {
        msg = `Server error (${err.response.status}). Please try again later.`;
      } else if (err.message && err.message !== "Network Error") {
        msg = err.message;
      } else if (err.message === "Network Error") {
        msg = "Network error. Check your connection and try again.";
      }

      setError(msg);
    } finally {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
      cancelTokenRef.current = null;
      setIsProcessing(false);
    }
  }, [file, level, isProcessing, startSimulation]);

  /* ── Reset ── */
  const handleReset = () => {
    if (simulationRef.current) clearInterval(simulationRef.current);
    if (cancelTokenRef.current) cancelTokenRef.current.cancel("User reset");
    setFile(null);
    setLevel("medium");
    setProgress(0);
    setCurrentStage(null);
    setResult(null);
    setError(null);
    setIsProcessing(false);
  };

  /* ── Computed values ── */
  const isLargeFile = file && file.size > 50 * 1024 * 1024;
  const savedPct = result ? pct(result.compressedSize, result.originalSize) : 0;
  const stage = getStage(progress);

  /* ── Stage dot helpers ── */
  const stageStatus = (stageId) => {
    if (!isProcessing && !result) return "idle";
    const stageOrder = ["uploading", "compressing", "finalizing"];
    const currentIdx = stageOrder.indexOf(currentStage);
    const thisIdx = stageOrder.indexOf(stageId);
    if (result || thisIdx < currentIdx) return "done";
    if (thisIdx === currentIdx) return "active";
    return "idle";
  };

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="cp-root">
      <div className="cp-inner">

        {/* ── Page header ── */}
        <header className="cp-header">
          <div className="cp-header-badge">
            <span>⚡</span>
            PDF Compressor
          </div>
          <h1 className="cp-title">
            Compress PDFs<br />
            <em>without sacrificing quality</em>
          </h1>
          <p className="cp-subtitle">
            Reduce file size in seconds. Supports files up to 50 MB+.
          </p>
        </header>

        {/* ── Main card ── */}
        <div className="cp-card">

          {/* ── 1. File upload section ── */}
          <div className="cp-section">
            <div className="cp-label">Select File</div>

            {!file ? (
              /* Drop zone (no file yet) */
              <div
                className={`cp-dropzone${isDragOver ? " drag-over" : ""}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Click or drag to upload PDF"
                onKeyDown={(e) => e.key === "Enter" && !isProcessing && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onInputChange}
                  disabled={isProcessing}
                  style={{ display: "none" }}
                />
                <div className="cp-drop-icon">📄</div>
                <div className="cp-drop-primary">
                  {isDragOver ? "Release to upload" : "Drop your PDF here"}
                </div>
                <div className="cp-drop-secondary">
                  or <span onClick={(e) => { e.stopPropagation(); !isProcessing && fileInputRef.current?.click(); }}>
                    browse files
                  </span>
                  {" "}— any size supported
                </div>
              </div>
            ) : (
              /* File pill (file selected) */
              <div className="cp-dropzone has-file" style={{ padding: "12px 16px", cursor: "default" }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onInputChange}
                  disabled={isProcessing}
                  style={{ display: "none" }}
                />
                <div className="cp-file-pill">
                  <div className="cp-file-icon">📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cp-file-name" title={file.name}>{file.name}</div>
                    <div className="cp-file-size">{formatBytes(file.size)}</div>
                  </div>
                  {!isProcessing && (
                    <button
                      className="cp-file-remove"
                      onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); setError(null); }}
                      aria-label="Remove file"
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Large file warning */}
            {isLargeFile && (
              <div className="cp-warning">
                <span className="cp-warning-icon">⚠️</span>
                <p className="cp-warning-text">
                  <strong style={{ display: "block", marginBottom: 2 }}>Large file detected</strong>
                  Files above 50 MB may take up to 1 minute to compress. Please keep this tab open.
                </p>
              </div>
            )}
          </div>

          {/* ── 2. Compression level ── */}
          <div className="cp-section">
            <div className="cp-label">Compression Level</div>
            <div className="cp-level-grid">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl.id}
                  className={`cp-level-card${level === lvl.id ? " selected" : ""}`}
                  onClick={() => !isProcessing && setLevel(lvl.id)}
                  disabled={isProcessing}
                  type="button"
                  aria-pressed={level === lvl.id}
                  aria-label={`${lvl.label} compression — ${lvl.sublabel}`}
                >
                  <div className="cp-level-check">✓</div>
                  <span className="cp-level-icon">{lvl.icon}</span>
                  <div className="cp-level-name">{lvl.label}</div>
                  <div className="cp-level-sub">{lvl.sublabel}</div>
                  <div className="cp-level-desc">{lvl.description}</div>
                  <div className="cp-level-bars">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`cp-level-bar${i <= lvl.bars ? " filled" : ""}`}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="cp-divider" />

          {/* ── 3. Action button ── */}
          <button
            className={`cp-btn-primary${isProcessing ? " processing" : ""}`}
            onClick={handleCompress}
            disabled={!file || isProcessing}
            type="button"
            aria-busy={isProcessing}
          >
            {isProcessing ? (
              <>
                <span className="cp-spinner" />
                {currentStage === "uploading" ? "Uploading…"
                  : currentStage === "compressing" ? "Compressing…"
                  : "Finalizing…"}
              </>
            ) : (
              <>
                <span>⚡</span>
                Compress PDF
              </>
            )}
          </button>

          {/* ── 4. Progress bar ── */}
          {isProcessing && (
            <div className="cp-progress-wrap">
              {/* Header row */}
              <div className="cp-progress-header">
                <div className="cp-progress-stage">
                  <span className="cp-spinner cp-spinner-dark" />
                  {stage.label}
                </div>
                <div className="cp-progress-pct">{progress}%</div>
              </div>

              {/* Power bar */}
              <div className="cp-bar-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="cp-bar-fill" style={{ width: `${progress}%` }} />
              </div>

              {/* Stage pills */}
              <div className="cp-stage-dots">
                {STAGES.map((s) => {
                  const status = stageStatus(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`cp-stage-dot${status === "active" ? " active" : ""}${status === "done" ? " done" : ""}`}
                    >
                      <span className="cp-stage-dot-indicator" />
                      {status === "done" ? "✓ " : ""}
                      {s.label.replace("…", "")}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 5. Error state ── */}
          {error && !isProcessing && (
            <div className="cp-error">
              <span className="cp-error-icon">⚠</span>
              <div className="cp-error-text">
                <strong>Compression failed</strong>
                {error}
              </div>
            </div>
          )}

          {/* ── 6. Result ── */}
          {result && !isProcessing && (
            <div className="cp-result">
              {/* Result header */}
              <div className="cp-result-header">
                <div className="cp-result-icon">✓</div>
                <div>
                  <div className="cp-result-title">
                    Compression complete!{" "}
                    {savedPct > 0 && (
                      <span style={{ fontFamily: T.serif, fontStyle: "italic", color: T.green, fontSize: 15 }}>
                        Saved {savedPct}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                    Your compressed PDF is ready to download
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="cp-result-grid">
                <div className="cp-result-stat">
                  <span className="cp-result-stat-val">{formatBytes(result.originalSize)}</span>
                  <span className="cp-result-stat-label">Original</span>
                </div>
                <div className="cp-result-stat">
                  <span className="cp-result-stat-val">{formatBytes(result.compressedSize)}</span>
                  <span className="cp-result-stat-label">Compressed</span>
                </div>
                <div className="cp-result-stat highlight">
                  <span className="cp-result-stat-val">
                    {savedPct > 0 ? `−${savedPct}%` : "~0%"}
                  </span>
                  <span className="cp-result-stat-label">Saved</span>
                </div>
              </div>

              {/* Visual size comparison bars */}
              <div className="cp-size-bar-wrap">
                <div className="cp-size-bar-label">
                  <span>Size comparison</span>
                </div>
                {/* Original bar */}
                <div className="cp-size-bar-row">
                  <div className="cp-size-bar-name">Original</div>
                  <div className="cp-size-bar-track">
                    <div className="cp-size-bar-fill original" style={{ width: "100%" }} />
                  </div>
                  <div className="cp-size-bar-bytes">{formatBytes(result.originalSize)}</div>
                </div>
                {/* Compressed bar (proportional width) */}
                <div className="cp-size-bar-row">
                  <div className="cp-size-bar-name">Compressed</div>
                  <div className="cp-size-bar-track">
                    <div
                      className="cp-size-bar-fill compressed"
                      style={{
                        width: `${Math.max(5, Math.round((result.compressedSize / result.originalSize) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="cp-size-bar-bytes">{formatBytes(result.compressedSize)}</div>
                </div>
              </div>

              {/* Download button */}
              <a href={result.downloadUrl} download target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <button className="cp-btn-download" type="button">
                  <span>↓</span>
                  Download Compressed PDF
                </button>
              </a>
            </div>
          )}

          {/* ── Reset (shows after processing attempt) ── */}
          {(result || error) && !isProcessing && (
            <button className="cp-btn-reset" onClick={handleReset} type="button">
              ↺ &nbsp;Start over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
