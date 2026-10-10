/**
 * Posisi broker terbuka dari EA ExportPositions (MODUL MURNI).
 *
 * Format kontrak CSV: Ticket,Symbol,Type,Volume,PriceOpen,SL,TP,TimeOpen
 * dengan Type = BUY|SELL. File ditulis ulang EA tiap interval; posisi
 * yang ditutup otomatis hilang (keluar = absen, bukan flag).
 * Tanpa import runtime agar aman diimpor frontend/backend/test.
 */

export interface BrokerPosition {
  readonly ticket: string;
  readonly symbol: string;
  /** Sisi mentah EA: BUY | SELL. */
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly priceOpen: number;
  readonly sl: number;
  readonly tp: number;
  /** Waktu open mentah MT5 "YYYY.MM.DD HH:MM:SS" (display). */
  readonly timeOpen: string;
  /**
   * SW1 (10 Okt 2026): swap ASLI yang sudah dipotong broker (POSITION_SWAP,
   * mata uang akun = USD). Absen = CSV lama (EA belum di-compile ulang).
   */
  readonly swap?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True bila value adalah posisi broker valid (tanpa throw). */
export function isBrokerPosition(value: unknown): value is BrokerPosition {
  if (!isRecord(value)) return false;
  if (typeof value.ticket !== "string" || value.ticket.length === 0) {
    return false;
  }
  if (typeof value.symbol !== "string" || value.symbol.length === 0) {
    return false;
  }
  if (value.side !== "BUY" && value.side !== "SELL") return false;
  for (const key of ["volume", "priceOpen", "sl", "tp"] as const) {
    const v = value[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return false;
  }
  if (typeof value.volume !== "number" || value.volume <= 0) return false;
  if (typeof value.timeOpen !== "string" || value.timeOpen.length === 0) {
    return false;
  }
  return true;
}

/**
 * Parse satu baris CSV posisi → BrokerPosition atau null.
 * Longgar pada case Type (buy/BUY); ketat pada angka (tanpa fabrikasi).
 */
export function parsePositionRow(row: string): BrokerPosition | null {
  const cells = row.split(",");
  if (cells.length < 8) return null;
  const ticket = (cells[0] ?? "").trim();
  const symbol = (cells[1] ?? "").trim();
  const sideRaw = (cells[2] ?? "").trim().toUpperCase();
  const volume = Number((cells[3] ?? "").trim());
  const priceOpen = Number((cells[4] ?? "").trim());
  const sl = Number((cells[5] ?? "").trim());
  const tp = Number((cells[6] ?? "").trim());
  const timeOpen = (cells[7] ?? "").trim();
  if (ticket === "" || symbol === "") return null;
  if (sideRaw !== "BUY" && sideRaw !== "SELL") return null;
  if (!Number.isFinite(volume) || volume <= 0) return null;
  if (!Number.isFinite(priceOpen) || priceOpen <= 0) return null;
  if (!Number.isFinite(sl) || sl < 0) return null;
  if (!Number.isFinite(tp) || tp < 0) return null;
  if (timeOpen === "") return null;
  // SW1: kolom 9 opsional; kosong/rusak = tidak diketahui (bukan 0 palsu).
  const swapCell = (cells[8] ?? "").trim();
  const swap = swapCell === "" ? Number.NaN : Number(swapCell);
  return Number.isFinite(swap)
    ? { ticket, symbol, side: sideRaw, volume, priceOpen, sl, tp, timeOpen, swap }
    : { ticket, symbol, side: sideRaw, volume, priceOpen, sl, tp, timeOpen };
}
