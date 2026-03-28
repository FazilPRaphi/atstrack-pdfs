import { motion as Motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ToolCard({ title, description, icon: Icon, path, color }) {
  const navigate = useNavigate();
  if (!Icon) return null;

  return (
    <Motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(path)}
      className="glass group flex h-full cursor-pointer flex-col gap-5 overflow-hidden rounded-2xl p-6 transition-all hover:bg-white/5 hover:border-[var(--primary)]"
      style={{
        borderColor: color ? `rgba(${color}, 0.2)` : "rgba(255,255,255,0.08)",
      }}
    >
      <div 
        className="flex h-[60px] w-[60px] items-center justify-center rounded-xl transition-colors group-hover:bg-white/10"
        style={{ background: `rgba(${color}, 0.1)` }}
      >
        <Icon className="transition-transform group-hover:scale-110" style={{ color: `rgb(${color})` }} size={28} />
      </div>
      
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-bold text-white transition-colors group-hover:text-[var(--primary)]">{title}</h3>
        <p className="text-sm leading-relaxed text-slate-400">{description}</p>
      </div>

      <div className="mt-auto pt-2">
        <span 
          className="flex items-center gap-1.5 text-sm font-bold tracking-wide uppercase opacity-80 group-hover:opacity-100"
          style={{ color: `rgb(${color})` }}
        >
          Try now <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
      
      {/* Decorative Glow */}
      <div 
        className="absolute -top-[10%] -right-[10%] h-1/2 w-1/2 rounded-full blur-[40px] opacity-20 pointer-events-none"
        style={{ 
          background: `radial-gradient(circle, rgba(${color}, 0.3) 0%, transparent 70%)`,
        }} 
      />
    </Motion.div>
  );
}
