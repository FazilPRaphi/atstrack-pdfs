import { useState, useRef } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Sparkles, Download, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../api";
import { auth } from "../firebase";
import logo from "../assets/logo.png";
import BackButton from "../components/BackButton";

/* ─── Google Fonts ───────────────────────────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("wm-gf")) {
  const l = document.createElement("link");
  l.id = "wm-gf"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}

/* ─── Tokens ─────────────────────────────────────────────────────────────── */
const C = {
  pageBg: "#EDEAE3",
  cardBg: "#FFFFFF",
  beige: "#E8C98A",
  beigeHov: "#DEBA74",
  green: "#1B4D3E",
  black: "#1A1A18",
  muted: "#8A8880",
  border: "#E4E0D8",
  dashed: "#C8C4BC",
  dot: "#D8D4CC",
  fieldBg: "#FAFAF8",
  errBg: "#FEF2F2",
  errText: "#C0392B",
  successBg: "#EEF7F3",
  successBorder: "#A8D5C2",
};
const F = {
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'DM Sans', 'Helvetica Neue', sans-serif",
};

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const css = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.pageBg};font-family:${F.sans};-webkit-font-smoothing:antialiased}
  ::placeholder{color:#b8b4ac}

  /* ── nav ── */
  .wn{height:56px;background:${C.pageBg};border-bottom:1px solid ${C.border};
    display:flex;align-items:center;justify-content:space-between;padding:0 32px;
    position:sticky;top:0;z-index:50}
  .wn-logo{display:flex;align-items:center;gap:9px;font-family:${F.sans};
    font-weight:700;font-size:15px;color:${C.black};letter-spacing:-0.01em}
  .wn-logo-icon{width:32px;height:32px;border-radius:8px;background:${C.beige};
    display:flex;align-items:center;justify-content:center;font-size:15px}
  .wn-right{display:flex;align-items:center;gap:14px}
  .wn-signin{font-family:${F.sans};font-size:14px;color:${C.black};
    background:transparent;border:none;cursor:pointer;font-weight:500;transition:opacity .15s}
  .wn-signin:hover{opacity:.55}
  .wn-cta{background:${C.green};color:#fff;font-family:${F.sans};font-size:13px;
    font-weight:600;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;
    display:flex;align-items:center;gap:6px;transition:opacity .15s}
  .wn-cta:hover{opacity:.83}

  /* ── breadcrumb ── */
  .wm-bc{font-family:${F.sans};font-size:13px;color:${C.muted};
    padding:18px 32px 0;display:flex;align-items:center;gap:6px}
  .wm-bc a{color:${C.muted};text-decoration:none;transition:color .15s}
  .wm-bc a:hover{color:${C.black}}
  .wm-bc strong{color:${C.black};font-weight:600}

  /* ── card ── */
  .wm-card{background:${C.cardBg};border-radius:20px;
    box-shadow:0 2px 28px rgba(0,0,0,0.07);
    padding:44px 40px 40px;position:relative;overflow:hidden;
    max-width:540px;width:100%}

  /* ── dot grid ── */
  .wm-dots{position:absolute;top:20px;right:22px;
    display:grid;grid-template-columns:repeat(4,8px);gap:6px;pointer-events:none}
  .wm-dots span{width:3.5px;height:3.5px;border-radius:50%;background:${C.dot};display:block}

  /* ── tool badge ── */
  .wm-badge{width:48px;height:48px;border-radius:13px;background:#F4EEE2;
    display:flex;align-items:center;justify-content:center;
    margin:0 auto 16px;font-size:22px}

  /* ── drop zone ── */
  .drop-z{border:1.5px dashed ${C.dashed};border-radius:13px;padding:34px 20px;
    text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:transparent}
  .drop-z:hover,.drop-z.drag{border-color:${C.green};background:#F3F7F5}
  .dz-icon{width:38px;height:38px;border-radius:10px;background:#F4EEE2;
    display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:17px}
  .dz-title{font-weight:600;font-size:14px;color:${C.black};margin-bottom:4px}
  .dz-sub{font-size:12px;color:${C.muted}}
  .dz-sub b{color:${C.green};font-weight:600;cursor:pointer}

  /* ── file pill ── */
  .fp{display:flex;align-items:center;gap:10px;background:#F5F3EF;
    border-radius:10px;padding:10px 14px;margin:0}
  .fp-name{font-size:13px;font-weight:500;color:${C.black};flex:1;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fp-size{font-size:11px;color:${C.muted};flex-shrink:0}
  .fp-rm{background:none;border:none;cursor:pointer;color:${C.muted};
    font-size:17px;line-height:1;padding:0 2px;transition:color .15s}
  .fp-rm:hover{color:${C.errText}}

  /* ── divider ── */
  .wm-hr{border:none;border-top:1px solid ${C.border};margin:22px 0}

  /* ── label / input ── */
  .wm-label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;
    letter-spacing:.1em;color:${C.muted};margin-bottom:7px}
  .wm-input{width:100%;padding:11px 14px;border-radius:9px;
    border:1px solid ${C.border};background:${C.fieldBg};
    font-family:${F.sans};font-size:14px;color:${C.black};
    outline:none;transition:border-color .2s}
  .wm-input:focus{border-color:${C.green}}
  .wm-hint{font-size:11px;color:${C.muted};margin-top:5px;line-height:1.5}

  /* ── CTA — warm beige like screenshot ── */
  .wm-cta{width:100%;padding:14px;border-radius:12px;border:none;
    background:${C.beige};color:${C.black};font-family:${F.sans};
    font-size:14px;font-weight:600;cursor:pointer;
    display:flex;align-items:center;justify-content:center;gap:8px;
    transition:background .2s,transform .15s,opacity .15s;margin-top:20px}
  .wm-cta:hover:not(:disabled){background:${C.beigeHov};transform:translateY(-1px)}
  .wm-cta:disabled{opacity:.42;cursor:not-allowed}

  .wm-cta-hint{text-align:center;font-size:11px;color:${C.muted};margin-top:8px}

  /* ── error ── */
  .wm-err{display:flex;align-items:center;gap:8px;background:${C.errBg};
    border-radius:10px;padding:12px 14px;font-size:13px;color:${C.errText};margin-top:14px}

  /* ── success ── */
  .wm-success{display:flex;flex-direction:column;align-items:center;
    text-align:center;gap:0;padding:6px 0 12px}
  .wm-s-icon{width:58px;height:58px;border-radius:50%;
    background:${C.successBg};border:1.5px solid ${C.successBorder};
    display:flex;align-items:center;justify-content:center;
    font-size:26px;margin-bottom:14px}
  .wm-dl{width:100%;padding:13px;border-radius:12px;background:${C.beige};
    color:${C.black};font-family:${F.sans};font-size:14px;font-weight:600;
    border:none;cursor:pointer;display:flex;align-items:center;
    justify-content:center;gap:8px;text-decoration:none;
    transition:background .2s;margin-top:20px}
  .wm-dl:hover{background:${C.beigeHov}}
  .wm-reset{width:100%;padding:12px;border-radius:12px;
    border:1.5px solid ${C.border};background:transparent;
    font-family:${F.sans};font-size:13px;font-weight:500;color:${C.muted};
    cursor:pointer;display:flex;align-items:center;justify-content:center;
    gap:6px;transition:background .2s,color .2s;margin-top:10px}
  .wm-reset:hover{background:#F5F2EC;color:${C.black}}

  @keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:600px){.wm-card{padding:32px 20px 28px}.wm-bc{padding:14px 20px 0}}
`;

/* ─── Dot Grid ───────────────────────────────────────────────────────────── */
function DotGrid() {
  return (
    <div className="wm-dots">
      {Array.from({ length: 16 }).map((_, i) => <span key={i} />)}
    </div>
  );
}

/* ─── Navbar ─────────────────────────────────────────────────────────────── */
function WmNav() {
  return (
    <nav className="wn">
      <div className="wn-logo" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src={logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
        ATSTRACK-PDFS
      </div>
      <div className="wn-right">
        <button className="wn-cta">
          <Sparkles size={13} /> Try EditorPro
        </button>
      </div>
    </nav>
  );
}

/* ─── Drop Zone ──────────────────────────────────────────────────────────── */
function DropZone({ file, onFile, onRemove }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);

  const accept = (f) => { if (f?.type === "application/pdf") onFile(f); };

  if (file) {
    return (
      <div className="drop-z" style={{ padding: "18px 16px", cursor: "pointer" }}
        onClick={() => ref.current.click()}>
        <div className="fp">
          <span style={{ fontSize: 18 }}>📄</span>
          <span className="fp-name">{file.name}</span>
          <span className="fp-size">{(file.size / 1024).toFixed(0)} KB</span>
          <button className="fp-rm" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
        </div>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>Click to change file</p>
        <input ref={ref} type="file" accept="application/pdf" style={{ display: "none" }}
          onChange={(e) => accept(e.target.files[0])} />
      </div>
    );
  }

  return (
    <>
      <div
        className={`drop-z${drag ? " drag" : ""}`}
        onClick={() => ref.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files[0]); }}
      >
        <div className="dz-icon">📎</div>
        <p className="dz-title">Drop PDF files here</p>
        <p className="dz-sub">
          or <b onClick={(e) => { e.stopPropagation(); ref.current.click(); }}>browse</b> to upload · max 10 MB
        </p>
      </div>
      <input ref={ref} type="file" accept="application/pdf" style={{ display: "none" }}
        onChange={(e) => accept(e.target.files[0])} />
    </>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function Watermark() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("CONFIDENTIAL");
  const [isProcessing, setProc] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleWatermark = async () => {
    if (!file || !text.trim()) { setError("Please select a file and enter watermark text."); return; }
    try {
      setProc(true); setError(null);
      const data = await api.watermarkPdf(file, text);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to add watermark. Please try again.");
    } finally {
      setProc(false);
    }
  };

  const reset = () => { setFile(null); setText("CONFIDENTIAL"); setResult(null); setError(null); setProc(false); };

  return (
    <>
      <style>{css}</style>

      <div style={{ background: C.pageBg, minHeight: "100vh" }}>
        <BackButton />
        <WmNav />

        {/* Breadcrumb */}
        <div className="wm-bc">
          <a href="/">Home</a>
          <span style={{ opacity: .5 }}>→</span>
          <strong>Watermark PDF</strong>
        </div>

        {/* Centered card */}
        <main style={{ display: "flex", justifyContent: "center", padding: "30px 20px 80px" }}>
          <AnimatePresence mode="wait">
            {!result ? (
              <Motion.div
                key="form"
                className="wm-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.26, ease: "easeOut" }}
              >
                <DotGrid />

                {/* Tool icon badge */}
                <div className="wm-badge">🔏</div>

                {/* Heading */}
                <h1 style={{
                  fontFamily: F.serif, fontSize: 28, fontWeight: 400,
                  color: C.black, textAlign: "center",
                  lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.01em",
                }}>
                  Watermark PDF
                </h1>
                <p style={{
                  fontFamily: F.sans, fontSize: 13, color: C.muted,
                  textAlign: "center", lineHeight: 1.65,
                  maxWidth: 340, margin: "0 auto 28px",
                }}>
                  Stamp text over your PDF to protect its copyright securely.
                  Drag to reorder before applying.
                </p>

                {/* File drop */}
                <DropZone file={file} onFile={setFile} onRemove={() => setFile(null)} />

                <hr className="wm-hr" />

                {/* Watermark text */}
                <div>
                  <label className="wm-label">Watermark Text</label>
                  <input
                    type="text"
                    className="wm-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="e.g. DRAFT, CONFIDENTIAL, © 2025"
                    disabled={isProcessing}
                  />
                  <p className="wm-hint">This text will be stamped diagonally across every page.</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="wm-err">
                    <AlertCircle size={15} />
                    {error}
                  </div>
                )}

                {/* CTA */}
                <button
                  className="wm-cta"
                  onClick={handleWatermark}
                  disabled={!file || !text.trim() || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      Processing…
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 16 }}>🔏</span>
                      Add Watermark
                    </>
                  )}
                </button>

                {!file && <p className="wm-cta-hint">Add at least 1 PDF file to continue</p>}
              </Motion.div>
            ) : (
              <Motion.div
                key="success"
                className="wm-card"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.26, ease: "easeOut" }}
              >
                <DotGrid />
                <div className="wm-success">
                  <div className="wm-s-icon">✅</div>
                  <h2 style={{
                    fontFamily: F.serif, fontSize: 26, fontWeight: 400,
                    color: C.black, letterSpacing: "-0.01em", marginBottom: 8,
                  }}>
                    Watermark Applied!
                  </h2>
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
                    Your protected PDF is ready for download.
                  </p>

                  <a href={api.getDownloadUrl(result.file)} download className="wm-dl">
                    <Download size={16} />
                    Download PDF
                  </a>

                  <button className="wm-reset" onClick={reset}>
                    <RefreshCw size={14} />
                    Watermark Another PDF
                  </button>
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}
