import axios from "axios";

// 🔥 ENV CONFIG
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${BACKEND_URL}/api`;
const DOWNLOAD_BASE_URL =
  import.meta.env.VITE_DOWNLOAD_BASE_URL || `${BACKEND_URL}/downloads`;

// 🔥 AXIOS INSTANCE (important for production)
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30s timeout
});

// 🔥 SAFE DELAY FUNCTION
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// 🔥 JOB POLLING (FIXED)
const pollJobStatus = async (jobId, maxAttempts = 30) => {
  let attempts = 0;
  while (attempts < maxAttempts) {
    await delay(1000);
    try {
      const response = await apiClient.get(`/job/${jobId}`);
      const job = response.data;
      if (job.status === "completed") {
        if (!job?.result?.file) {
          throw new Error("Invalid file response from server");
        }
        return {
          ...job.result,
          downloadUrl: `${DOWNLOAD_BASE_URL}/${job.result.file}`,
        };
      }
      if (job.status === "failed") {
        throw new Error(job.error || "Processing failed on server");
      }
      attempts++;
    } catch (err) {
      console.error("Polling error:", err);
      if (attempts >= maxAttempts - 1) {
        throw new Error("Server is taking too long. Please try again.");
      }
      attempts++;
    }
  }
  throw new Error("Timeout: Processing took too long.");
};

// 🔥 API METHODS
export const api = {
  mergePdf: async (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const response = await apiClient.post("/merge", formData);
    return pollJobStatus(response.data.jobId);
  },

  splitPdf: async (file, startPage, endPage) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("startPage", Number(startPage));
    formData.append("endPage", Number(endPage));
    const response = await apiClient.post("/split", formData);
    return pollJobStatus(response.data.jobId);
  },

  imagesToPdf: async (images) => {
    const formData = new FormData();
    images.forEach((image) => formData.append("images", image));
    const response = await apiClient.post("/images-to-pdf", formData);
    return pollJobStatus(response.data.jobId);
  },

  watermarkPdf: async (file, text) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("text", text);
    const response = await apiClient.post("/watermark", formData);
    return pollJobStatus(response.data.jobId);
  },

  rotatePdf: async (file, angle) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("angle", angle);
    const response = await apiClient.post("/rotate", formData);
    return pollJobStatus(response.data.jobId);
  },

  getJobStatus: async (jobId) => {
    const response = await apiClient.get(`/job/${jobId}`);
    return response.data;
  },

  // ✅ FIXED: Compress PDF — consistent with other routes (post → jobId → poll)
  compressPdf: async (file, level = "medium", options = {}) => {
    const { onUploadProgress, cancelToken } = options;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("level", level);

    const response = await apiClient.post("/compress", formData, {
      onUploadProgress,
      cancelToken,
      // No timeout override — instance default (30s) handles upload,
      // polling handles the rest
    });

    const jobId = response.data?.jobId;
    if (!jobId) throw new Error("No jobId returned from server.");

    // Poll up to 60 attempts (60s) for large files
    return pollJobStatus(jobId, 60);
  },

  // ✅ ALWAYS USE THIS IN UI
  getDownloadUrl: (fileName) => `${DOWNLOAD_BASE_URL}/${fileName}`,
};

// ✅ DEFAULT EXPORT — fixes "does not provide an export named 'default'" error
// Compress.jsx uses: import api from "../api"
// All other files using: import { api } from "../api" continue to work unchanged
export default api;
