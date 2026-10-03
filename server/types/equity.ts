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
  /** Nomor/login akun MT5 (opsional, bila log/EA memuatnya). */
  readonly account?: string;
  /** Leverage akun, mis. 100 untuk 1:100 (opsional). */
  readonly leverage?: number;
  /** Margin terpakai (opsional, bila backend/EA memuatnya). */
  readonly margin?: number;
  /** Margin bebas (opsional, bila backend/EA memuatnya). */
  readonly freeMargin?: number;
  /** Margin level persen = equity/margin*100 (opsional). */
  readonly marginLevel?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * True bila value adalah snapshot equity valid: timestamp string,
 * balance/equity/profit finite, tradeCount opsional integer >= 0,
 * account opsional string, leverage/margin/freeMargin/marginLevel
 * opsional finite (>= 0). Payload malformed ditolak (hook tetap
 * offline-jujur, tanpa crash, tanpa angka fiktif di UI).
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
  if (value.account !== undefined && typeof value.account !== "string")
    return false;
  if (
    value.leverage !== undefined &&
    (!isFiniteNumber(value.leverage) || value.leverage <= 0)
  )
    return false;
  for (const key of ["margin", "freeMargin", "marginLevel"] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined && (!isFiniteNumber(v) || v < 0)) return false;
  }
  return true;
}
