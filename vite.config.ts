import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Injeksikan VITE_API_BASE_URL ke `process.env` di kode browser
  // (src/lib/apiBaseUrl.ts memakai typeof-process guard agar aman di test
  // CJS node — tanpa sintaks import.meta). Dibaca dari shell env / .env.
  const apiBaseUrl =
    loadEnv(mode, process.cwd(), "").VITE_API_BASE_URL?.trim() ?? "";
  return {
    define: {
      "process.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
