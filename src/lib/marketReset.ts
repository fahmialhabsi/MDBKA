import type { BrokerSettings, MarketData } from "../types/analysis";
import {
  getInstrumentPreset,
  getInstrumentProfile,
  normalizeSymbol,
} from "./instrumentConfig";
import { traceOcrStage } from "./debugTrace";

/** Field numerik MarketData yang dikosongkan (0) saat simbol berubah. */
export const RESET_MARKET_FIELDS = [
  "bid",
  "ask",
  "close",
  "open",
  "high",
  "low",
  "ma50",
  "cci",
  "rsi",
  "macd",
  "macdSignal",
  "atr",
  "support",
  "resistance",
] as const;

export type ResetMarketField = (typeof RESET_MARKET_FIELDS)[number];

/** Field harga yang terikat skala instrumen (ikut difilter saat OCR). */
const PRICE_SCALE_FIELDS: readonly ResetMarketField[] = [
  "bid",
  "ask",
  "close",
  "open",
  "high",
  "low",
  "ma50",
  "support",
  "resistance",
];

/**
 * Membuat state market kosong untuk simbol baru dari state sebelumnya.
 * Simbol dan timeframe dipertahankan; semua harga/indikator menjadi 0
 * (JANGAN diisi angka contoh instrumen mana pun — bukan data fiktif,
 * melainkan penanda "belum diisi" yang divalidasi sebagai belum lengkap).
 * Mengembalikan referensi `previous` tanpa perubahan jika simbol sama.
 */
export function createEmptyMarketForSymbol(
  symbol: string,
  previous: MarketData
): MarketData {
  if (previous.symbol === symbol) return previous;

  return {
    ...previous,
    symbol,
    bid: 0,
    ask: 0,
    close: 0,
    open: 0,
    high: 0,
    low: 0,
    ma50: 0,
    cci: 0,
    rsi: 0,
    macd: 0,
    macdSignal: 0,
    atr: 0,
    support: 0,
    resistance: 0,
  };
}

/** True jika semua field harga/indikator sudah 0 untuk simbol tersebut. */
export function isMarketEmptyForSymbol(
  market: MarketData,
  symbol: string
): boolean {
  if (market.symbol !== symbol) return false;

  return RESET_MARKET_FIELDS.every((field) => market[field] === 0);
}

/**
 * Menyaring field harga OCR terhadap skala simbol final.
 * Harga di luar [minPrice, maxPrice] dibuang (tidak masuk state);
 * indikator bebas skala (cci/rsi/macd/atr) selalu dipertahankan.
 * Simbol unknown menerima semua harga (validator yang akan menolaknya).
 */
export function filterOcrPricesForSymbol(
  data: Partial<MarketData>,
  symbol: string
): { kept: Partial<MarketData>; droppedCount: number } {
  const profile = getInstrumentProfile(symbol);

  if (profile.category === "unknown") {
    return { kept: { ...data }, droppedCount: 0 };
  }

  const kept: Partial<MarketData> = { ...data };
  let droppedCount = 0;

  for (const field of PRICE_SCALE_FIELDS) {
    const value = data[field];

    if (value === undefined) continue;

    if (
      !Number.isFinite(value) ||
      value < profile.minPrice ||
      value > profile.maxPrice
    ) {
      delete kept[field];
      droppedCount += 1;
    }
  }

  return { kept, droppedCount };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Merge hasil OCR parsial ke state market.
 *
 * Aturan sumber data (prioritas: manual > CSV > OCR):
 * - hanya field finite yang disalin; undefined/null/NaN diabaikan,
 * - field harga 0 tidak pernah disalin (0 = "tidak ditemukan"),
 * - Support/Resistance dari CSV dipertahankan bila OCR tidak membawanya,
 * - harga di luar skala simbol final ditolak (lihat filterOcrPricesForSymbol),
 * - simbol manual pengguna tidak ditimpa OCR secara diam-diam:
 *   usulan OCR dipakai hanya bila belum ada pilihan simbol.
 */
export function mergeValidOcrMarketData(
  previous: MarketData,
  ocrData: Partial<MarketData>
): MarketData {
  const incomingSym =
    ocrData.symbol !== undefined ? normalizeSymbol(ocrData.symbol) : "";
  const currentSym = normalizeSymbol(previous.symbol);
  const finalSym = currentSym || incomingSym;

  const { kept } = filterOcrPricesForSymbol(ocrData, finalSym);

  const merged: MarketData = { ...previous };

  for (const field of PRICE_SCALE_FIELDS) {
    const value = kept[field];

    if (value === undefined || value === 0) continue;

    merged[field] = value;
  }

  if (isFiniteNumber(kept.cci)) merged.cci = kept.cci;

  if (
    isFiniteNumber(kept.rsi) &&
    kept.rsi >= 0 &&
    kept.rsi <= 100
  ) {
    merged.rsi = kept.rsi;
  }

  if (isFiniteNumber(kept.macd)) merged.macd = kept.macd;

  if (isFiniteNumber(kept.macdSignal)) merged.macdSignal = kept.macdSignal;

  if (isFiniteNumber(kept.atr) && kept.atr > 0) merged.atr = kept.atr;

  if (kept.timeframe !== undefined) merged.timeframe = kept.timeframe;

  merged.symbol =
    ocrData.symbol === undefined
      ? previous.symbol
      : finalSym || previous.symbol;

  traceOcrStage("merge", {
    activeSymbol: finalSym,
    previousMarket: previous,
    ocrData,
    nextMarket: merged,
  });

  return merged;
}

/**
 * Menerapkan Support/Resistance dari deteksi CSV ke state market.
 * Nilai null TIDAK menimpa nilai CSV sebelumnya (pertahankan previous).
 * Mengembalikan referensi `previous` bila tidak ada perubahan.
 */
export function applySwingLevels(
  previous: MarketData,
  support: number | null,
  resistance: number | null
): MarketData {
  const nextSupport =
    support !== null && Number.isFinite(support)
      ? support
      : previous.support;
  const nextResistance =
    resistance !== null && Number.isFinite(resistance)
      ? resistance
      : previous.resistance;

  if (
    previous.support === nextSupport &&
    previous.resistance === nextResistance
  ) {
    return previous;
  }

  return { ...previous, support: nextSupport, resistance: nextResistance };
}

/** Default strategi (bukan data broker): aman diisi saat belum ada nilai. */
const STRATEGY_DEFAULTS = {
  riskPercent: 10,
  minLot: 0.01,
  lotStep: 0.01,
  atrMultiplier: 1.2,
  targetRR: 1.5,
} as const;

function needsFill(value: number): boolean {
  return !Number.isFinite(value) || value <= 0;
}

/**
 * Menerapkan preset broker untuk simbol baru TANPA menebak data akun:
 * - pointValue/contractSize/buffer selalu mengikuti preset instrumen,
 * - default strategi (risiko/lot/ATR/RR) hanya diisi bila kosong/invalid,
 * - equity/komisi/slippage TIDAK disentuh (wajib input/konfirmasi manual).
 */
export function applyBrokerPreset(
  previous: BrokerSettings,
  symbol: string
): BrokerSettings {
  const preset = getInstrumentPreset(symbol);

  return {
    ...previous,
    pointValue: preset.defaultPointValue,
    contractSize: preset.contractSize,
    buffer: preset.defaultBuffer,
    riskPercent: needsFill(previous.riskPercent)
      ? STRATEGY_DEFAULTS.riskPercent
      : previous.riskPercent,
    minLot: needsFill(previous.minLot)
      ? STRATEGY_DEFAULTS.minLot
      : previous.minLot,
    lotStep: needsFill(previous.lotStep)
      ? STRATEGY_DEFAULTS.lotStep
      : previous.lotStep,
    atrMultiplier: needsFill(previous.atrMultiplier)
      ? STRATEGY_DEFAULTS.atrMultiplier
      : previous.atrMultiplier,
    targetRR: needsFill(previous.targetRR)
      ? STRATEGY_DEFAULTS.targetRR
      : previous.targetRR,
  };
}

/** Adapter tampilan: state 0 berarti "kosong" di input. */
export function displayMarketNumber(value: number): string {
  return value === 0 ? "" : String(value);
}

/**
 * Adapter input -> state (state tetap number, tidak pernah NaN).
 * Mengembalikan null untuk ketikan sementara ("-", ".") agar pemanggil
 * mempertahankan nilai lama dan pengguna bisa melanjutkan mengetik
 * (mis. angka negatif CCI). String kosong berarti 0.
 */
export function parseMarketInput(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");

  if (trimmed === "") return 0;
  if (trimmed === "-" || trimmed === "+" || trimmed === "." || trimmed === "-.") {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}
