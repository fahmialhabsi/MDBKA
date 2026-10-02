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
import {
  convertToUSD,
  type ExchangeRates,
} from "../services/fxRateService";

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
  /** Tahap 5D-STEP2: konversi display ke USD (info-only). null bila
   * fxRates tidak disediakan (fallback: tampilkan satuan asli). */
  readonly swapCostInUSD: number | null;
  /** Rate ECB yang dipakai untuk konversi (per contractBaseCurrency). */
  readonly fxRate?: number | null;
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
 * Bila fxRates disediakan, swapCostInUSD + fxRate ikut terisi
 * (display risk); tanpa fxRates keduanya null (fallback satuan asli).
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
    readonly fxRates?: ExchangeRates | null;
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

  const fxRates = args.fxRates ?? null;
  const swapCostInUSD =
    fxRates === null
      ? null
      : convertToUSD(
          cost.swapCostInContractBaseCurrency,
          cost.contractBaseCurrency,
          fxRates
        );
  const rawFxRate =
    fxRates === null
      ? null
      : ((fxRates as Record<string, unknown>)[
          cost.contractBaseCurrency
        ] ?? null);
  const fxRate =
    typeof rawFxRate === "number" &&
    Number.isFinite(rawFxRate) &&
    rawFxRate > 0
      ? rawFxRate
      : null;

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
      swapCostInUSD,
      fxRate,
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
