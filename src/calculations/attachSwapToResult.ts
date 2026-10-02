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
 * Tahap 5D-EXT1: meneruskan currentPrice + field dual-mode
 * (flat/percentage) tanpa mengubah kontrak lama (swapCost,
 * swapPerDayPerLot, direction long/short tetap ada).
 *
 * - decisionEngine TIDAK disentuh: angka lot/risiko inti tidak berubah.
 *   Swap tampil sebagai biaya TERPISAH (info-only), bukan komponen
 *   lot-sizing — tanpa sirkularitas arah↔risiko.
 * - Satuan flat = USD (contractBaseCurrency "USD", profitCurrency dari
 *   preset); satuan percentage = contract-base currency preset
 *   (konversi FX ke profitCurrency menyusul Tahap 5E).
 */

export interface AttachedSwapDetail {
  readonly symbol: string;
  readonly direction: SwapDirection;
  readonly directionInput: "BELI" | "JUAL";
  readonly swapPerDayPerLot: number;
  readonly holdingDays: number;
  readonly lot: number;
  readonly swapCost: number;
  readonly swapCostInContractBaseCurrency: number;
  readonly contractBaseCurrency: string;
  readonly profitCurrency: string;
  readonly swapType: "flat" | "percentage";
  readonly swapPerDayUSD?: number;
  readonly swapPercentage?: number;
  readonly contractSize: number;
  readonly currentPrice?: number;
}

export type AnalysisResultWithSwap = AnalysisResult & {
  readonly swapDetail: AttachedSwapDetail | null;
};

/**
 * Melampirkan detail swap ke hasil analisis. holdingDays default 0
 * (intraday akurat: tanpa holding = tanpa biaya).
 * Mengembalikan null bila: lot null/invalid, arah TUNGGU/invalid,
 * broker non-OTB, swap belum terverifikasi, atau (mode percentage
 * dengan holdingDays > 0) currentPrice hilang/invalid.
 */
export function attachSwapToResult(
  result: AnalysisResult,
  args: {
    readonly symbol: string;
    readonly brokerId?: BrokerId;
    readonly direction: SwapDirection | Decision;
    readonly lot: number | null;
    readonly holdingDays?: number;
    readonly currentPrice?: number;
  }
): AnalysisResultWithSwap | null {
  if (args.lot === null) return null;

  const cost = calculateSwapCost({
    symbol: args.symbol,
    brokerId: args.brokerId,
    direction: args.direction,
    lot: args.lot,
    holdingDays: args.holdingDays ?? 0,
    ...(args.currentPrice !== undefined
      ? { currentPrice: args.currentPrice }
      : {}),
  });

  if (cost === null) return null;

  const preset = getOtbInstrumentProfile(args.symbol);

  if (preset === null) return null;

  return {
    ...result,
    swapDetail: {
      symbol: cost.symbol,
      direction: cost.direction,
      directionInput: cost.directionInput,
      swapPerDayPerLot: cost.swapPerDayPerLot,
      holdingDays: cost.holdingDays,
      lot: cost.lot,
      swapCost: cost.swapCost,
      swapCostInContractBaseCurrency:
        cost.swapCostInContractBaseCurrency,
      contractBaseCurrency: cost.contractBaseCurrency,
      swapType: cost.swapType,
      contractSize: cost.contractSize,
      profitCurrency: preset.currencyProfit,
      ...(cost.swapPerDayUSD !== undefined
        ? { swapPerDayUSD: cost.swapPerDayUSD }
        : {}),
      ...(cost.swapPercentage !== undefined
        ? { swapPercentage: cost.swapPercentage }
        : {}),
      ...(cost.currentPrice !== undefined
        ? { currentPrice: cost.currentPrice }
        : {}),
    },
  };
}
