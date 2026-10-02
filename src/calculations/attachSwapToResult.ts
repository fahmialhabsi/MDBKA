import {
  calculateSwapCost,
  type SwapDirection,
} from "./swapCost";
import { getOtbInstrumentProfile } from "../lib/otbInstrumentConfig";
import type {
  AnalysisResult,
  Decision,
} from "../types/analysis";
import type { BrokerId } from "../types/broker";

/**
 * Tahap 5C Step 2 — lampiran swap post-decision (MODUL MURNI).
 *
 * - decisionEngine TIDAK disentuh: angka lot/risiko inti tidak berubah.
 *   Swap tampil sebagai biaya TERPISAH (info-only), bukan komponen
 *   lot-sizing — tanpa sirkularitas arah↔risiko.
 * - Satuan = unit profit-currency preset (label jujur, tanpa konversi
 *   FX). Lihat catatan unit di swapCost.ts sebelum memakai angka ini
 *   untuk keputusan finansial.
 */

export interface AttachedSwapDetail {
  readonly symbol: string;
  readonly direction: SwapDirection;
  readonly swapPerDayPerLot: number;
  readonly holdingDays: number;
  readonly lot: number;
  readonly swapCost: number;
  readonly profitCurrency: string;
}

export type AnalysisResultWithSwap = AnalysisResult & {
  readonly swapDetail: AttachedSwapDetail | null;
};

/**
 * Melampirkan detail swap ke hasil analisis. holdingDays default 0
 * (intraday akurat: tanpa holding = tanpa biaya).
 * Mengembalikan null bila: lot null/invalid, arah TUNGGU/invalid,
 * broker non-OTB, atau swap belum terverifikasi.
 */
export function attachSwapToResult(
  result: AnalysisResult,
  args: {
    readonly symbol: string;
    readonly brokerId?: BrokerId;
    readonly direction: SwapDirection | Decision;
    readonly lot: number | null;
    readonly holdingDays?: number;
  }
): AnalysisResultWithSwap | null {
  if (args.lot === null) return null;

  const cost = calculateSwapCost({
    symbol: args.symbol,
    brokerId: args.brokerId,
    direction: args.direction,
    lot: args.lot,
    holdingDays: args.holdingDays ?? 0,
  });

  if (cost === null) return null;

  const preset = getOtbInstrumentProfile(args.symbol);

  if (preset === null) return null;

  return {
    ...result,
    swapDetail: {
      symbol: cost.symbol,
      direction: cost.direction,
      swapPerDayPerLot: cost.swapPerDayPerLot,
      holdingDays: cost.holdingDays,
      lot: cost.lot,
      swapCost: cost.swapCost,
      profitCurrency: preset.currencyProfit,
    },
  };
}
