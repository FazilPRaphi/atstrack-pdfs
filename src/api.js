import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${BACKEND_URL}/api`;
const DOWNLOAD_BASE_URL = import.meta.env.VITE_DOWNLOAD_BASE_URL || `${BACKEND_URL}/downloads`;

const pollJobStatus = async (jobId) => {
  let job;
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await axios.get(`${API_BASE_URL}/job/${jobId}`);
    job = response.data;
  } while (job.status === "processing");

  if (job.status === "failed") {
    throw new Error(job.error || "Processing failed on server");
  }

  if (!job?.result?.file) {
    throw new Error("Invalid file response from server");
  }

  return { ...job.result, downloadUrl: `/downloads/${job.result.file}` };
};

export const api = {
  mergePdf: async (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const response = await axios.post(`${API_BASE_URL}/merge`, formData);
    return pollJobStatus(response.data.jobId);
  },

  splitPdf: async (file, startPage, endPage) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("startPage", Number(startPage)); // 🔥 FIX
    formData.append("endPage", Number(endPage)); // 🔥 FIX

    const response = await axios.post(`${API_BASE_URL}/split`, formData);
    return pollJobStatus(response.data.jobId);
  },

  imagesToPdf: async (images) => {
    const formData = new FormData();
    images.forEach((image) => formData.append("images", image));

    const response = await axios.post(
      `${API_BASE_URL}/images-to-pdf`,
      formData,
    );
    return pollJobStatus(response.data.jobId);
  },

  watermarkPdf: async (file, text) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("text", text);

    const response = await axios.post(`${API_BASE_URL}/watermark`, formData);
    return pollJobStatus(response.data.jobId);
  },

  rotatePdf: async (file, angle) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("angle", angle);

    const response = await axios.post(`${API_BASE_URL}/rotate`, formData);
    return pollJobStatus(response.data.jobId);
  },

  getJobStatus: async (jobId) => {
    const response = await axios.get(`${API_BASE_URL}/job/${jobId}`);
    return response.data;
  },

  getDownloadUrl: (fileName) => `${DOWNLOAD_BASE_URL}/${fileName}`,
};
