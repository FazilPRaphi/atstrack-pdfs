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
    <div className="flex min-h-screen flex-col bg-[#0a0b10]">
      <Navbar user={auth.currentUser} />
      
      <main className="container mx-auto max-w-3xl flex-1 px-6 py-16">
        <div className="mb-12 text-center">
          <div className="glass mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <Sparkles className="text-amber-500" size={24} />
          </div>
          <h1 className="mb-3 text-4xl font-extrabold text-white">Watermark PDF</h1>
          <p className="text-lg text-slate-400">Stamp text over your PDF to protect its copyright securely.</p>
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
                  onFilesSelected={(files) => setFile(files[0] || null)} 
                />

                <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Watermark Text</label>
                  <input 
                    type="text" 
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-white outline-none focus:border-amber-500 disabled:opacity-50"
                    placeholder="e.g. DRAFT, CONFIDENTIAL"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">This text will be stamped diagonally across every page.</p>
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleWatermark}
                  disabled={!file || !text || isProcessing}
                  className="mt-3 flex items-center justify-center gap-3 rounded-xl bg-amber-500 py-4 font-bold text-white shadow-lg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      <span>Add Watermark</span>
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
                <h2 className="text-2xl font-bold text-white">Watermark Added Successfully!</h2>
                <p className="text-slate-400">Your protected PDF is ready for download.</p>
                
                <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
                  <a 
                    href={api.getDownloadUrl(result.file)} 
                    download 
                    className="flex items-center justify-center gap-3 rounded-xl bg-amber-500 py-4 font-bold text-white shadow-lg transition-all hover:brightness-110"
                  >
                    <Download size={20} />
                    <span>Download PDF</span>
                  </a>
                  
                  <button 
                    onClick={reset} 
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4 font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <RefreshCw size={18} />
                    <span>Watermark Another</span>
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
