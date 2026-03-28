import { useState } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Scissors, Download, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import FileUpload from "../components/FileUpload";
import { api } from "../api";
import { auth } from "../firebase";

export default function Split() {
  const [file, setFile] = useState(null);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSplit = async () => {
    if (!file) {
      setError("Please select a PDF file.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const data = await api.splitPdf(
        file,
        Number(startPage),
        Number(endPage)
      );

      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Split failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStartPage(1);
    setEndPage(1);
    setIsProcessing(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0b10]">
      <Navbar user={auth.currentUser} />
      
      <main className="container mx-auto max-w-3xl flex-1 px-6 py-16">
        <div className="mb-12 text-center">
          <div className="glass mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <Scissors className="text-[var(--secondary)]" size={24} />
          </div>
          <h1 className="mb-3 text-4xl font-extrabold text-white">Split PDF</h1>
          <p className="text-lg text-slate-400">Extract a range of pages from your PDF document.</p>
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

                {file && (
                  <Motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="grid grid-cols-2 gap-5 rounded-2xl bg-white/5 p-5"
                  >
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Start Page</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={startPage}
                        onChange={(e) => setStartPage(Number(e.target.value))}
                        className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-white outline-none focus:border-[var(--secondary)]"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">End Page</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={endPage}
                        onChange={(e) => setEndPage(Number(e.target.value))}
                        className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-white outline-none focus:border-[var(--secondary)]"
                      />
                    </div>
                  </Motion.div>
                )}

                {error && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleSplit}
                  disabled={!file || isProcessing}
                  className="mt-3 flex items-center justify-center gap-3 rounded-xl bg-[var(--secondary)] py-4 font-bold text-white shadow-lg transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Scissors size={20} />
                      <span>Split PDF</span>
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
                <h2 className="text-2xl font-bold text-white">PDF Split Successfully!</h2>
                <p className="text-slate-400">Your extracted pages are ready for download.</p>
                
                <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
                  <a 
                    href={api.getDownloadUrl(result.file)} 
                    download 
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
                    <span>Split Another</span>
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
