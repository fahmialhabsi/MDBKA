/**
 * Tahap 6C-safe — Adapter wiring spec32 → UI (ADDITIVE, MODUL MURNI).
 *
 * - Modul paralel BARU; TIDAK menyentuh jalur biaya legacy, dateService,
 *   `marketReset.ts` (`applyBrokerPreset`), komponen form ekstraksi,
 *   komponen pengaturan broker, maupun komponen hasil analisis.
 *   Seluruh 382 locked tests tetap hijau byte-identik.
 * - Menyediakan satu titik wiring yang kelak dipakai UI penuh 6C:
 *   form auto-sync (leverage/commission) + pratinjau swap + gate VERIFIED.
 * - Fallback aman: simbol di luar spec32 → leverage 50, commission 0,
 *   swap preview null, notice fallback (tanpa angka fiktif).
 */

import {
  getInstrumentSpec32,
  isSpec32Verified,
} from "./instrumentSpecs32";
import {
  calculateSwap,
  type SwapCalculationResult,
  type SwapDirection32,
} from "./jpySwapCalculator";

export interface Spec32FormDefaults {
  readonly leverage: number;
  readonly commission: number;
  readonly verified: boolean;
}

export const SPEC32_FALLBACK_LEVERAGE = 50;
export const SPEC32_FALLBACK_COMMISSION = 0;

/**
 * Default form per simbol dari spec32 (murni).
 * - Terdaftar + VERIFIED → leverage/commission dari spec (commission 0.00
 *   untuk semua 32 simbol regulasi 6B).
 * - Selain itu → fallback 50/0 + verified=false (pengguna isi manual).
 */
export function getSpec32FormDefaults(symbol: string): Spec32FormDefaults {
  const spec = getInstrumentSpec32(symbol);

  if (spec === null || !isSpec32Verified(symbol)) {
    return {
      leverage: SPEC32_FALLBACK_LEVERAGE,
      commission: SPEC32_FALLBACK_COMMISSION,
      verified: false,
    };
  }

  return {
    leverage: spec.leverage,
    commission: spec.commission,
    verified: true,
  };
}

/** True bila simbol siap auto-sync (terdaftar + VERIFIED di spec32). */
export function isSpec32Available(symbol: string): boolean {
  return getSpec32FormDefaults(symbol).verified;
}

/**
 * Pratinjau swap USD per lot via rumus 6B terkunci
 * (swapRatePips × effectiveDays × tickValue, triple day-aware).
 * Null bila simbol tidak terdaftar di spec32 atau daysHeld invalid.
 */
export function getSpec32SwapPreview(args: {
  readonly symbol: string;
  readonly daysHeld: number;
  readonly direction: SwapDirection32;
  readonly tradeDatetime: Date;
}): SwapCalculationResult | null {
  const spec = getInstrumentSpec32(args.symbol);

  if (spec === null) return null;
  if (!Number.isFinite(args.daysHeld) || args.daysHeld <= 0) return null;

  return calculateSwap({
    instrument: spec,
    daysHeld: args.daysHeld,
    leverage: spec.leverage,
    direction: args.direction,
    tradeDatetime: args.tradeDatetime,
  });
}

/**
 * Notice gate verifikasi untuk UI (murni, display-only).
 * Null = terverifikasi (tidak ada warning); string = fallback notice.
 */
export function spec32VerificationNotice(symbol: string): string | null {
  if (isSpec32Available(symbol)) return null;
  if (symbol.trim() === "") return null;
  return (
    `Simbol ${symbol.trim().toUpperCase()} belum terdaftar di spec32 ` +
    `(gunakan data manual dari terminal broker).`
  );
}
