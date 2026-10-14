/**
 * T2 (13 Okt 2026) — masuk lagi di simbol yang SAMA (rancangan alur trader 7.4,
 * K-7). MURNI. Hanya bila diizinkan (akun terbukti demo + mode Demo):
 *  1. Posisi pertama searah di simbol itu sudah AMAN: SL minimal di titik impas
 *     (BELI: SL ≥ harga buka; JUAL: 0 < SL ≤ harga buka).
 *  2. Maksimal 2 posisi per simbol (sudah ada 1 → boleh tambah 1).
 *  3. Simbol LAIN yang berkaitan tetap dinilai penjaga korelasi seperti biasa.
 * Tidak diizinkan (Live) → perilaku lama: simbol sama searah = taruhan ganda.
 */
import { normalizeDirection, type Direction, type OpenPositionLike } from "./correlationGuard";

export const MAX_POSITIONS_PER_SYMBOL = 2;

export interface AddOnPosition extends OpenPositionLike {
  readonly priceOpen?: number;
  readonly sl?: number;
}

export interface AddOnDecision {
  /** Posisi yang tetap dinilai penjaga korelasi (posisi simbol sama searah dikeluarkan bila tambah sah). */
  readonly positionsForCorrelation: readonly OpenPositionLike[];
  /** true = sinyal ini adalah "masuk lagi" (kelompok bukti TAMBAH). */
  readonly addOn: boolean;
  /** Teks = ditahan (status korelasi) karena syarat masuk lagi tidak terpenuhi. */
  readonly holdReason: string | null;
}

const norm = (s: string): string => s.trim().toUpperCase();

export function isBreakevenSafe(p: AddOnPosition): boolean {
  const dir = normalizeDirection(p.side);
  if (dir === null || p.priceOpen === undefined || p.sl === undefined) return false;
  if (!(p.sl > 0) || !(p.priceOpen > 0)) return false;
  return dir === "BELI" ? p.sl >= p.priceOpen : p.sl <= p.priceOpen;
}

export function addOnDecision(
  symbol: string,
  direction: Direction,
  positions: readonly AddOnPosition[],
  allowed: boolean,
): AddOnDecision {
  const same = positions.filter((p) => norm(p.symbol) === norm(symbol) && normalizeDirection(p.side) === direction);
  if (!allowed || same.length === 0) return { positionsForCorrelation: positions, addOn: false, holdReason: null };
  if (same.length >= MAX_POSITIONS_PER_SYMBOL) {
    return { positionsForCorrelation: positions, addOn: false, holdReason: `Ditahan: masuk lagi ${symbol} ditolak — sudah ${same.length} posisi (maks ${MAX_POSITIONS_PER_SYMBOL})` };
  }
  const unsafe = same.filter((p) => !isBreakevenSafe(p));
  if (unsafe.length > 0) {
    return { positionsForCorrelation: positions, addOn: false, holdReason: `Ditahan: masuk lagi ${symbol} — posisi pertama belum aman (SL belum di titik impas)` };
  }
  return { positionsForCorrelation: positions.filter((p) => !same.includes(p)), addOn: true, holdReason: null };
}
