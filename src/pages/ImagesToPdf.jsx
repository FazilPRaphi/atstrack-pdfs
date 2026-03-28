import { useState, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
  Image as ImageIcon,
  Download,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";

import Navbar from "../components/Navbar";
import FileUpload from "../components/FileUpload";
import { api } from "../api";
import { auth } from "../firebase";

export default function ImagesToPdf() {
  const [images, setImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // ✅ FIX: Firebase auth state (production safe)
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return () => unsub();
  }, []);

  const handleConvert = async () => {
    if (images.length === 0) {
      setError("Please select at least one image to convert.");
      return;
    }

    // ✅ FIX: File size validation (5MB limit)
    if (images.some((img) => img.size > 5 * 1024 * 1024)) {
      setError("Each image must be under 5MB.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const data = await api.imagesToPdf(images);

      // ✅ FIX: Validate backend response
      if (!data || !data.file) {
        throw new Error("Invalid response from server.");
      }

      setResult(data);
    } catch (err) {
      console.error("Conversion error:", err);

      // ✅ FIX: Better error messages
      setError(
        err?.message || "Failed to convert images to PDF. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setImages([]);
    setResult(null);
    setError(null);
    setIsProcessing(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0b10]">
      <Navbar user={user} />

      <main className="container mx-auto max-w-3xl flex-1 px-6 py-16">
        <div className="mb-12 text-center">
          <div className="glass mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <ImageIcon className="text-[#10b981]" size={24} />
          </div>

          <h1 className="mb-3 text-4xl font-extrabold text-white">
            Images to PDF
          </h1>

          <p className="text-lg text-slate-400">
            Convert JPG, PNG, and other images to a high-quality PDF.
          </p>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            {!result ? (
              <Motion.div
                key="upload-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="glass flex flex-col gap-6 rounded-3xl p-8"
              >
                <FileUpload
                  multiple
                  maxFiles={10}
                  accept="image/*"
                  onFilesSelected={setImages}
                />

                {error && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleConvert}
                  disabled={images.length === 0 || isProcessing}
                  className="mt-3 flex items-center justify-center gap-3 rounded-xl bg-[#10b981] py-4 font-bold text-white shadow-lg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>
                        Processing...
                        <span className="block text-xs opacity-70">
                          (First request may take a few seconds)
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <ImageIcon size={20} />
                      <span>Generate PDF</span>
                    </>
                  )}
                </button>
              </Motion.div>
            ) : (
              <Motion.div
                key="success-card"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass flex flex-col items-center gap-4 rounded-3xl p-12 text-center"
              >
                <div className="mb-2">
                  <RefreshCw size={48} className="text-[#10b981]" />
                </div>

                <h2 className="text-2xl font-bold text-white">
                  Conversion Complete!
                </h2>

                <p className="text-slate-400">
                  Your PDF has been created from {images.length} image
                  {images.length !== 1 ? "s" : ""}.
                </p>

                <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
                  {/* ✅ FIX: Safe download URL */}
                  <a
                    href={api.getDownloadUrl(result.file)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 rounded-xl bg-[var(--primary)] py-4 font-bold text-white shadow-lg transition-all hover:brightness-110"
                  >
                    <Download size={20} />
                    <span>Download PDF</span>
                  </a>

                  <button
                    onClick={reset}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <RefreshCw size={18} />
                    <span>Convert More</span>
                  </button>
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}