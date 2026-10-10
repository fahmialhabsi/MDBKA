/**
 * Dual-source live MT5 — resolver broker murni (MODUL MURNI).
 *
 * Backend membaca DUA terminal MT5 (OrbiTraderBerjangka + Finex) dari
 * dua pasang file berbeda. Setiap request live memilih sumber via
 * query `?broker=finex|orbitraderberjangka`:
 * - param absen  → sumber default (reader utama = perilaku lama,
 *   backward-compatible dengan semua test/hook lama).
 * - "finex"      → reader Finex (bila backend mengonfigurasinya).
 * - nilai lain   → invalid (route menjawab 400 jujur, tanpa fallback
 *   diam-diam ke sumber yang salah).
 *
 * File ini TANPA import runtime sehingga aman diimpor frontend
 * (Vite), backend, maupun test node — hanya tipe + fungsi murni.
 */

/** Broker yang didukung sebagai sumber live (selaras BrokerId). */
export type LiveBroker = "finex" | "orbitraderberjangka" | "mifx";

/**
 * Terjemahkan query `broker` mentah menjadi LiveBroker.
 * Absen/undefined → "orbitraderberjangka" (sumber default = reader
 * utama, perilaku lama). Nilai tak dikenal → null (route wajib 400).
 */
export function resolveLiveBroker(value: unknown): LiveBroker | null {
  if (value === undefined) return "orbitraderberjangka";
  if (value === "finex" || value === "orbitraderberjangka" || value === "mifx") return value;
  return null;
}

/**
 * Pilih reader aktif untuk satu broker. Mengembalikan null bila
 * sumber yang diminta belum dikonfigurasi (route wajib 404 jujur,
 * bukan angka fiktif / fallback diam ke broker lain).
 */
export function pickLiveSource<T>(
  broker: LiveBroker,
  defaultSource: T | null,
  finexSource: T | null,
  /** M1b: sumber MIFX; belum dikonfigurasi = null → route 404 jujur (BUKAN jatuh ke OTB). */
  mifxSource: T | null = null,
): T | null {
  if (broker === "finex") return finexSource;
  if (broker === "mifx") return mifxSource;
  return defaultSource;
}
