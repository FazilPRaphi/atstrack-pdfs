import { useState } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Sparkles, Download, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import FileUpload from "../components/FileUpload";
import { api } from "../api";
import { auth } from "../firebase";

export default function Watermark() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("CONFIDENTIAL");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleWatermark = async () => {
    if (!file || !text) {
      setError("Please select a file and enter watermark text.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      const data = await api.watermarkPdf(file, text);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to add watermark. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setText("CONFIDENTIAL");
    setResult(null);
    setError(null);
    setIsProcessing(false);
  };

  return (
    <div style={{ backgroundColor: "#F4F1EA", minHeight: "100vh" }}>
      <Navbar user={auth.currentUser} />

      <main style={{ padding: "80px 24px", textAlign: "center" }}>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 48,
          marginBottom: 10
        }}>
          WATERMARK PDF
        </h1>

        <p style={{ color: "#6B6B6B", marginBottom: 40 }}>
          Add text watermark to protect your document.
        </p>

        {/* HERO CARD */}
        <div style={{
          maxWidth: 900,
          margin: "0 auto 60px",
          backgroundColor: "#E8DDC7",
          borderRadius: 16,
          padding: "60px 40px",
          textAlign: "left"
        }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 36
          }}>
            Secure your PDFs <br /> with watermark text.
          </h2>
        </div>

        {/* TOOL CARD */}
        <div style={{
          maxWidth: 520,
          margin: "0 auto",
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: "40px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.05)"
        }}>

          <FileUpload onFilesSelected={(f) => setFile(f[0])} />

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter watermark text"
            style={{
              width: "100%",
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #E5E5E5"
            }}
          />

          {error && (
            <div style={{
              marginTop: 16,
              background: "#FEF2F2",
              padding: 12,
              borderRadius: 10,
              color: "#dc2626"
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleWatermark}
            style={{
              width: "100%",
              marginTop: 20,
              padding: "14px",
              borderRadius: 10,
              backgroundColor: "#E6B36A",
              border: "none",
              fontWeight: 600
            }}
          >
            Add Watermark
          </button>
        </div>
      </main>
    </div>
  );
}
