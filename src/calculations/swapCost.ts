import { ORBITRADER_BROKER_ID } from "../lib/brokerRegistry";
import { getOtbInstrumentProfile } from "../lib/otbInstrumentConfig";
import { calculateSwapWithTriple } from "../services/dateService";
import type { BrokerId } from "../types/broker";
import type { Decision } from "../types/analysis";

export type SwapDirection = "long" | "short";

export interface OvernightSwapCost {
  readonly symbol: string;
  readonly direction: SwapDirection;
  readonly swapPerDayPerLot: number;
  readonly holdingDays: number;
  readonly lot: number;
  readonly swapCost: number;
}

export interface SwapCostResult extends OvernightSwapCost {
  readonly directionInput: "BELI" | "JUAL";
  readonly swapCostInContractBaseCurrency: number;
  readonly contractBaseCurrency: string;
  readonly profitCurrency: string;
  readonly swapType: "flat" | "percentage";
  readonly swapPerDayUSD?: number;
  readonly swapPercentage?: number;
  readonly contractSize: number;
  readonly currentPrice?: number;
}

function resolveDirection(
  direction: SwapDirection | Decision
): SwapDirection | null {
  if (direction === "long" || direction === "short") return direction;
  if (direction === "BELI") return "long";
  if (direction === "JUAL") return "short";

  return null;
}

function resolveDecisionInput(
  direction: SwapDirection | Decision
): "BELI" | "JUAL" | null {
  if (direction === "BELI" || direction === "long") return "BELI";
  if (direction === "JUAL" || direction === "short") return "JUAL";

  return null;
}

export function calculateSwapCost(args: {
  readonly symbol: string;
  readonly brokerId?: BrokerId;
  readonly direction: SwapDirection | Decision;
  readonly lot: number;
  readonly holdingDays?: number;
  readonly currentPrice?: number;
  /**
   * Tahap 5E-STEP1: tanggal mulai holding (untuk triple-swap Rabu).
   * - Bila diisi → total swap memakai calculateSwapWithTriple
   *   (Rabu x3, hari lain x1) sehingga Sel-Rab = 1x + 3x = 4x.
   * - Bila dikosongkan → jalur legacy (swap x holdingDays) agar
   *   test 1-296 tetap deterministik (tidak flaky tiap hari Rabu).
   *   UI selalu mengisi startDate = hari ini (auto-detect).
   */
  readonly startDate?: Date;
}): SwapCostResult | null {
  if (args.brokerId !== ORBITRADER_BROKER_ID) return null;

  const direction = resolveDirection(args.direction);

  if (direction === null) return null;

  const directionInput = resolveDecisionInput(args.direction);

  if (directionInput === null) return null;

  if (!Number.isFinite(args.lot) || args.lot <= 0) return null;

  const preset = getOtbInstrumentProfile(args.symbol);

  if (preset === null) return null;

  const swapValue =
    direction === "long" ? preset.swapLong : preset.swapShort;

  if (swapValue === null) return null;

  const rawDays = args.holdingDays ?? 1;
  const holdingDays =
    Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 0;

  const swapType = preset.swapType ?? "flat";

  if (holdingDays === 0) {
    const contractBaseCurrency =
      swapType === "percentage" ? preset.contractCurrency : "USD";

    return {
      symbol: preset.symbol,
      direction,
      directionInput,
      swapPerDayPerLot: swapValue,
      holdingDays,
      lot: args.lot,
      swapCost: 0,
      swapCostInContractBaseCurrency: 0,
      contractBaseCurrency,
      profitCurrency: preset.currencyProfit,
      swapType,
      contractSize: preset.contractSize,
      ...(swapType === "flat"
        ? { swapPerDayUSD: swapValue }
        : { swapPercentage: swapValue }),
      ...(args.currentPrice !== undefined
        ? { currentPrice: args.currentPrice }
        : {}),
    };
  }

  if (swapType === "flat") {
    // Tahap 5E-STEP1: triple-swap bila startDate eksplisit, legacy bila tidak.
    const totalPerLot =
      args.startDate !== undefined
        ? calculateSwapWithTriple({
            holdingDays,
            swapPerDay: swapValue,
            startDate: args.startDate,
          })
        : swapValue * holdingDays;
    const swapCost = totalPerLot * args.lot;

    return {
      symbol: preset.symbol,
      direction,
      directionInput,
      swapPerDayPerLot: swapValue,
      holdingDays,
      lot: args.lot,
      swapCost,
      swapCostInContractBaseCurrency: swapCost,
      contractBaseCurrency: "USD",
      profitCurrency: preset.currencyProfit,
      swapType: "flat",
      swapPerDayUSD: swapValue,
      contractSize: preset.contractSize,
      ...(args.currentPrice !== undefined
        ? { currentPrice: args.currentPrice }
        : {}),
    };
  }

  if (swapType === "percentage") {
    const price = args.currentPrice;

    if (price === undefined || !Number.isFinite(price) || price <= 0)
      return null;

    // Tahap 6F-1: normalisasi harga pair JPY. UI meneruskan quote pasar
    // (market.bid, mis. AUDJPY ≈ 109) sedangkan formula % memakai harga
    // per-unit profit currency (invers, ≈ 0.0091; lihat test 268). Tanpa
    // inversi, nosional meledak ~10.000x di produksi. Heuristik aman:
    // profit JPY + price > 1 ⇒ bentuk quote ⇒ invers. Harga invers
    // (< 1) dan pair non-JPY tidak tersentuh (byte-identik, test lama hijau).
    const effectivePrice =
      preset.currencyProfit === "JPY" && price > 1 ? 1 / price : price;

    const notional = preset.contractSize * effectivePrice;
    // Tahap 5E-STEP1: % per hari → triple-swap bila startDate eksplisit.
    const perLotPerDay = notional * (swapValue / 100);
    const totalPerLot =
      args.startDate !== undefined
        ? calculateSwapWithTriple({
            holdingDays,
            swapPerDay: perLotPerDay,
            startDate: args.startDate,
          })
        : perLotPerDay * holdingDays;
    const swapCost = totalPerLot * args.lot;

    return {
      symbol: preset.symbol,
      direction,
      directionInput,
      swapPerDayPerLot: swapValue,
      holdingDays,
      lot: args.lot,
      swapCost,
      swapCostInContractBaseCurrency: swapCost,
      contractBaseCurrency: preset.contractCurrency,
      profitCurrency: preset.currencyProfit,
      swapType: "percentage",
      swapPercentage: swapValue,
      contractSize: preset.contractSize,
      currentPrice: price,
    };
  }

  return null;
}
