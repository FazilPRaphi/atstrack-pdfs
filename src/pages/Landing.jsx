import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  Layers, Scissors, Image as ImageIcon, Sparkles,
  Wand2, FileEdit, ArrowRight, Menu, X, Zap, LogOut, User,
} from "lucide-react";
import logo from "../assets/logo.png";

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
};

/* ─── Tools Data ────────────────────────────────────────────────────────────── */
const TOOLS = [
  {
    id: "merge",
    title: "Merge PDF",
    description: "Combine multiple PDF documents into one single file quickly and easily.",
    icon: Layers,
    path: "/merge",
    tag: "Most Used",
  },
  {
    id: "split",
    title: "Split PDF",
    description: "Extract specific pages or separate your PDF into multiple clean documents.",
    icon: Scissors,
    path: "/split",
    tag: null,
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Convert JPG, PNG, or other image formats into a polished PDF in seconds.",
    icon: ImageIcon,
    path: "/images-to-pdf",
    tag: "New",
  },
  {
    id: "watermark",
    title: "Watermark",
    description: "Stamp text or image watermarks over your PDF to protect its copyright.",
    icon: Sparkles,
    path: "/watermark",
    tag: null,
  },
  {
    id: "rotate",
    title: "Rotate PDF",
    description: "Quickly rotate pages in your PDF document to the correct orientation.",
    icon: Wand2,
    path: "/rotate",
    tag: null,
  },
  {
    id: "compress",
    title: "Compress PDF",
    description: "Reduce the file size of your PDF documents without compromising quality.",
    icon: Zap,
    path: "/compress",
    tag: null,
  },
  {
    id: "editor",
    title: "Advanced Editor",
    description: "Reorder, rotate, delete, and add pages visually in our pro-grade editor.",
    icon: FileEdit,
    path: "/editor",
    tag: "Pro",
  },
];

const FILTERS = ["All Tools", "Convert", "Edit", "Organize", "Security"];

/* ─── Decorative SVGs ───────────────────────────────────────────────────────── */
const DotGrid = () => (
  <svg
    width="108" height="108" viewBox="0 0 108 108" fill="none"
    style={{ position: "absolute", right: 160, top: 24, opacity: 0.22, pointerEvents: "none" }}
  >
    {Array.from({ length: 5 }).flatMap((_, r) =>
      Array.from({ length: 5 }).map((_, c) => (
        <circle key={`${r}-${c}`} cx={c * 24 + 6} cy={r * 24 + 6} r="3" fill="#111" />
      ))
    )}
  </svg>
);

const Stamp = () => (
  <svg
    width="76" height="76" viewBox="0 0 80 80" fill="none"
    style={{ position: "absolute", right: 24, top: 20, pointerEvents: "none" }}
  >
    <circle cx="40" cy="40" r="36" stroke={T.accentDark} strokeWidth="2" strokeDasharray="4 3" />
    <circle cx="40" cy="40" r="28" stroke={T.accentDark} strokeWidth="1.5" opacity="0.55" />
    <text x="40" y="36" textAnchor="middle" fill={T.accentDark} fontSize="7.5"
      fontFamily="Georgia, serif" fontWeight="bold" letterSpacing="2">PDF</text>
    <text x="40" y="47" textAnchor="middle" fill={T.accentDark} fontSize="6.5"
      fontFamily="Georgia, serif" letterSpacing="1">WISE</text>
    <text x="40" y="57" textAnchor="middle" fill={T.accentDark} fontSize="5.5"
      fontFamily="sans-serif" opacity="0.65">★ 2026 ★</text>
  </svg>
);

const TornEdge = () => (
  <svg
    viewBox="0 0 1440 44" preserveAspectRatio="none"
    style={{ display: "block", width: "calc(100% + 96px)", height: 44, marginLeft: -48, marginRight: -48 }}
  >
    <path
      d="M0,0 L40,18 L80,5 L130,22 L185,7 L245,26 L305,9 L368,28 L430,11 L492,30
         L555,14 L618,32 L680,7 L742,26 L804,13 L866,31 L928,9 L990,28 L1052,11
         L1114,30 L1176,6 L1238,25 L1300,9 L1362,28 L1440,16 L1440,44 L0,44 Z"
      fill={T.bg}
    />
  </svg>
);

/* ─── Reusable Button ───────────────────────────────────────────────────────── */
function Btn({ children, variant = "primary", onClick, style: extra = {}, fullWidth }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 7, borderRadius: 10, fontSize: 14,
    fontFamily: "'Inter', sans-serif", fontWeight: 600,
    padding: "11px 26px", cursor: "pointer",
    transition: "all 0.2s ease",
    border: "none",
    width: fullWidth ? "100%" : "auto",
    ...extra,
  };
  const styles = {
    primary: { ...base, backgroundColor: T.accent, color: T.textPrimary },
    dark: { ...base, backgroundColor: T.green, color: "#fff" },
    outline: { ...base, backgroundColor: "transparent", color: T.textPrimary, border: `1.5px solid ${T.border}` },
  };
  const hover = {
    primary: (e, enter) => { e.currentTarget.style.backgroundColor = enter ? T.accentDark : T.accent; },
    dark: (e, enter) => { e.currentTarget.style.opacity = enter ? "0.82" : "1"; },
    outline: (e, enter) => { e.currentTarget.style.borderColor = enter ? T.textSecondary : T.border; },
  };
  return (
    <button
      style={styles[variant]}
      onClick={onClick}
      onMouseEnter={(e) => hover[variant](e, true)}
      onMouseLeave={(e) => hover[variant](e, false)}
    >
      {children}
    </button>
  );
}

/* ─── Navbar (auth-aware) ───────────────────────────────────────────────────── */
function Navbar({ onNav, user }) {
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    onNav("/");
  };

  return (
    <nav style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "0 24px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>

        {/* Logo */}
        <button
          onClick={() => onNav("/")}
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer" }}
        >
          <img src={logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
          <span style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 18, fontWeight: 700, color: T.textPrimary, whiteSpace: "nowrap"
          }}>
            ATSTRACK-PDFS
          </span>
        </button>

        {/* Desktop right */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="desktop-nav">
          {user ? (
            <>
              {/* Logged-in: show user pill + logout */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px", borderRadius: 99,
                border: `1px solid ${T.border}`, background: T.card,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: T.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <User size={13} color="#111" strokeWidth={2.5} />
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 500, color: T.textPrimary,
                  fontFamily: "'Inter', sans-serif", maxWidth: 140,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user.email?.split("@")[0] || "User"}
                </span>
              </div>
              <Btn variant="outline" onClick={handleLogout}
                style={{ padding: "9px 18px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <LogOut size={13} /> Logout
              </Btn>
            </>
          ) : (
            <Btn variant="dark" onClick={() => onNav("/login")}
                style={{ padding: "9px 20px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={13} /> Try EditorPro
              </Btn>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="mobile-nav-btn"
          onClick={() => setOpen(!open)}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.textPrimary, padding: 4 }}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: T.card, borderTop: `1px solid ${T.border}`, padding: "16px 24px 20px" }}
        >
          {user ? (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 12, padding: "8px 0",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: T.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <User size={14} color="#111" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary, fontFamily: "'Inter', sans-serif" }}>
                  {user.email?.split("@")[0] || "User"}
                </span>
              </div>
              <Btn variant="outline" fullWidth onClick={() => { handleLogout(); setOpen(false); }}>
                <LogOut size={13} /> Logout
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="outline" fullWidth onClick={() => { onNav("/login"); setOpen(false); }}
                style={{ marginBottom: 10 }}>Sign in</Btn>
              <Btn variant="dark" fullWidth onClick={() => { onNav("/login"); setOpen(false); }}>
                <Zap size={13} /> Try EditorPro
              </Btn>
            </>
          )}
        </motion.div>
      )}

      {/* Responsive CSS */}
      <style>{`
        .desktop-nav { display: flex; }
        .mobile-nav-btn { display: none; }
        @media (max-width: 640px) {
          .desktop-nav  { display: none !important; }
          .mobile-nav-btn { display: block !important; }
        }
      `}</style>
    </nav>
  );
}

/* ─── Hero (public / marketing) ─────────────────────────────────────────────── */
function Hero({ onNav }) {
  return (
    <section style={{ backgroundColor: T.bg, padding: "72px 24px 0", overflow: "hidden" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        {/* Pill label */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <span style={{
            border: `1.5px solid ${T.border}`, color: T.textSecondary,
            borderRadius: 99, fontSize: 12, padding: "5px 18px",
            fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em"
          }}>
            ✦ All-in-One PDF Toolkit
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.07 }}
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 700, color: T.textPrimary,
            lineHeight: 1.1, letterSpacing: "-0.02em", textAlign: "center", margin: 0
          }}>
          Manage your PDFs
          <br />
          <span style={{ color: T.accent, fontStyle: "italic" }}>beautifully.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.13 }}
          style={{
            color: T.textSecondary, fontSize: 17, fontFamily: "'Inter', sans-serif",
            textAlign: "center", maxWidth: 480, margin: "18px auto 0", lineHeight: 1.7
          }}>
          Powerful, secure, and elegant tools to edit, convert, and organize your documents — for free.
        </motion.p>

        {/* CTA row — both go to /login for unauthenticated users */}
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
          <Btn variant="primary" onClick={() => onNav("/login")}>
            Start Editing <ArrowRight size={14} />
          </Btn>
          <Btn variant="outline" onClick={() => onNav("/login")}>
            View All Tools
          </Btn>
        </motion.div>

        {/* Featured card */}
        <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.28 }}
          style={{
            backgroundColor: T.accent, borderRadius: "20px 20px 0 0",
            marginTop: 56, padding: "44px 48px 0", position: "relative",
            overflow: "hidden", minHeight: 200
          }}>

          <DotGrid />
          <Stamp />

          {/* Decorative arc */}
          <svg width="240" height="90" viewBox="0 0 240 90" fill="none"
            style={{ position: "absolute", bottom: 0, right: "30%", opacity: 0.18, pointerEvents: "none" }}>
            <path d="M0 70 Q60 10 120 45 Q180 80 240 25" stroke={T.green} strokeWidth="3" fill="none" />
            <path d="M0 85 Q60 25 120 60 Q180 95 240 40" stroke={T.green} strokeWidth="1.5" fill="none" />
          </svg>

          <div style={{ position: "relative", zIndex: 1, maxWidth: 520 }}>
            <p style={{
              fontFamily: "'Inter', sans-serif", fontSize: 11,
              letterSpacing: "0.12em", color: T.green, fontWeight: 700,
              opacity: 0.75, marginBottom: 10
            }}>✦ FEATURED TOOL</p>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(22px, 2.8vw, 32px)", fontWeight: 700,
              color: T.textPrimary, lineHeight: 1.22, marginBottom: 10
            }}>
              Advanced Editor —<br />total page control.
            </h2>
            <p style={{
              fontFamily: "'Inter', sans-serif", fontSize: 14,
              color: "#333", lineHeight: 1.65, marginBottom: 24, maxWidth: 360
            }}>
              Drag to reorder, rotate, delete, or insert pages in a visual canvas. No uploads to external servers.
            </p>
            <div style={{ marginBottom: 40 }}>
              <Btn variant="dark" onClick={() => onNav("/login")}>
                Open Editor <ArrowRight size={13} />
              </Btn>
            </div>
          </div>

          {/* Torn edge */}
          <TornEdge />
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Welcome Banner (logged-in dashboard header) ───────────────────────────── */
function WelcomeBanner({ user }) {
  const displayName = user?.displayName || user?.email?.split("@")[0] || "there";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        background: `linear-gradient(135deg, ${T.green} 0%, #1a5456 100%)`,
        borderRadius: 18, padding: "36px 40px", marginBottom: 36,
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Decorative circles */}
      <div style={{
        position: "absolute", right: -30, top: -30,
        width: 140, height: 140, borderRadius: "50%",
        border: `2px solid rgba(255,255,255,0.08)`,
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", right: 40, bottom: -20,
        width: 80, height: 80, borderRadius: "50%",
        border: `2px solid rgba(255,255,255,0.06)`,
        pointerEvents: "none",
      }} />

      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 12,
        letterSpacing: "0.12em", color: T.accent, fontWeight: 600,
        marginBottom: 8, textTransform: "uppercase",
      }}>
        ✦ Welcome back
      </p>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 700,
        color: "#fff", lineHeight: 1.2, marginBottom: 6,
      }}>
        Hey {displayName} 👋
      </h2>
      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        color: "rgba(255,255,255,0.55)", lineHeight: 1.6,
      }}>
        Pick a tool below to get started with your PDFs.
      </p>
    </motion.div>
  );
}

/* ─── Filter Tags ───────────────────────────────────────────────────────────── */
function FilterTags({ active, setActive }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {FILTERS.map((f) => {
        const isActive = active === f;
        return (
          <button key={f} onClick={() => setActive(f)}
            style={{
              borderRadius: 99, fontSize: 13,
              fontFamily: "'Inter', sans-serif", fontWeight: isActive ? 600 : 400,
              padding: "7px 18px",
              border: `1.5px solid ${isActive ? T.accent : T.border}`,
              backgroundColor: isActive ? T.accent : "transparent",
              color: isActive ? T.textPrimary : T.textSecondary,
              cursor: "pointer", transition: "all 0.2s ease"
            }}>
            {f}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Stats Bar ─────────────────────────────────────────────────────────────── */
function StatsBar() {
  const stats = [
    { value: "4M+", label: "Documents processed" },
    { value: "99.9%", label: "Uptime guarantee" },
    { value: "128-bit", label: "AES encryption" },
    { value: "Free", label: "Always, forever" },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55 }}
      style={{
        backgroundColor: T.green, borderRadius: 16, padding: "28px 32px",
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16
      }}>
      {stats.map((s) => (
        <div key={s.label} style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 28, fontWeight: 700, color: T.accent
          }}>{s.value}</div>
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 13,
            color: "rgba(255,255,255,0.6)", marginTop: 4
          }}>{s.label}</div>
        </div>
      ))}
    </motion.div>
  );
}

/* ─── Tool Card ─────────────────────────────────────────────────────────────── */
function ToolCard({ tool, index, onNav }) {
  const Icon = tool.icon;
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: T.card, borderRadius: 16,
        border: `1px solid ${hovered ? T.accent : T.border}`,
        padding: "28px 28px 24px", position: "relative",
        cursor: "pointer", display: "flex", flexDirection: "column",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered ? "0 10px 36px rgba(0,0,0,0.09)" : "0 2px 12px rgba(0,0,0,0.04)",
        transition: "all 0.2s ease",
      }}
      onClick={() => onNav(tool.path)}
    >
      {/* Tag badge */}
      {tool.tag && (
        <span style={{
          position: "absolute", top: 16, right: 16,
          fontSize: 10, fontFamily: "'Inter', sans-serif", fontWeight: 700,
          letterSpacing: "0.07em",
          backgroundColor: tool.tag === "Pro" ? T.green : T.accent,
          color: tool.tag === "Pro" ? "#fff" : T.textPrimary,
          borderRadius: 6, padding: "3px 9px"
        }}>
          {tool.tag}
        </span>
      )}

      {/* Icon tile */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, backgroundColor: T.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 18, border: `1px solid ${T.border}`, flexShrink: 0
      }}>
        <Icon size={19} color={T.green} strokeWidth={1.8} />
      </div>

      <h3 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 18, fontWeight: 700, color: T.textPrimary, marginBottom: 8
      }}>
        {tool.title}
      </h3>
      <p style={{
        fontFamily: "'Inter', sans-serif", fontSize: 14,
        color: T.textSecondary, lineHeight: 1.65, flex: 1
      }}>
        {tool.description}
      </p>

      {/* Use tool link */}
      <div style={{
        marginTop: 20, display: "inline-flex", alignItems: "center",
        gap: 6, color: T.green, fontSize: 13,
        fontFamily: "'Inter', sans-serif", fontWeight: 600
      }}>
        Use tool <ArrowRight size={13} />
      </div>
    </motion.div>
  );
}

/* ─── Tools Section ─────────────────────────────────────────────────────────── */
function ToolsSection({ onNav, user }) {
  const [activeFilter, setActiveFilter] = useState("All Tools");
  return (
    <section style={{ backgroundColor: T.bg, padding: "80px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        {/* Welcome banner for logged-in users */}
        {user && <WelcomeBanner user={user} />}

        {/* Header row */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 20,
          justifyContent: "space-between", alignItems: "flex-end", marginBottom: 36
        }}>
          <div>
            <p style={{
              fontFamily: "'Inter', sans-serif", fontSize: 11,
              letterSpacing: "0.12em", color: T.textSecondary,
              fontWeight: 600, marginBottom: 8
            }}>✦ THE TOOLKIT</p>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(26px, 3.2vw, 38px)", fontWeight: 700,
              color: T.textPrimary, lineHeight: 1.18
            }}>
              Everything you need,<br />
              <span style={{ color: T.accent, fontStyle: "italic" }}>nothing you don't.</span>
            </h2>
          </div>
          <FilterTags active={activeFilter} setActive={setActiveFilter} />
        </div>

        <StatsBar />

        {/* Grid */}
        <div style={{
          marginTop: 44, display: "grid", gap: 20,
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"
        }}>
          {TOOLS.map((tool, i) => (
            <ToolCard key={tool.id} tool={tool} index={i} onNav={onNav} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────────── */
function Footer({ onNav }) {
  return (
    <footer style={{ backgroundColor: T.textPrimary, padding: "36px 24px" }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", display: "flex",
        flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between"
      }}>
        <button onClick={() => onNav("/")}
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 16, fontWeight: 700, color: "#fff",
            background: "none", border: "none", cursor: "pointer"
          }}>
          ATSTRACK-PDFS
        </button>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13,
          color: "rgba(255,255,255,0.38)", textAlign: "center"
        }}>
          © 2026 ATSTRACK-PDFS · Premium Productivity
        </p>
        <div style={{ display: "flex", gap: 20 }}>
          {[].map((l) => (
            <a key={l} href="#"
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13,
                color: "rgba(255,255,255,0.42)", textDecoration: "none"
              }}>
              {l}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* ─── Root Landing Page (DUAL MODE) ─────────────────────────────────────────── */
export default function Landing({ user }) {
  const navigate = useNavigate();

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F4F1EA; }
        button { outline: none; }
      `}</style>

      <Navbar onNav={navigate} user={user} />

      {/* MODE 1: Not logged in → Hero + Tools (as marketing) */}
      {/* MODE 2: Logged in   → Tools only (as dashboard)    */}
      {!user && <Hero onNav={navigate} />}

      <ToolsSection onNav={navigate} user={user} />
      <Footer onNav={navigate} />
    </div>
  );
}
