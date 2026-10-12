/**
 * X3b (12 Okt 2026) — spesifikasi simbol Exness (Exness Technologies Ltd, demo
 * 413925678, akun IDR, server UTC+0). Sumber: MDBKA_Specs_413925678.csv
 * (MDBKACalendarService, 12 Okt 06:25) + Specification MT5 XAUUSDm (screenshot Fahmi).
 *
 * - TickValue di CSV dalam mata uang AKUN (IDR); dikonversi ke USD dengan kurs
 *   tersirat CSV itu sendiri: XAUUSDm 1787,785 IDR = 100 × 0,001 USD → 17.877,85.
 * - Komisi 0: VERIFIED dari History MT5 akun ini (33.487 transaksi XAUUSDm, semua 0).
 * - Hanya simbol yang BISA ditradingkan & terverifikasi. Kripto (Trade: Disabled /
 *   tanpa golongan risiko) dan EURUSDm/USDJPYm (komisi belum terbukti) belum dimasukkan.
 * Kunci = nama persis (akhiran "m" kecil).
 */
import type { InstrumentSpec } from "./instrumentSpecs32";

export const EXNESS_SPECS: Readonly<Record<string, InstrumentSpec>> = Object.freeze({
  XAUUSDm: Object.freeze({
    symbol: "XAUUSDm",
    broker: "exness",
    pip: 0.001,
    tickSize: 0.001,
    tickValue: 0.1,
    leverage: 100,
    commission: 0,
    swapLong: -523.3,
    swapShort: 0,
    swap3DayWeekday: 3,
    baseCurrency: "XAU",
    quoteCurrency: "USD",
    isJPYPair: false,
    status: "VERIFIED",
  }),
});

/** Lookup nama persis; null bila bukan simbol Exness terdaftar. */
export function getExnessSpec(symbol: string): InstrumentSpec | null {
  return EXNESS_SPECS[symbol.trim()] ?? null;
}

/** Lot minimum & langkah lot Exness (Specification: XAUUSDm 0,01 / 0,01). */
export function exnessVolume(): { readonly minVolume: number; readonly volumeStep: number } {
  return { minVolume: 0.01, volumeStep: 0.01 };
}
