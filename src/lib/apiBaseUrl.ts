/**
 * Tahap PROD — base URL backend terpusat (MODUL MURNI).
 *
 * - Browser (Vite): nilai dibaca dari `VITE_API_BASE_URL`, diinjeksi saat
 *   build via `define` di vite.config.ts (tanpa `import.meta` di sini agar
 *   modul tetap aman dikompilasi ke CJS untuk unit test node — lihat
 *   catatan import.meta di src/lib/debugTrace.ts).
 * - Node/test: membaca `process.env.VITE_API_BASE_URL` langsung.
 * - Kosong/tidak diset → fallback localhost:3000 (perilaku lama).
 * - Trailing slash dipangkas agar komposisi `${base}/api/...` stabil.
 */

export const DEFAULT_API_BASE_URL = "http://localhost:3000";

function readEnvBaseUrl(): string {
  try {
    if (typeof process !== "undefined") {
      const value = process.env?.["VITE_API_BASE_URL"];
      if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
      }
    }
  } catch {
    // Runtime non-node tanpa define: abaikan, pakai fallback.
  }
  return "";
}

/** Normalisasi base URL eksplisit (murni, untuk test). */
export function resolveApiBaseUrl(raw?: string): string {
  const candidate = (raw ?? readEnvBaseUrl()).trim().replace(/\/+$/, "");
  return candidate !== "" ? candidate : DEFAULT_API_BASE_URL;
}

/** Base URL efektif dipakai hooks live (equity + quotes). */
export const API_BASE_URL: string = resolveApiBaseUrl();
