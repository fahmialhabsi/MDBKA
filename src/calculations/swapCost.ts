import { ORBITRADER_BROKER_ID } from "../lib/brokerRegistry";
import { getOtbInstrumentProfile } from "../lib/otbInstrumentConfig";
import type { BrokerId } from "../types/broker";
import type { Decision } from "../types/analysis";

/**
 * Tahap 5C Step 1 — biaya swap overnight OTB (MODUL MURNI, isolated).
 *
 * - TIDAK menyentuh decisionEngine (rumus lot/risiko tidak berubah),
 *   validator, preset, parser, maupun UI. Konsumsi display/wiring =
 *   tahap lanjut (butuh keputusan input holdingDays + integrasi engine).
 * - Hanya broker OTB + simbol berpreset swap terverifikasi; selebihnya
 *   null (fail-closed, bukan 0 palsu — pemanggil display memakai `?? 0`).
 * - Nilai swap per spec dalam unit profit-currency/lot/hari
 *   (dikonfirmasi dari Specification pada Tahap 5C-Step-2; menggantikan
 *   notasi "%" awal yang ambigu). Tanpa konversi FX — label jujur di
 *   display. Modul ini TIDAK dipakai decision engine.
 * - Swap negatif = biaya (konvensi Forex); nilai signed apa adanya.
 */

export type SwapDirection = "long" | "short";

export interface OvernightSwapCost {
  readonly symbol: string;
  readonly direction: SwapDirection;
  readonly swapPerDayPerLot: number;
  readonly holdingDays: number;
  readonly lot: number;
  readonly swapCost: number;
}

function resolveDirection(
  direction: SwapDirection | Decision
): SwapDirection | null {
  if (direction === "long" || direction === "short") return direction;
  if (direction === "BELI") return "long";
  if (direction === "JUAL") return "short";

  return null;
}

/**
 * Biaya swap = swapPerDay × holdingDays × lot (arah long/short).
 * holdingDays default 1 bila diabaikan; <= 0/non-finite dinormalisasi
 * ke 0 (biaya nol, objek tetap dikembalikan). Lot invalid, arah
 * TUNGGU/invalid, broker non-OTB, atau swap belum terverifikasi
 * mengembalikan null.
 */
export function calculateSwapCost(args: {
  readonly symbol: string;
  readonly brokerId?: BrokerId;
  readonly direction: SwapDirection | Decision;
  readonly lot: number;
  readonly holdingDays?: number;
}): OvernightSwapCost | null {
  if (args.brokerId !== ORBITRADER_BROKER_ID) return null;

  const direction = resolveDirection(args.direction);

  if (direction === null) return null;

  if (!Number.isFinite(args.lot) || args.lot <= 0) return null;

  const preset = getOtbInstrumentProfile(args.symbol);

  if (preset === null) return null;

  const swapPerDayPerLot =
    direction === "long" ? preset.swapLong : preset.swapShort;

  if (swapPerDayPerLot === null) return null;

  const rawDays = args.holdingDays ?? 1;
  const holdingDays =
    Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 0;

  return {
    symbol: preset.symbol,
    direction,
    swapPerDayPerLot,
    holdingDays,
    lot: args.lot,
    swapCost: swapPerDayPerLot * holdingDays * args.lot,
  };
}
