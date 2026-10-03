/**
 * Tahap 5E-STEP2 — tipe snapshot equity MT5 + guard murni.
 *
 * File ini TANPA import runtime (node/express) sehingga aman diimpor
 * sebagai runtime oleh frontend (Vite) maupun backend — hanya tipe
 * dan fungsi validasi murni, tidak ada kode node yang ikut ke bundle.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * True bila value adalah snapshot equity valid: timestamp string,
 * balance/equity/profit finite, tradeCount opsional integer >= 0.
 * Payload malformed ditolak (hook tetap offline-jujur, tanpa crash,
 * tanpa angka fiktif di UI).
 */
export function isEquitySnapshot(value: unknown): value is EquitySnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.timestamp !== "string") return false;
  if (!isFiniteNumber(value.balance)) return false;
  if (!isFiniteNumber(value.equity)) return false;
  if (!isFiniteNumber(value.profit)) return false;
  if (value.tradeCount !== undefined) {
    if (typeof value.tradeCount !== "number") return false;
    if (!Number.isInteger(value.tradeCount) || value.tradeCount < 0)
      return false;
  }
  return true;
}
