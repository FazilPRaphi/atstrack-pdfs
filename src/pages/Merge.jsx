import { useState, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Download,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";

import Navbar from "../components/Navbar";
import FileUpload from "../components/FileUpload";
import { api } from "../api";
import { auth } from "../firebase";

export default function Merge() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // ✅ FIX: Firebase auth safe handling
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return () => unsub();
  }, []);

  const handleMerge = async () => {
    if (files.length < 2) {
      setError("Please select at least 2 PDF files to merge.");
      return;
    }

    // ✅ FIX: File validation (size limit 10MB)
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Each file must be under 10MB.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const data = await api.mergePdf(files);

      // ✅ FIX: Validate backend response
      if (!data || !data.file) {
        throw new Error("Invalid response from server.");
      }

      setResult(data);
    } catch (err) {
      console.error("Merge error:", err);

      setError(
        err?.message || "Failed to merge PDFs. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
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
            <Layers className="text-[var(--primary)]" size={24} />
          </div>

          <h1 className="mb-3 text-4xl font-extrabold text-white">
            Merge PDF
          </h1>

          <p className="text-lg text-slate-400">
            Combine multiple PDF files into one in the order you want.
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
                  maxFiles={5}
                  accept="application/pdf"
                  onFilesSelected={setFiles}
                />

                {error && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleMerge}
                  disabled={files.length < 2 || isProcessing}
                  className="mt-3 flex items-center justify-center gap-3 rounded-xl bg-[var(--primary)] py-4 font-bold text-white shadow-lg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
                      <Layers size={20} />
                      <span>Merge PDFs</span>
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
                  <RefreshCw size={48} className="text-green-500" />
                </div>

                <h2 className="text-2xl font-bold text-white">
                  Merging Complete!
                </h2>

                <p className="text-slate-400">
                  Your merged PDF is ready for download.
                </p>

                <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
                  {/* ✅ FIX: Safe download */}
                  <a
                    href={api.getDownloadUrl(result.file)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 rounded-xl bg-green-500 py-4 font-bold text-white shadow-lg transition-all hover:brightness-110"
                  >
                    <Download size={20} />
                    <span>Download PDF</span>
                  </a>

                  <button
                    onClick={reset}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <RefreshCw size={18} />
                    <span>Merge More</span>
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