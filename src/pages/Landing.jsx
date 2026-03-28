import { motion as Motion } from "framer-motion";
import { Layers, Scissors, Image as ImageIcon, Sparkles, Wand2, FileEdit } from "lucide-react";
import { Link } from "react-router-dom";
import ToolCard from "../components/ToolCard";
import Navbar from "../components/Navbar";

const TOOLS = [
    {
        id: "merge",
        title: "Merge PDF",
        description: "Combine multiple PDF documents into one single file quickly and easily.",
        icon: Layers,
        path: "/merge",
        color: "124, 58, 237",
    },
    {
        id: "split",
        title: "Split PDF",
        description: "Extract specific pages from your PDF or separate it into multiple documents.",
        icon: Scissors,
        path: "/split",
        color: "14, 165, 233",
    },
    {
        id: "images-to-pdf",
        title: "Images to PDF",
        description: "Convert JPG, PNG, or other image formats into a single professional PDF.",
        icon: ImageIcon,
        path: "/images-to-pdf",
        color: "16, 185, 129",
    },
    {
        id: "watermark",
        title: "Watermark",
        description: "Stamp text or an image over your PDF to protect its copyright securely.",
        icon: Sparkles,
        path: "/watermark",
        color: "245, 158, 11",
    },
    {
        id: "rotate",
        title: "Rotate PDF",
        description: "Quickly rotate pages in your PDF document to the correct orientation.",
        icon: Wand2,
        path: "/rotate",
        color: "239, 68, 68",
    },
    {
        id: "editor",
        title: "Advanced Editor",
        description: "Reorder, rotate, delete, and add pages visually in our pro editor.",
        icon: FileEdit,
        path: "/editor",
        color: "139, 92, 246",
    },
];

export default function Landing({ user }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0b10]">
      <Navbar user={user} />
      
      <main className="container mx-auto flex-1 px-6 py-16">
        <section className="mx-auto mb-20 max-w-3xl text-center">
          <Motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl"
          >
            All-in-One <span className="text-[var(--primary)]">PDF Toolkit</span>
          </Motion.h1>
          <Motion.p 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-400 sm:text-xl"
          >
            Powerful, secure, and easy-to-use tools to manage your PDF documents online for free.
          </Motion.p>

          <Motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-8 flex justify-center"
          >
            <Link
              to="/editor"
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--primary)] px-7 py-3 text-xs font-black uppercase tracking-widest text-white hover:brightness-110 transition-all"
            >
              Start Editing
            </Link>
          </Motion.div>
        </section>

        <section className="grid grid-cols-1 gap-8 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool, index) => (
            <Motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.05 }}
              className="h-full"
            >
              <ToolCard {...tool} />
            </Motion.div>
          ))}
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-sm text-slate-500">
        <span>© 2026 PDFWise • Premium Productivity</span>
      </footer>
    </div>
  );
}

