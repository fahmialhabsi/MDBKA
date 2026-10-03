/**
 * Tahap 6B — JPY Swap Calculator (ADDITIVE, MODUL MURNI).
 *
 * Formula terkunci (prompt Tahap 6B, tanpa fallback -1.5%):
 *   swapUSD = swapRatePips x daysHeld(efektif) x tickValue
 *
 * - swapRatePips = swapLong bila direction LONG, swapShort bila SHORT.
 * - Triple-swap: hari `swap3DayWeekday` (default Rabu=3, US100 Jumat=5)
 *   bermultiplier 3. Implementasi range-aware: setiap hari dalam rentang
 *   [tradeDatetime, tradeDatetime + daysHeld) dihitung satu per satu
 *   (selaras `calculateSwapWithTriple` di dateService), sehingga:
 *     1 hari Senin  -> efektif 1 hari (multiplier rata-rata 1)
 *     1 hari Rabu   -> efektif 3 hari (multiplier rata-rata 3)
 *     2 hari Sel-Rab -> efektif 4 hari (multiplier rata-rata 2)
 * - daysHeld <= 0 / non-finite -> nol biaya (intraday akurat).
 * - Modul ini TIDAK menyentuh jalur legacy flat/percentage
 *   tetap byte-identik untuk 354 locked tests). Wiring ke UI = Tahap 6C
 *   setelah kebijakan verifikasi 16-simbol disetujui.
 */

import type { InstrumentSpec } from "./instrumentSpecs32";

export type SwapDirection32 = "LONG" | "SHORT";

export interface SwapCalculationInput {
  instrument: InstrumentSpec;
  daysHeld: number;
  /** Rasio leverage akun (info-only; tidak mengubah rumus 6B). */
  leverage: number;
  direction: SwapDirection32;
  /** Tanggal mulai holding (untuk deteksi triple day). */
  tradeDatetime: Date;
}

export interface SwapCalculationResult {
  /** USD per lot (dibulatkan 2 desimal). */
  swapUSD: number;
  /** Total pips terbebankan (sudah termasuk triple). */
  swapPips: number;
  /** Rata-rata multiplier = effectiveDays / daysHeld (1 hari normal = 1). */
  daysMultiplier: number;
  tickValueUsed: number;
  /** Hari terbebankan efektif (mis. Sel-Rab 2 hari = 4). */
  effectiveDays: number;
  /** True bila rentang memuat triple day. */
  tripleDayHit: boolean;
}

/** 0=Min ... 3=Rab ... 5=Jum ... 6=Sab. */
export function detectWednesdayTripleSwap(date: Date): boolean {
  return date.getDay() === 3;
}

/** True bila tanggal adalah triple day instrumen (default Rabu). */
export function isTripleDay(date: Date, instrument: InstrumentSpec): boolean {
  const tripleDay = instrument.swap3DayWeekday ?? 3;
  return date.getDay() === tripleDay;
}

/** Multiplier satu hari: 3 pada triple day, 1 selainnya. */
export function getDayMultiplier(
  date: Date,
  instrument: InstrumentSpec,
): number {
  const perDay = instrument.swapWedMultiplier ?? 3;
  return isTripleDay(date, instrument) ? perDay : 1;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Hitung swap USD per lot dari spec 32 + tanggal mulai holding.
 * Murni (tidak membaca/menulis state, tidak memanggil API/ECB).
 */
export function calculateSwap(input: SwapCalculationInput): SwapCalculationResult {
  const { instrument, direction, tradeDatetime } = input;
  const rawDays = input.daysHeld;
  const daysHeld =
    Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 0;
  const tickValue = instrument.tickValue;
  const swapRatePips =
    direction === "LONG" ? instrument.swapLong : instrument.swapShort;

  if (daysHeld === 0 || !Number.isFinite(swapRatePips) || !Number.isFinite(tickValue)) {
    return {
      swapUSD: 0,
      swapPips: 0,
      daysMultiplier: daysHeld === 0 ? 0 : 1,
      tickValueUsed: Number.isFinite(tickValue) ? tickValue : 0,
      effectiveDays: 0,
      tripleDayHit: false,
    };
  }

  let effectiveDays = 0;
  let tripleDayHit = false;
  for (let day = 0; day < daysHeld; day++) {
    const current = new Date(tradeDatetime);
    current.setDate(current.getDate() + day);
    const multiplier = getDayMultiplier(current, instrument);
    if (multiplier !== 1) tripleDayHit = true;
    effectiveDays += multiplier;
  }

  const swapPips = swapRatePips * effectiveDays;
  const swapUSD = round2(swapPips * tickValue);

  return {
    swapUSD,
    swapPips: round2(swapPips * 100) / 100,
    daysMultiplier: round2((effectiveDays / daysHeld) * 100) / 100,
    tickValueUsed: tickValue,
    effectiveDays,
    tripleDayHit,
  };
}

/**
 * Fallback kurs display-only (tanpa API call).
 * Dipakai bila konversi satuan profit dibutuhkan di UI; modul swap inti
 * tidak memakainya (rumus 6B memakai tickValue CSV langsung).
 */
export function getJPYRate(baseCurrency: string, quoteCurrency: string): number {
  const rates: Record<string, number> = {
    JPY: 0.0067, // 1 JPY ≈ 0.0067 USD
    AUD: 0.65,
    CAD: 0.74,
    CHF: 1.1,
    EUR: 1.1,
    GBP: 1.27,
    NZD: 0.6,
    USD: 1.0,
    US100: 1.0,
  };
  if (quoteCurrency === "JPY") return rates["JPY"];
  return rates[baseCurrency] ?? 1.0;
}
