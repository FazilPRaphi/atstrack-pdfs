import { LogOut, User } from "lucide-react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import logo from "../assets/logo.png";

export default function Navbar({ user }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <nav className="glass sticky top-0 z-[1000] flex h-[70px] items-center border-b border-white/10 px-6 backdrop-blur-md">
      <div className="container mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 text-2xl font-extrabold text-white">
          <img src={logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
          <span>ATSTRACK-<span className="text-[var(--primary)]">PDFS</span></span>
        </Link>

        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-2.5 rounded-full bg-white/5 px-4 py-1.5 sm:flex">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--primary)] text-white">
              <User size={18} />
            </div>
            <span className="text-sm font-medium text-slate-300">
              {user?.email?.split("@")[0]}
            </span>
          </div>
          
          <button 
            onClick={handleLogout} 
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} />
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

