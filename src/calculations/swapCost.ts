import { ORBITRADER_BROKER_ID } from "../lib/brokerRegistry";
import { getOtbInstrumentProfile } from "../lib/otbInstrumentConfig";
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
    const swapCost = swapValue * args.lot * holdingDays;

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

    const notional = preset.contractSize * price;
    const swapCost = notional * (swapValue / 100) * args.lot * holdingDays;

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
