import { useState, useRef } from "react";
import { Upload, X, File, CheckCircle } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";

export default function FileUpload({ onFilesSelected, multiple = false, accept = ".pdf", maxFiles = 5 }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const processFiles = (newFiles) => {
    const fileList = Array.from(newFiles);
    
    // Filter by type
    const validFiles = fileList.filter(f => {
      if (accept === "image/*") return f.type.startsWith("image/");
      return f.name.endsWith(".pdf");
    });
    
    let updatedFiles;
    if (multiple) {
      updatedFiles = [...files, ...validFiles].slice(0, maxFiles);
    } else {
      updatedFiles = validFiles.slice(0, 1);
    }
    
    setFiles(updatedFiles);
    onFilesSelected(updatedFiles);
  };

  const removeFile = (index) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    onFilesSelected(updatedFiles);
  };

  return (
    <div className="w-full">
      <Motion.div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
        whileHover={{ scale: 1.01 }}
        animate={{ 
          borderColor: isDragActive ? "var(--primary)" : "rgba(255,255,255,0.1)",
          background: isDragActive ? "rgba(124, 58, 237, 0.05)" : "rgba(255,255,255,0.02)"
        }}
        className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-all"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-slate-400 transition-colors group-hover:bg-white/10 group-hover:text-white">
          <Upload size={32} className={isDragActive ? "text-[var(--primary)]" : ""} />
        </div>
        
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white">Click or drag to upload</h3>
          <p className="text-sm text-slate-500">
            {multiple ? `Max ${maxFiles} files` : "Single file only" } · {accept.replace(".", "").toUpperCase()}
          </p>
        </div>
      </Motion.div>

      <div className="mt-8 flex flex-col gap-3">
        <AnimatePresence>
          {files.map((file, index) => (
            <Motion.div
              key={`${file.name}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="glass flex items-center justify-between rounded-xl bg-white/5 p-4"
            >
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="text-[var(--primary)]">
                  <File size={20} />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate text-sm font-medium text-white">{file.name}</span>
                  <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                className="group p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <X size={18} />
              </button>
            </Motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
