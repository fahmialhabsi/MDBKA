/**
 * Tahap 6B — Spesifikasi 32 instrumen (ADDITIVE, DATA ONLY).
 *
 * - Modul paralel BARU; TIDAK menyentuh `instrumentConfig.ts`,
 *   `otbInstrumentConfig.ts`, `brokerSymbols.ts`, maupun `swapCost.ts`.
 *   Seluruh 354 locked tests tetap hijau byte-identik.
 * - Sumber angka: CSV ekspor terminal MT5 (lihat prompt Tahap 6B):
 *   OTB 16 simbol (suffiks _ORB) + Finex 16 simbol (tanpa suffiks,
 *   termasuk US100). Commission = 0.00 untuk semua (kebijakan broker:
 *   OTB points-based, Finex spread-only).
 * - Catatan JPY: target 16-simbol hanya memuat 5 JPY pair per broker
 *   (AUDJPY, CADJPY, CHFJPY, NZDJPY, USDJPY). EURJPY/GBPJPY disebut di
 *   prompt tetapi TIDAK ada di data CSV 16-simbol, sehingga TIDAK
 *   diada-adakan di sini (tanpa angka fiktif). Bila CSV final memuatnya,
 *   tambahkan sebagai entry baru + test baru.
 * - Tick_Value JPY = 0.63 konsisten lintas broker (dari CSV).
 * - Swap_3Day: 3 (Rabu) untuk semua FX; 5 (Jumat) untuk US100.
 * - `leverage: 100000` adalah contract size per CSV (bukan rasio);
 *   nama field dipertahankan sesuai kontrak prompt 6B.
 */

export type SpecBroker = "orbitraderberjangka" | "finex";

export type SpecStatus = "VERIFIED" | "PENDING";

export interface InstrumentSpec {
  symbol: string;
  broker: SpecBroker;
  /** Pip/tick size: 0.00001 (5 digits), 0.001 (3 digits), 0.01 (2 digits). */
  pip: number;
  tickSize: number;
  /** USD per pip per lot (dari CSV; JPY = 0.63). */
  tickValue: number;
  /** Contract size dari CSV (100000 untuk FX). */
  leverage: number;
  /** USD per lot; 0.00 untuk semua 32 simbol (Tahap 6B lock-in). */
  commission: number;
  /** Swap pips/hari Sen-Kam (dari CSV, bisa negatif/positif/nol). */
  swapLong: number;
  swapShort: number;
  /** Pengali triple-swap (3 untuk JPY pairs; undefined = pakai 3 bila triple day). */
  swapWedMultiplier?: number;
  /** Hari triple-swap MT5 (0-6; 3=Rabu, 5=Jumat untuk US100). */
  swap3DayWeekday?: number;
  baseCurrency: string;
  quoteCurrency: string;
  isJPYPair: boolean;
  status: SpecStatus;
}

function freezeSpec(spec: InstrumentSpec): InstrumentSpec {
  return Object.freeze(spec);
}

function fx(
  symbol: string,
  broker: SpecBroker,
  pip: number,
  tickValue: number,
  swapLong: number,
  swapShort: number,
  baseCurrency: string,
  quoteCurrency: string,
  opts: { swap3DayWeekday?: number } = {},
): InstrumentSpec {
  const isJPYPair = quoteCurrency === "JPY";
  return freezeSpec({
    symbol,
    broker,
    pip,
    tickSize: pip,
    tickValue,
    leverage: 100000,
    commission: 0.0,
    swapLong,
    swapShort,
    ...(isJPYPair ? { swapWedMultiplier: 3 } : {}),
    swap3DayWeekday: opts.swap3DayWeekday ?? 3,
    baseCurrency,
    quoteCurrency,
    isJPYPair,
    status: "VERIFIED",
  });
}

/**
 * 32 spesifikasi terverifikasi Tahap 6B.
 * Kunci = nama simbol persis (case-sensitive; _ORB signifikan untuk OTB).
 */
export const INSTRUMENT_SPECS_32: Record<string, InstrumentSpec> =
  Object.freeze({
    // ===== OTB VERIFIED (16) — broker orbitraderberjangka =====
    AUDCAD_ORB: fx(
      "AUDCAD_ORB",
      "orbitraderberjangka",
      0.00001,
      0.7,
      -0.75,
      -2.25,
      "AUD",
      "CAD",
    ),
    AUDCHF_ORB: fx(
      "AUDCHF_ORB",
      "orbitraderberjangka",
      0.00001,
      1.21,
      -1.5,
      -1.5,
      "AUD",
      "CHF",
    ),
    AUDJPY_ORB: fx(
      "AUDJPY_ORB",
      "orbitraderberjangka",
      0.001,
      0.63,
      -1.25,
      -1.75,
      "AUD",
      "JPY",
    ),
    AUDNZD_ORB: fx(
      "AUDNZD_ORB",
      "orbitraderberjangka",
      0.00001,
      0.56,
      -1.25,
      -1.75,
      "AUD",
      "NZD",
    ),
    AUDUSD_ORB: fx(
      "AUDUSD_ORB",
      "orbitraderberjangka",
      0.00001,
      1.0,
      -1.5,
      -1.5,
      "AUD",
      "USD",
    ),
    CADJPY_ORB: fx(
      "CADJPY_ORB",
      "orbitraderberjangka",
      0.001,
      0.63,
      -1.25,
      -1.75,
      "CAD",
      "JPY",
    ),
    CHFJPY_ORB: fx(
      "CHFJPY_ORB",
      "orbitraderberjangka",
      0.001,
      0.63,
      -1.75,
      -1.25,
      "CHF",
      "JPY",
    ),
    EURAUD_ORB: fx(
      "EURAUD_ORB",
      "orbitraderberjangka",
      0.00001,
      0.7,
      -1.5,
      -1.5,
      "EUR",
      "AUD",
    ),
    EURCAD_ORB: fx(
      "EURCAD_ORB",
      "orbitraderberjangka",
      0.00001,
      0.7,
      -1.25,
      -1.75,
      "EUR",
      "CAD",
    ),
    EURCHF_ORB: fx(
      "EURCHF_ORB",
      "orbitraderberjangka",
      0.00001,
      1.21,
      -1.75,
      -1.25,
      "EUR",
      "CHF",
    ),
    GBPAUD_ORB: fx(
      "GBPAUD_ORB",
      "orbitraderberjangka",
      0.00001,
      0.7,
      -0.75,
      -2.25,
      "GBP",
      "AUD",
    ),
    GBPUSD_ORB: fx(
      "GBPUSD_ORB",
      "orbitraderberjangka",
      0.00001,
      1.0,
      -2.25,
      -0.75,
      "GBP",
      "USD",
    ),
    NZDJPY_ORB: fx(
      "NZDJPY_ORB",
      "orbitraderberjangka",
      0.001,
      0.63,
      -1.5,
      -1.5,
      "NZD",
      "JPY",
    ),
    USDCAD_ORB: fx(
      "USDCAD_ORB",
      "orbitraderberjangka",
      0.00001,
      0.7,
      -1.5,
      -1.5,
      "USD",
      "CAD",
    ),
    USDCHF_ORB: fx(
      "USDCHF_ORB",
      "orbitraderberjangka",
      0.00001,
      1.21,
      -1.5,
      -1.5,
      "USD",
      "CHF",
    ),
    USDJPY_ORB: fx(
      "USDJPY_ORB",
      "orbitraderberjangka",
      0.001,
      0.63,
      -1.0,
      -2.0,
      "USD",
      "JPY",
    ),

    // ===== FINEX VERIFIED (16) — broker finex =====
    AUDCAD: fx("AUDCAD", "finex", 0.00001, 1.0, -2.39, -2.35, "AUD", "CAD"),
    AUDCHF: fx("AUDCHF", "finex", 0.00001, 1.21, 0.78, -5.25, "AUD", "CHF"),
    AUDJPY: fx("AUDJPY", "finex", 0.001, 0.63, 0.75, -3.95, "AUD", "JPY"),
    AUDNZD: fx("AUDNZD", "finex", 0.00001, 1.0, 0.0, -2.21, "AUD", "NZD"),
    AUDUSD: fx("AUDUSD", "finex", 0.00001, 1.0, -0.96, -3.15, "AUD", "USD"),
    CADJPY: fx("CADJPY", "finex", 0.001, 0.63, -6.32, 0.96, "CAD", "JPY"),
    CHFJPY: fx("CHFJPY", "finex", 0.001, 0.63, -1.98, -1.64, "CHF", "JPY"),
    EURAUD: fx("EURAUD", "finex", 0.00001, 0.7, -6.73, 1.21, "EUR", "AUD"),
    EURCAD: fx("EURCAD", "finex", 0.00001, 1.0, -1.81, -1.67, "EUR", "CAD"),
    EURCHF: fx("EURCHF", "finex", 0.00001, 1.21, 0.69, -4.24, "EUR", "CHF"),
    EURUSD: fx("EURUSD", "finex", 0.00001, 1.0, -4.69, 1.93, "EUR", "USD"),
    GBPUSD: fx("GBPUSD", "finex", 0.00001, 1.0, -1.11, -2.88, "GBP", "USD"),
    NZDJPY: fx("NZDJPY", "finex", 0.001, 0.63, 0.97, -4.73, "NZD", "JPY"),
    USDCHF: fx("USDCHF", "finex", 0.00001, 1.21, 1.01, -7.84, "USD", "CHF"),
    USDJPY: fx("USDJPY", "finex", 0.001, 0.63, 1.95, -7.91, "USD", "JPY"),
    US100: freezeSpec({
      symbol: "US100",
      broker: "finex",
      pip: 0.01,
      tickSize: 0.01,
      tickValue: 0.2,
      leverage: 100000,
      commission: 0.0,
      swapLong: -25.29,
      swapShort: -117.17,
      swapWedMultiplier: 3,
      swap3DayWeekday: 5, // Jumat (MT5 triple day US100)
      baseCurrency: "US100",
      quoteCurrency: "USD",
      isJPYPair: false,
      status: "VERIFIED",
    }),
  });

export const OTB_SPECS_32: readonly string[] = Object.freeze([
  "AUDCAD_ORB",
  "AUDCHF_ORB",
  "AUDJPY_ORB",
  "AUDNZD_ORB",
  "AUDUSD_ORB",
  "CADJPY_ORB",
  "CHFJPY_ORB",
  "EURAUD_ORB",
  "EURCAD_ORB",
  "EURCHF_ORB",
  "GBPAUD_ORB",
  "GBPUSD_ORB",
  "NZDJPY_ORB",
  "USDCAD_ORB",
  "USDCHF_ORB",
  "USDJPY_ORB",
]);

export const FINEX_SPECS_32: readonly string[] = Object.freeze([
  "AUDCAD",
  "AUDCHF",
  "AUDJPY",
  "AUDNZD",
  "AUDUSD",
  "CADJPY",
  "CHFJPY",
  "EURAUD",
  "EURCAD",
  "EURCHF",
  "EURUSD",
  "GBPUSD",
  "NZDJPY",
  "USDCHF",
  "USDJPY",
  "US100",
]);

/** Lookup exact (case-sensitive); null bila simbol tidak terdaftar. */
export function getInstrumentSpec32(symbol: string): InstrumentSpec | null {
  return INSTRUMENT_SPECS_32[symbol] ?? null;
}

/** True bila simbol terdaftar dengan status VERIFIED. */
export function isSpec32Verified(symbol: string): boolean {
  return getInstrumentSpec32(symbol)?.status === "VERIFIED";
}

/** Daftar simbol JPY (quote JPY) dari 32 specs. */
export function getJPYPairSymbols32(): string[] {
  return Object.values(INSTRUMENT_SPECS_32)
    .filter((spec) => spec.isJPYPair)
    .map((spec) => spec.symbol);
}
