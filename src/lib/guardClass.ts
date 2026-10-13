/** LAB-1 (13 Okt 2026) — klasifikasi penahan untuk demo laboratorium. Murni. */
import type { ScanStatus } from "./symbolScanner";

export type GuardClass = "LOLOS" | "KERAS" | "LUNAK" | "BUKAN_SETUP";

export interface GuardClassDetail {
  /** Dari findSessionHold: 0 = pasar sedang tutup; > 0 = menit sampai tutup. */
  readonly sessionClosesInMin?: number | null;
}

// Margin tidak cukup bukan ScanStatus; ditangani di tahap 14.

/** Penahan lunak: boleh dilewati hanya untuk trade uji di akun demo. */
export const LAB_SOFT_STATUSES: readonly ScanStatus[] = [
  "DITAHAN_BIAYA",
  "DITAHAN_RISIKO",
  "DITAHAN_JEDA",
  "DITAHAN_BERITA",
  "DITAHAN_BUKA",
  "DITAHAN_KORELASI",
];

/** Penahan keras: tidak pernah dilewati. DITAHAN_SESI tidak masuk (bergantung detail). */
export const LAB_HARD_STATUSES: readonly ScanStatus[] = [
  "DATA",
  "PASAR_TUTUP",
  "DITAHAN_SPEK",
  "DITAHAN_BUKTI",
];

export function classifyScanStatus(status: ScanStatus, detail?: GuardClassDetail): GuardClass {
  switch (status) {
    case "LOLOS":
      return "LOLOS";
    case "TUNGGU":
      return "BUKAN_SETUP";
    case "DATA":
    case "PASAR_TUTUP":
    case "DITAHAN_SPEK":
    case "DITAHAN_BUKTI":
      return "KERAS";
    case "DITAHAN_BIAYA":
    case "DITAHAN_RISIKO":
    case "DITAHAN_JEDA":
    case "DITAHAN_BERITA":
    case "DITAHAN_BUKA":
    case "DITAHAN_KORELASI":
      return "LUNAK";
    case "DITAHAN_SESI": {
      // Jelang tutup (> 0) = lunak; pasar tutup (0) atau tidak diketahui = keras (aman).
      const closes = detail?.sessionClosesInMin;
      return typeof closes === "number" && Number.isFinite(closes) && closes > 0 ? "LUNAK" : "KERAS";
    }
    default: {
      const never: never = status;
      throw new Error(`ScanStatus tidak dikenal: ${String(never)}`);
    }
  }
}
