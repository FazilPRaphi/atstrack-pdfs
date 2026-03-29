import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

const BackButton = () => {
  const navigate = useNavigate();

  return (
    <motion.button
      onClick={() => navigate("/")}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.1, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" }}
      whileTap={{ scale: 0.95 }}
      style={{
        position: "fixed",
        left: "16px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 100,
        width: "48px",
        height: "48px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E5",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        transition: "box-shadow 0.2s ease, scale 0.2s ease",
      }}
      title="Back to Home"
    >
      <ArrowLeft size={24} color="#111111" />
      <style>{`
        @media (max-width: 640px) {
          button {
            width: 40px !important;
            height: 40px !important;
            left: 12px !important;
          }
          svg {
            width: 20px !important;
            height: 20px !important;
          }
        }
      `}</style>
    </motion.button>
  );
};

export default BackButton;
