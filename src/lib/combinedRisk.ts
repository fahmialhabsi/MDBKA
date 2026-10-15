/**
 * E1 (13 Okt 2026) — risiko gabungan per akun (fondasi E). MURNI.
 * "Rugi bila semua SL kena" = Σ |harga buka − SL| × nilai poin USD × lot
 * (komisi tidak termasuk). Posisi tanpa SL = rugi tidak terbatas → dicatat
 * terpisah, tidak dijumlah sebagai angka karangan. Nilai poin tidak diketahui
 * (kurs/preset tidak ada) → posisi itu "tidak terhitung".
 */
import { normalizeDirection } from "./correlationGuard";

/**
 * R-2 (disetujui Fahmi 15 Okt 2026, SOP-09 langkah 3): skenario stres slippage SL.
 * Faktor = rugi nyata terburuk ÷ risiko SL dari 15 trade SL Finex/MIFX (−1,075R),
 * docs/TINJAUAN-RISIKO-2026-10-15-toleransi-lampu2.md. Hanya tampilan; batas tidak diubah.
 */
export const STRESS_SLIPPAGE_FACTOR = 1.075;

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
  /** R-2: rugi bila semua SL kena dengan slippage nyata terburuk (× STRESS_SLIPPAGE_FACTOR). */
  readonly stressLossUsd: number;
  readonly stressLossIdr: number | null;
  readonly stressShareOfEquity: number | null;
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
  const stressUsd = Math.round(loss * STRESS_SLIPPAGE_FACTOR * 100) / 100;
  return {
    positions: positions.length,
    lossAllSlUsd: lossUsd,
    lossAllSlIdr: usdIdr === null ? null : Math.round(lossUsd * usdIdr),
    shareOfEquity: equityUsd === null || !(equityUsd > 0) ? null : lossUsd / equityUsd,
    withoutSl,
    notCounted,
    lockedSl: locked,
    stressLossUsd: stressUsd,
    stressLossIdr: usdIdr === null ? null : Math.round(stressUsd * usdIdr),
    stressShareOfEquity: equityUsd === null || !(equityUsd > 0) ? null : stressUsd / equityUsd,
  };
}
