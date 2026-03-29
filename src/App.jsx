import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Merge from "./pages/Merge";
import Split from "./pages/Split";
import ImagesToPdf from "./pages/ImagesToPdf";
import Watermark from "./pages/Watermark";
import Rotate from "./pages/Rotate";
import EditorPro from "./pages/EditorPro";
import Compress from "./pages/Compress";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a0b10] text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-pulse rounded-full border-2 border-[var(--primary)]"></div>
        <h2 className="text-xs font-medium tracking-[0.3em] uppercase opacity-50">Loading ATSTRACK-PDFS</h2>
      </div>
    </div>
  );

  return (
    <Routes>
      {/* Landing — always accessible, renders different UI based on auth */}
      <Route
        path="/"
        element={<Landing user={user} />}
      />

      {/* Login — redirect to home if already signed in */}
      <Route
        path="/login"
        element={user ? <Navigate to="/" /> : <Login />}
      />

      {/* Protected tool routes */}
      <Route
        path="/merge"
        element={user ? <Merge /> : <Navigate to="/login" />}
      />

      <Route
        path="/split"
        element={user ? <Split /> : <Navigate to="/login" />}
      />

      <Route
        path="/images-to-pdf"
        element={user ? <ImagesToPdf /> : <Navigate to="/login" />}
      />

      <Route
        path="/watermark"
        element={user ? <Watermark /> : <Navigate to="/login" />}
      />

      <Route
        path="/rotate"
        element={user ? <Rotate /> : <Navigate to="/login" />}
      />

      <Route
        path="/editor"
        element={user ? <EditorPro /> : <Navigate to="/login" />}
      />

      {/* Redirect unknown routes */}
      <Route path="*" element={<Navigate to="/" />} />

      <Route path="/compress" element={user ? <Compress /> : <Navigate to="/login" />} />
    </Routes>

  );
}

export default App;
