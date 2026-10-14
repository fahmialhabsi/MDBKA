/**
 * E1 (13 Okt 2026) — risiko gabungan per akun (fondasi E). MURNI.
 * "Rugi bila semua SL kena" = Σ |harga buka − SL| × nilai poin USD × lot
 * (komisi tidak termasuk). Posisi tanpa SL = rugi tidak terbatas → dicatat
 * terpisah, tidak dijumlah sebagai angka karangan. Nilai poin tidak diketahui
 * (kurs/preset tidak ada) → posisi itu "tidak terhitung".
 */
import { normalizeDirection } from "./correlationGuard";

export interface RiskPosition {
  readonly ticket: string;
  readonly symbol: string;
  readonly side: string;
  readonly volume: number;
  readonly priceOpen: number;
  readonly sl: number;
}

export interface CombinedRisk {
  readonly positions: number;
  /** Jumlah rugi bila semua SL kena (USD, ≥ 0; posisi SL di titik impas/untung = 0). */
  readonly lossAllSlUsd: number;
  readonly lossAllSlIdr: number | null;
  readonly shareOfEquity: number | null;
  readonly withoutSl: readonly string[];
  readonly notCounted: readonly string[];
  /** SL di titik impas atau lebih baik (terkunci). */
  readonly lockedSl: number;
}

export function combinedRisk(
  positions: readonly RiskPosition[],
  pointValueUsd: (symbol: string) => number | null,
  equityUsd: number | null,
  usdIdr: number | null,
): CombinedRisk {
  let loss = 0;
  let locked = 0;
  const withoutSl: string[] = [];
  const notCounted: string[] = [];
  for (const p of positions) {
    const dir = normalizeDirection(p.side);
    if (!(p.sl > 0)) {
      withoutSl.push(`#${p.ticket} ${p.symbol}`);
      continue;
    }
    const pv = pointValueUsd(p.symbol);
    if (dir === null || pv === null || !(pv > 0)) {
      notCounted.push(`#${p.ticket} ${p.symbol}`);
      continue;
    }
    const adverse = dir === "BELI" ? p.priceOpen - p.sl : p.sl - p.priceOpen;
    if (adverse <= 0) {
      locked += 1;
      continue;
    }
    loss += adverse * pv * p.volume;
  }
  const lossUsd = Math.round(loss * 100) / 100;
  return {
    positions: positions.length,
    lossAllSlUsd: lossUsd,
    lossAllSlIdr: usdIdr === null ? null : Math.round(lossUsd * usdIdr),
    shareOfEquity: equityUsd === null || !(equityUsd > 0) ? null : lossUsd / equityUsd,
    withoutSl,
    notCounted,
    lockedSl: locked,
  };
}
