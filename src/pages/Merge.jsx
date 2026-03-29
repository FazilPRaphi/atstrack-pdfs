import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Layers, Download, RefreshCw, AlertCircle,
  Loader2, FileEdit, Zap, Menu, X, ArrowRight,
  CheckCircle2, FilePlus2, Trash2,
} from "lucide-react";

import { api } from "../api";
import { auth } from "../firebase";

/* ─── Design Tokens ─────────────────────────────────────────────────────────── */
const T = {
  bg: "#F4F1EA",
  card: "#FFFFFF",
  accent: "#E6B36A",
  accentDark: "#C9953A",
  green: "#0F3D3E",
  textPrimary: "#111111",
  textSecondary: "#6B6B6B",
  border: "#E5E5E5",
  inputBg: "#F9F9F9",
};

/* ─── Reusable Button ───────────────────────────────────────────────────────── */
function Btn({ children, variant = "primary", onClick, disabled, fullWidth, style: extra = {} }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 7, borderRadius: 10, fontSize: 14,
    fontFamily: "'Inter', sans-serif", fontWeight: 600,
    padding: "12px 26px", cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease", border: "none",
    width: fullWidth ? "100%" : "auto",
    opacity: disabled ? 0.5 : 1,
    ...extra,
  };
  const variants = {
    primary: { ...base, backgroundColor: T.accent, color: T.textPrimary },
    dark: { ...base, backgroundColor: T.green, color: "#fff" },
    outline: { ...base, backgroundColor: "transparent", color: T.textPrimary, border: `1.5px solid ${T.border}` },
    ghost: { ...base, backgroundColor: T.inputBg, color: T.textSecondary, border: `1px solid ${T.border}` },
  };
  const hoverMap = {
    primary: (e, in_) => { if (!disabled) e.currentTarget.style.backgroundColor = in_ ? T.accentDark : T.accent; },
    dark: (e, in_) => { if (!disabled) e.currentTarget.style.opacity = in_ ? "0.82" : "1"; },
    outline: (e, in_) => { if (!disabled) e.currentTarget.style.borderColor = in_ ? T.textSecondary : T.border; },
    ghost: (e, in_) => { if (!disabled) e.currentTarget.style.backgroundColor = in_ ? T.border : T.inputBg; },
  };
  return (
    <button
      style={variants[variant]}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => hoverMap[variant](e, true)}
      onMouseLeave={(e) => hoverMap[variant](e, false)}
    >
      {children}
    </button>
  );
}

/* ─── Navbar ────────────────────────────────────────────────────────────────── */
function Navbar({ onNav }) {
  const [open, setOpen] = useState(false);
  return (
    <nav style={{
      backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`,
      position: "sticky", top: 0, zIndex: 50
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "0 24px",
        height: 64, display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>

        {/* Logo */}
        <button onClick={() => onNav("/")}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "none", border: "none", cursor: "pointer"
          }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            backgroundColor: T.accent, display: "flex",
            alignItems: "center", justifyContent: "center"
          }}>
            <FileEdit size={15} color="#111" strokeWidth={2.5} />
          </div>
          <span style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 18, fontWeight: 700, color: T.textPrimary
          }}>PDFWise</span>
        </button>

        {/* Desktop right */}
        <div className="d-nav" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn variant="outline" onClick={() => onNav("/login")} style={{ padding: "9px 20px", fontSize: 13 }}>
            Sign in
          </Btn>
          <Btn variant="dark" onClick={() => onNav("/editor")} style={{ padding: "9px 20px", fontSize: 13 }}>
            <Zap size={13} /> Try EditorPro
          </Btn>
        </div>

        {/* Mobile toggle */}
        <button className="m-nav-btn"
          onClick={() => setOpen(!open)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: T.textPrimary, display: "none"
          }}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: T.card, borderTop: `1px solid ${T.border}`,
            padding: "16px 24px 20px"
          }}>
          <Btn variant="outline" fullWidth onClick={() => { onNav("/login"); setOpen(false); }}
            style={{ marginBottom: 10 }}>Sign in</Btn>
          <Btn variant="dark" fullWidth onClick={() => { onNav("/editor"); setOpen(false); }}>
            <Zap size={13} /> Try EditorPro
          </Btn>
        </motion.div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .d-nav { display: none !important; }
          .m-nav-btn { display: block !important; }
        }
      `}</style>
    </nav>
  );
}

/* ─── Decorative bg shapes ──────────────────────────────────────────────────── */
const BgDots = () => (
  <svg width="96" height="96" viewBox="0 0 96 96" fill="none"
    style={{ position: "absolute", top: 32, right: 24, opacity: 0.12, pointerEvents: "none" }}>
    {Array.from({ length: 4 }).flatMap((_, r) =>
      Array.from({ length: 4 }).map((_, c) => (
        <circle key={`${r}-${c}`} cx={c * 28 + 8} cy={r * 28 + 8} r="3" fill={T.textPrimary} />
      ))
    )}
  </svg>
);

/* ─── File Row ──────────────────────────────────────────────────────────────── */
function FileRow({ file, index, onRemove }) {
  const kb = (file.size / 1024).toFixed(0);
  const mb = (file.size / 1048576).toFixed(2);
  const size = file.size > 1048576 ? `${mb} MB` : `${kb} KB`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.22 }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        backgroundColor: T.inputBg, borderRadius: 10,
        border: `1px solid ${T.border}`, padding: "10px 14px",
        marginBottom: 8
      }}
    >
      {/* Order badge */}
      <span style={{
        width: 24, height: 24, borderRadius: 6,
        backgroundColor: T.accent, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 11, fontWeight: 700,
        color: T.textPrimary, flexShrink: 0,
        fontFamily: "'Inter', sans-serif"
      }}>
        {index + 1}
      </span>

      {/* File info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13,
          fontWeight: 500, color: T.textPrimary,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
        }}>
          {file.name}
        </p>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 11,
          color: T.textSecondary, marginTop: 2
        }}>{size}</p>
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(index)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: T.textSecondary, padding: 4, borderRadius: 6,
          display: "flex", transition: "color 0.15s"
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
        onMouseLeave={(e) => (e.currentTarget.style.color = T.textSecondary)}>
        <Trash2 size={15} />
      </button>
    </motion.div>
  );
}

/* ─── Drop Zone ─────────────────────────────────────────────────────────────── */
function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);

  const handle = (incoming) => {
    const pdfs = Array.from(incoming).filter((f) => f.type === "application/pdf");
    if (pdfs.length) onFiles(pdfs);
  };

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 8,
        border: `2px dashed ${dragging ? T.accent : T.border}`,
        borderRadius: 14, padding: "32px 20px", cursor: "pointer",
        backgroundColor: dragging ? `${T.accent}12` : T.inputBg,
        transition: "all 0.2s ease", marginBottom: 20,
      }}
    >
      <input type="file" accept="application/pdf" multiple hidden
        onChange={(e) => handle(e.target.files)} />
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: `${T.accent}20`, display: "flex",
        alignItems: "center", justifyContent: "center"
      }}>
        <FilePlus2 size={20} color={T.green} strokeWidth={1.8} />
      </div>
      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        fontWeight: 600, color: T.textPrimary, margin: 0
      }}>
        Drop PDF files here
      </p>
      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 12,
        color: T.textSecondary, margin: 0
      }}>
        or <span style={{ color: T.green, fontWeight: 600 }}>browse</span> to upload · max 5 files · 10 MB each
      </p>
    </label>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function Merge() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return () => unsub();
  }, []);

  const addFiles = (incoming) => {
    setError(null);
    setFiles((prev) => {
      const merged = [...prev];
      incoming.forEach((f) => {
        if (!merged.find((x) => x.name === f.name && x.size === f.size))
          merged.push(f);
      });
      return merged.slice(0, 5);
    });
  };

  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleMerge = async () => {
    if (files.length < 2) { setError("Please select at least 2 PDF files to merge."); return; }
    if (files.some((f) => f.size > 10 * 1024 * 1024)) { setError("Each file must be under 10 MB."); return; }
    try {
      setIsProcessing(true); setError(null);
      const data = await api.mergePdf(files);
      if (!data?.file) throw new Error("Invalid response from server.");
      setResult(data);
    } catch (err) {
      setError(err?.message || "Failed to merge PDFs.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => { setFiles([]); setResult(null); setError(null); };

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; }
      `}</style>

      <Navbar onNav={navigate} />

      {/* Page body */}
      <main style={{
        padding: "64px 24px 80px", display: "flex",
        flexDirection: "column", alignItems: "center"
      }}>

        {/* Breadcrumb */}
        <div style={{
          width: "100%", maxWidth: 560, marginBottom: 28,
          display: "flex", alignItems: "center", gap: 6
        }}>
          <button onClick={() => navigate("/")}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13,
              color: T.textSecondary, background: "none", border: "none",
              cursor: "pointer", padding: 0
            }}>
            Home
          </button>
          <ArrowRight size={12} color={T.textSecondary} />
          <span style={{
            fontFamily: "'Inter', sans-serif", fontSize: 13,
            color: T.textPrimary, fontWeight: 600
          }}>Merge PDF</span>
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          {!result ? (

            /* ── Upload / Merge form ── */
            <motion.div key="form"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}
              style={{
                width: "100%", maxWidth: 560, backgroundColor: T.card,
                borderRadius: 20, padding: "40px 40px 36px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                border: `1px solid ${T.border}`, position: "relative", overflow: "hidden"
              }}>

              <BgDots />

              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  backgroundColor: `${T.accent}20`, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px"
                }}>
                  <Layers size={22} color={T.green} strokeWidth={1.8} />
                </div>
                <h1 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 26, fontWeight: 700, color: T.textPrimary
                }}>
                  Merge PDFs
                </h1>
                <p style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 14,
                  color: T.textSecondary, marginTop: 6, lineHeight: 1.6
                }}>
                  Combine multiple PDF files into one document.<br />
                  Drag to reorder before merging.
                </p>
              </div>

              {/* Drop zone */}
              <DropZone onFiles={addFiles} />

              {/* File list */}
              <AnimatePresence>
                {files.length > 0 && (
                  <motion.div key="filelist"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} style={{ marginBottom: 8, overflow: "hidden" }}>

                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 10
                    }}>
                      <p style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 12,
                        fontWeight: 600, color: T.textSecondary, letterSpacing: "0.06em"
                      }}>
                        {files.length} FILE{files.length > 1 ? "S" : ""} SELECTED
                      </p>
                      <button onClick={() => setFiles([])}
                        style={{
                          fontFamily: "'Inter', sans-serif", fontSize: 12,
                          color: T.textSecondary, background: "none", border: "none",
                          cursor: "pointer", textDecoration: "underline"
                        }}>
                        Clear all
                      </button>
                    </div>

                    <AnimatePresence>
                      {files.map((f, i) => (
                        <FileRow key={f.name + f.size} file={f} index={i} onRemove={removeFile} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div key="err"
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      backgroundColor: "#FEF2F2", border: "1px solid #FECACA",
                      borderRadius: 10, padding: "10px 14px",
                      marginBottom: 16, marginTop: 8
                    }}>
                    <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0 }} />
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13, color: "#dc2626"
                    }}>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${T.border}`, margin: "20px 0" }} />

              {/* CTA */}
              <Btn variant="primary" fullWidth
                disabled={files.length < 2 || isProcessing}
                onClick={handleMerge}
                style={{ padding: "14px 0", fontSize: 15 }}>
                {isProcessing ? (
                  <><Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> Processing…</>
                ) : (
                  <><Layers size={17} /> Merge {files.length > 0 ? `${files.length} PDFs` : "PDFs"}</>
                )}
              </Btn>

              {files.length < 2 && (
                <p style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 12,
                  color: T.textSecondary, textAlign: "center", marginTop: 10
                }}>
                  Add at least 2 PDF files to continue
                </p>
              )}
            </motion.div>

          ) : (

            /* ── Success state ── */
            <motion.div key="success"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              style={{
                width: "100%", maxWidth: 560, backgroundColor: T.card,
                borderRadius: 20, padding: "48px 40px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                border: `1px solid ${T.border}`, textAlign: "center"
              }}>

              {/* Success icon */}
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                backgroundColor: "#F0FDF4", border: "2px solid #BBF7D0",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px"
              }}>
                <CheckCircle2 size={30} color="#16a34a" />
              </div>

              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 24, fontWeight: 700, color: T.textPrimary, marginBottom: 8
              }}>
                Merge Complete!
              </h2>
              <p style={{
                fontFamily: "'Inter', sans-serif", fontSize: 14,
                color: T.textSecondary, lineHeight: 1.65, marginBottom: 32
              }}>
                Your {files.length} files have been merged into one PDF.<br />
                Download it below before it expires.
              </p>

              {/* Result card */}
              <div style={{
                backgroundColor: T.inputBg, border: `1px solid ${T.border}`,
                borderRadius: 12, padding: "16px 20px", marginBottom: 24,
                display: "flex", alignItems: "center", gap: 12
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  backgroundColor: `${T.accent}22`, display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                  <Layers size={18} color={T.green} />
                </div>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 13,
                    fontWeight: 600, color: T.textPrimary,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    merged_document.pdf
                  </p>
                  <p style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 11,
                    color: T.textSecondary, marginTop: 2
                  }}>
                    {files.length} files combined
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <a href={api.getDownloadUrl(result.file)} download
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, borderRadius: 10, padding: "13px 0",
                    backgroundColor: T.green, color: "#fff",
                    fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
                    textDecoration: "none", transition: "opacity 0.2s"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.84")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                  <Download size={17} /> Download PDF
                </a>
                <Btn variant="ghost" fullWidth onClick={reset}
                  style={{ padding: "13px 0" }}>
                  <RefreshCw size={15} /> Merge More Files
                </Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
