import { useState, useEffect } from "react";
import { motion as Motion } from "framer-motion";
import { FileText } from "lucide-react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
} from "firebase/auth";

export default function Login() {
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const navigate = useNavigate(); // ✅ FIXED

    // 🔥 Handle redirect result (for Google redirect login)
    useEffect(() => {
        getRedirectResult(auth)
            .then((result) => {
                if (result?.user) {
                    navigate("/");
                }
            })
            .catch((err) => {
                console.error(err);
            });
    }, [navigate]);

    // 🔹 Google Login (Popup + fallback)
    const loginWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        try {
            // Try popup first
            await signInWithPopup(auth, provider);

            navigate("/"); // ✅ redirect

        } catch (err) {
            console.warn("Popup failed, switching to redirect", err);

            try {
                await signInWithRedirect(auth, provider); // 🔥 fallback
            } catch (err2) {
                handleError(err2);
            }
        }
    };

    // 🔹 Email Login / Signup
    const handleEmailAuth = async () => {
        try {
            setError("");

            if (!email || !password) {
                return setError("Please fill all fields");
            }

            if (isSignup) {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }

            navigate("/"); // ✅ redirect after success

        } catch (err) {
            handleError(err);
        }
    };

    // 🔥 Clean error messages
    const handleError = (err) => {
        console.error(err);

        switch (err.code) {
            case "auth/email-already-in-use":
                setError("Email already exists. Try logging in.");
                break;
            case "auth/user-not-found":
                setError("No account found. Please sign up.");
                break;
            case "auth/wrong-password":
                setError("Incorrect password.");
                break;
            case "auth/invalid-email":
                setError("Invalid email.");
                break;
            case "auth/popup-closed-by-user":
                setError("Popup closed. Try again.");
                break;
            default:
                setError("Something went wrong.");
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0b10]">

            {/* Background */}
            <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-purple-600/30 blur-[120px]"></div>
            <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-pink-600/30 blur-[120px]"></div>

            <Motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl"
            >
                {/* Logo */}
                <div className="mb-6">
                    <FileText size={40} className="mx-auto text-purple-400" />
                    <h1 className="text-2xl font-bold text-white">
                        PDF<span className="text-purple-400">Wise</span>
                    </h1>
                </div>

                {/* Header */}
                <h2 className="mb-4 text-xl font-semibold text-white">
                    {isSignup ? "Create Account" : "Welcome Back"}
                </h2>

                {/* Inputs */}
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-white/10 bg-white/10 p-2 text-white outline-none"
                />

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-white/10 bg-white/10 p-2 text-white outline-none"
                />

                {/* Button */}
                <button
                    onClick={handleEmailAuth}
                    className="w-full rounded-lg bg-purple-500 py-2 font-semibold text-white hover:bg-purple-600"
                >
                    {isSignup ? "Sign Up" : "Login"}
                </button>

                {/* Divider */}
                <p className="my-3 text-gray-400">OR</p>

                {/* Google */}
                <button
                    onClick={loginWithGoogle}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-white hover:bg-white/10"
                >
                    <img
                        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                        className="w-5"
                    />
                    Continue with Google
                </button>

                {/* Error */}
                {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

                {/* Toggle */}
                <p className="mt-4 text-sm text-gray-400">
                    {isSignup ? "Already have an account?" : "Don't have an account?"}
                    <span
                        onClick={() => {
                            setError("");
                            setIsSignup(!isSignup);
                        }}
                        className="ml-1 cursor-pointer text-purple-400"
                    >
                        {isSignup ? "Login" : "Sign up"}
                    </span>
                </p>
            </Motion.div>
        </div>
    );
}
