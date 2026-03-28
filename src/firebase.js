import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 🔥 paste your config here
const firebaseConfig = {
  apiKey: "AIzaSyAwDaOcAQVvs2AADMDoTUCj6r0X9WO9ehA",
  authDomain: "pdf-toolkit-web-app.firebaseapp.com",
  projectId: "pdf-toolkit-web-app",
  storageBucket: "pdf-toolkit-web-app.firebasestorage.app",
  messagingSenderId: "544560669903",
  appId: "1:544560669903:web:17a39ebdd2191cb31d03ba",
  measurementId: "G-BVRZ1BPQZB",
};

// init firebase
const app = initializeApp(firebaseConfig);

// init auth
export const auth = getAuth(app);
