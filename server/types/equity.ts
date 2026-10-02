/**
 * Tahap 5E-STEP2 — tipe snapshot equity MT5 (MODUL TIPE MURNI).
 *
 * File ini TANPA import runtime (node/express) sehingga aman diimpor
 * sebagai `import type` dari frontend (Vite meng-erase-nya saat build,
 * tidak ada kode node yang ikut ke bundle browser).
 */

export interface EquitySnapshot {
  /** Waktu snapshot (ISO 8601). */
  readonly timestamp: string;
  /** Saldo akun (mata uang dasar akun). */
  readonly balance: number;
  /** Equity akun saat ini. */
  readonly equity: number;
  /** Profit mengambang (equity - balance bila log tak menulis Profit). */
  readonly profit: number;
  /** Jumlah trade terdeteksi (opsional, bila log memuatnya). */
  readonly tradeCount?: number;
  /** Waktu modifikasi file log (ISO 8601). */
  readonly lastModified: string;
}
