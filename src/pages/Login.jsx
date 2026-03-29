import { useState, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

/* ─── inline styles ─────────────────────────────────────────── */
const S = {
  page: {
    minHeight: "100vh",
    background: "#F5F1E8",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  bgDeco: {
    position: "absolute",
    top: 0, left: 0,
    width: "100%", height: "100%",
    pointerEvents: "none",
    zIndex: 1,
  },
  personIllo: {
    position: "absolute",
    right: "60px",
    bottom: "60px",
    zIndex: 2,
    pointerEvents: "none",
  },
  navbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 40px",
    position: "relative",
    zIndex: 10,
  },
  logoText: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#1a1a1a",
    letterSpacing: "-0.5px",
  },
  logoSub: { fontSize: "11px", color: "#888", marginTop: "2px" },
  logoArrow: { color: "#F4A94E" },
  navRight: { display: "flex", alignItems: "center", gap: "12px" },
  btnGhost: {
    background: "none", border: "none",
    fontSize: "13px", fontWeight: 500, color: "#444",
    cursor: "pointer", padding: "8px 14px",
    borderRadius: "8px", transition: "background 0.2s",
  },
  btnPrimary: {
    background: "#F4B266", border: "none",
    color: "#fff", fontSize: "13px", fontWeight: 600,
    padding: "9px 18px", borderRadius: "9px",
    cursor: "pointer", transition: "background 0.2s",
    boxShadow: "0 2px 8px rgba(244,178,102,0.28)",
  },
  main: {
    display: "flex", alignItems: "center", justifyContent: "center",
    flex: 1, padding: "20px", position: "relative", zIndex: 5,
  },
  card: {
    background: "#fff", borderRadius: "22px",
    width: "100%", maxWidth: "420px",
    padding: "36px 38px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
  },
  cardTitle: {
    textAlign: "center", fontSize: "24px",
    fontWeight: 700, color: "#1e1e1e", marginBottom: "8px",
  },
  cardSub: {
    textAlign: "center", fontSize: "13px",
    color: "#888", lineHeight: 1.6, marginBottom: "26px",
  },
  fieldGroup: { marginBottom: "14px" },
  fieldLabel: {
    display: "block", fontSize: "12px", fontWeight: 600,
    color: "#555", marginBottom: "6px", letterSpacing: "0.01em",
  },
  input: {
    width: "100%", background: "#FAFAFA",
    border: "1px solid #E5E5E5", borderRadius: "9px",
    padding: "11px 14px", fontSize: "14px", color: "#222",
    outline: "none", transition: "border-color 0.2s",
    boxSizing: "border-box",
  },
  pwToggle: {
    position: "absolute", right: "12px", top: "50%",
    transform: "translateY(-50%)", fontSize: "12px",
    color: "#F4B266", cursor: "pointer",
    fontWeight: 500, userSelect: "none",
  },
  helpText: { fontSize: "12px", color: "#AAA", marginBottom: "20px" },
  helpLink: { color: "#F4A94E", cursor: "pointer" },
  signInBtn: {
    width: "100%", background: "#F4B266", border: "none",
    borderRadius: "10px", height: "44px", fontSize: "15px",
    fontWeight: 600, color: "#fff", cursor: "pointer",
    boxShadow: "0 3px 14px rgba(244,178,102,0.32)",
    transition: "background 0.2s, box-shadow 0.2s",
    marginBottom: "22px",
  },
  divider: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" },
  dividerLine: { flex: 1, height: "1px", background: "#E8E8E8" },
  dividerText: { fontSize: "12px", color: "#BBBBBB", whiteSpace: "nowrap" },
  socialRow: { display: "flex", gap: "10px", marginBottom: "22px" },
  socialBtn: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    gap: "8px", border: "1px solid #E8E8E8", background: "#fff",
    borderRadius: "9px", padding: "10px 6px",
    cursor: "pointer", transition: "background 0.2s",
    fontSize: "13px", fontWeight: 500, color: "#333",
  },
  errorBox: {
    background: "#FFF2F2", border: "1px solid #FFD6D6",
    borderRadius: "8px", padding: "10px 14px",
    marginBottom: "16px", fontSize: "13px", color: "#C0392B",
    textAlign: "center",
  },
  footerText: { textAlign: "center", fontSize: "12.5px", color: "#AAA" },
  footerLink: { color: "#F4B266", cursor: "pointer", fontWeight: 500 },
};

/* ─── Google SVG icon ────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

/* ─── component ──────────────────────────────────────────────── */
export default function Login() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  /* handle Google redirect result on mount */
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => { if (result?.user) navigate("/"); })
      .catch(console.error);
  }, [navigate]);

  /* ── Google OAuth ── */
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    setLoading(true);
    try {
      await signInWithPopup(auth, provider);
      navigate("/");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        try { await signInWithRedirect(auth, provider); }
        catch (err2) { handleError(err2); }
      } else {
        handleError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Email auth ── */
  const handleEmailAuth = async () => {
    setError("");
    if (!email || !password) return setError("Please fill all fields.");
    if (isSignup && password !== confirmPw) return setError("Passwords do not match.");
    if (isSignup && password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate("/");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleError = (err) => {
    const map = {
      "auth/email-already-in-use": "Email already exists. Try logging in.",
      "auth/user-not-found": "No account found. Please sign up.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/invalid-email": "Invalid email address.",
      "auth/popup-closed-by-user": "Popup closed. Try again.",
      "auth/weak-password": "Password is too weak.",
    };
    setError(map[err.code] || "Something went wrong. Please try again.");
  };

  const switchMode = () => {
    setError("");
    setEmail("");
    setPassword("");
    setConfirmPw("");
    setIsSignup((v) => !v);
  };

  const focusBorder = (e) => (e.target.style.borderColor = "#F4B266");
  const blurBorder = (e) => (e.target.style.borderColor = "#E5E5E5");
  const hoverBtn = (e) => { e.currentTarget.style.background = "#e89d48"; };
  const unhoverBtn = (e) => { e.currentTarget.style.background = "#F4B266"; };

  return (
    <div style={S.page}>

      {/* ── Background SVG decorations ── */}
      <svg style={S.bgDeco} viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <path d="M80 200 Q110 170 140 200 Q170 230 200 200 Q230 170 260 200" stroke="#C8C0B0" strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M40 320 Q70 290 100 320 Q130 350 160 320 Q190 290 220 320" stroke="#C8C0B0" strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M100 450 Q130 420 160 450 Q190 480 220 450" stroke="#C8C0B0" strokeWidth="1.5" fill="none" opacity="0.6" />
        <circle cx="60" cy="500" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="76" cy="500" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="92" cy="500" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="60" cy="516" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="76" cy="516" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="92" cy="516" r="3" fill="#C8C0B0" opacity="0.5" />
        <polygon points="140,80 170,120 110,120" stroke="#B8B0A0" strokeWidth="1.2" fill="none" opacity="0.6" />
        <rect x="160" y="600" width="36" height="36" rx="6" fill="#F4B266" opacity="0.45" />
        <path d="M380 60 Q400 40 420 60 Q440 80 460 60" stroke="#C0B9A8" strokeWidth="1.2" fill="none" opacity="0.55" />
        <line x1="820" y1="80" x2="920" y2="80" stroke="#C0B9A8" strokeWidth="1" opacity="0.5" />
        <line x1="840" y1="95" x2="940" y2="95" stroke="#C0B9A8" strokeWidth="1" opacity="0.4" />
        <line x1="830" y1="110" x2="910" y2="110" stroke="#C0B9A8" strokeWidth="1" opacity="0.3" />
        <circle cx="960" cy="140" r="28" stroke="#C0B9A8" strokeWidth="1.2" fill="none" opacity="0.5" />
        <circle cx="960" cy="140" r="18" stroke="#F4B266" strokeWidth="1" fill="none" opacity="0.4" />
        <circle cx="900" cy="55" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="916" cy="55" r="3" fill="#C8C0B0" opacity="0.5" />
        <circle cx="932" cy="55" r="3" fill="#C8C0B0" opacity="0.5" />
        <rect x="1080" y="100" width="28" height="28" rx="5" fill="#F4B266" opacity="0.4" />
        <path d="M900 680 Q930 650 960 680 Q990 710 1020 680 Q1050 650 1080 680" stroke="#C0B9A8" strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M940 720 Q970 690 1000 720 Q1030 750 1060 720" stroke="#C0B9A8" strokeWidth="1.2" fill="none" opacity="0.4" />
        <line x1="310" y1="660" x2="310" y2="690" stroke="#C0B9A8" strokeWidth="1.2" opacity="0.5" />
        <line x1="296" y1="675" x2="326" y2="675" stroke="#C0B9A8" strokeWidth="1.2" opacity="0.5" />
        <line x1="1110" y1="350" x2="1110" y2="380" stroke="#C0B9A8" strokeWidth="1.2" opacity="0.5" />
        <line x1="1096" y1="365" x2="1126" y2="365" stroke="#C0B9A8" strokeWidth="1.2" opacity="0.5" />
      </svg>

      {/* ── Person illustration ── */}
      <svg style={S.personIllo} width="220" height="240" viewBox="0 0 220 240" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="185" width="180" height="6" rx="3" fill="#D4CFC6" opacity="0.8" />
        <rect x="40" y="191" width="8" height="40" rx="3" fill="#C4BFB6" opacity="0.7" />
        <rect x="172" y="191" width="8" height="40" rx="3" fill="#C4BFB6" opacity="0.7" />
        <rect x="55" y="164" width="110" height="22" rx="4" fill="#B8B4AC" opacity="0.9" />
        <rect x="60" y="115" width="100" height="56" rx="5" fill="#8A8680" opacity="0.85" />
        <rect x="65" y="120" width="90" height="46" rx="3" fill="#F5F1E8" opacity="0.9" />
        <rect x="72" y="128" width="50" height="4" rx="2" fill="#F4B266" opacity="0.8" />
        <rect x="72" y="136" width="70" height="3" rx="1.5" fill="#C0B9A8" opacity="0.7" />
        <rect x="72" y="142" width="60" height="3" rx="1.5" fill="#C0B9A8" opacity="0.6" />
        <rect x="72" y="150" width="76" height="3" rx="1.5" fill="#C0B9A8" opacity="0.5" />
        <rect x="100" y="163" width="20" height="4" rx="2" fill="#A09C94" opacity="0.9" />
        <ellipse cx="110" cy="155" rx="22" ry="28" fill="#E8C9A0" opacity="0.9" />
        <path d="M90 165 Q92 185 110 188 Q128 185 130 165 Q122 172 110 172 Q98 172 90 165Z" fill="#5A7FAA" opacity="0.85" />
        <ellipse cx="110" cy="100" rx="18" ry="20" fill="#E8C9A0" opacity="0.9" />
        <path d="M92 96 Q96 80 110 78 Q124 80 128 96 Q124 90 110 89 Q96 90 92 96Z" fill="#5A4030" opacity="0.85" />
        <circle cx="104" cy="100" r="2" fill="#5A4030" opacity="0.7" />
        <circle cx="116" cy="100" r="2" fill="#5A4030" opacity="0.7" />
        <path d="M106 108 Q110 112 114 108" stroke="#5A4030" strokeWidth="1.2" fill="none" opacity="0.6" />
        <path d="M88 165 Q74 175 72 185" stroke="#E8C9A0" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.9" />
        <path d="M132 165 Q146 175 148 185" stroke="#E8C9A0" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.9" />
        <circle cx="175" cy="105" r="5" fill="#F4B266" opacity="0.5" />
        <circle cx="188" cy="90" r="3" fill="#F4B266" opacity="0.35" />
        <path d="M40 120 Q50 110 60 120 Q70 130 80 120" stroke="#C0B9A8" strokeWidth="1.2" fill="none" opacity="0.5" />
      </svg>

      {/* ── Navbar ── */}
      <nav style={S.navbar}>
        <div>
          <div style={S.logoText}>ATSTRACK</div>
          <div style={S.logoSub}>
             <span style={S.logoArrow}>→</span>
          </div>
        </div>
        <div style={S.navRight}>
          <button
            style={S.btnGhost}
            onClick={switchMode}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            {isSignup ? "Login" : "Sign up"}
          </button>
          
        </div>
      </nav>

      {/* ── Main card ── */}
      <main style={S.main}>
        <AnimatePresence mode="wait">
          <Motion.div
            key={isSignup ? "signup" : "login"}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={S.card}
          >
            <h1 style={S.cardTitle}>{isSignup ? "Create Account" : " Login"}</h1>
            <p style={S.cardSub}>
              {isSignup
                ? "Fill in your details to create a new account"
                : "Hey, Enter your details to get sign in\nto your account"}
            </p>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <Motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={S.errorBox}
                >
                  {error}
                </Motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Email </label>
              <input
                type="email"
                placeholder="Email "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={S.input}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {/* Password */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...S.input, paddingRight: "50px" }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
                <span style={S.pwToggle} onClick={() => setShowPw((v) => !v)}>
                  {showPw ? "Hide" : "Show"}
                </span>
              </div>
            </div>

            {/* Confirm Password (signup only) */}
            <AnimatePresence>
              {isSignup && (
                <Motion.div
                  key="confirm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ ...S.fieldGroup, marginTop: "2px" }}>
                    <label style={S.fieldLabel}>Confirm Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showConfirmPw ? "text" : "password"}
                        placeholder="Re-enter password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        style={{ ...S.input, paddingRight: "50px" }}
                        onFocus={focusBorder}
                        onBlur={blurBorder}
                      />
                      <span style={S.pwToggle} onClick={() => setShowConfirmPw((v) => !v)}>
                        {showConfirmPw ? "Hide" : "Show"}
                      </span>
                    </div>
                  </div>
                </Motion.div>
              )}
            </AnimatePresence>

            {/* Help text (login only) */}
            {!isSignup && (
              <p style={S.helpText}>
                Having trouble in sign in?{" "}
                <span style={S.helpLink}>Get help</span>
              </p>
            )}

            {/* Primary CTA */}
            <button
              onClick={handleEmailAuth}
              disabled={loading}
              style={{
                ...S.signInBtn,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!loading) hoverBtn(e); }}
              onMouseLeave={(e) => { if (!loading) unhoverBtn(e); }}
            >
              {loading ? "Please wait…" : isSignup ? "Create Account" : "Sign In"}
            </button>

            {/* Divider */}
            <div style={S.divider}>
              <div style={S.dividerLine} />
              <span style={S.dividerText}>Or continue with</span>
              <div style={S.dividerLine} />
            </div>

            {/* Google OAuth */}
            <div style={S.socialRow}>
              <button
                onClick={loginWithGoogle}
                disabled={loading}
                style={{
                  ...S.socialBtn,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>

            {/* Toggle login / signup */}
            <p style={S.footerText}>
              {isSignup ? "Already have an account? " : "Don't have an account? "}
              <span style={S.footerLink} onClick={switchMode}>
                {isSignup ? "Login" : "Request Now"}
              </span>
            </p>
          </Motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
