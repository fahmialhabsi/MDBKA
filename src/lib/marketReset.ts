import type { BrokerSettings, MarketData } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import {
  getInstrumentPreset,
  getInstrumentProfile,
  normalizeSymbol,
} from "./instrumentConfig";
import { DEFAULT_BROKER_ID, ORBITRADER_BROKER_ID } from "./brokerRegistry";
import { exactOtbSymbol } from "./brokerSymbols";
import {
  calculateOtbTickValue,
  getOtbInstrumentProfile,
} from "./otbInstrumentConfig";
import { getSpec32FormDefaults } from "./spec32Wiring";
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
  previous: MarketData,
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
  symbol: string,
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
  symbol: string,
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
  ocrData: Partial<MarketData>,
): MarketData {
  const incomingSym =
    ocrData.symbol !== undefined ? normalizeSymbol(ocrData.symbol) : "";
  const currentSym = normalizeSymbol(previous.symbol);
  const finalSym = currentSym || incomingSym;

  const { kept } = filterOcrPricesForSymbol(ocrData, finalSym);

  const merged: MarketData = { ...previous };

  for (const field of PRICE_SCALE_FIELDS) {
    const value = kept[field];

    // Hanya angka finite non-nol yang disalin. null/NaN/undefined/0
    // tidak boleh menghapus nilai valid (mis. S/R dari CSV), termasuk
    // pada jalur simbol unknown yang mem-bypass filter skala.
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
      continue;
    }

    merged[field] = value;
  }

  if (isFiniteNumber(kept.cci)) merged.cci = kept.cci;

  if (isFiniteNumber(kept.rsi) && kept.rsi >= 0 && kept.rsi <= 100) {
    merged.rsi = kept.rsi;
  }

  if (isFiniteNumber(kept.macd)) merged.macd = kept.macd;

  if (isFiniteNumber(kept.macdSignal)) merged.macdSignal = kept.macdSignal;

  if (isFiniteNumber(kept.atr) && kept.atr > 0) merged.atr = kept.atr;

  if (kept.timeframe !== undefined) merged.timeframe = kept.timeframe;

  // Tahap 5A Step 1: simbol OTB exact tidak boleh dinormalisasi menjadi
  // nama Finex. Simbol OTB aktif dipertahankan (filosofi current-wins);
  // deteksi OTB baru hanya mengisi bila belum ada simbol.
  const previousOtb = exactOtbSymbol(previous.symbol);
  const incomingOtb =
    ocrData.symbol === undefined ? null : exactOtbSymbol(ocrData.symbol);

  merged.symbol =
    previousOtb !== null
      ? previousOtb
      : incomingOtb !== null && previous.symbol.trim() === ""
        ? incomingOtb
        : ocrData.symbol === undefined
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
 * Level S/R hanya usable bila berupa angka finite lebih besar dari 0.
 * null/undefined/NaN/0/negatif tidak boleh menghapus nilai valid yang
 * sudah ada (selaras dengan validator: S/R wajib finite dan > 0).
 */
function isUsableLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Menerapkan Support/Resistance dari deteksi CSV ke state market.
 * Nilai null/0/NaN/undefined/non-finite/negatif TIDAK menimpa nilai
 * sebelumnya (pertahankan previous).
 * Mengembalikan referensi `previous` bila tidak ada perubahan.
 */
export function applySwingLevels(
  previous: MarketData,
  support: number | null,
  resistance: number | null,
): MarketData {
  const nextSupport = isUsableLevel(support) ? support : previous.support;
  const nextResistance = isUsableLevel(resistance)
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

/**
 * Meta konteks deteksi S/R: simbol (dan broker opsional) yang berlaku
 * saat level dihitung. Diteruskan dari SwingLevelsForm via onDetected
 * agar apply dapat menolak level kedaluwarsa/beda-simbol/beda-broker.
 */
export interface CsvSwingLevelMeta {
  readonly csvSymbol: string;
  readonly brokerId?: BrokerId;
}

/** Level hasil deteksi CSV sebelum diterapkan ke market. */
export interface CsvSwingLevelInput extends CsvSwingLevelMeta {
  readonly support: number | null;
  readonly resistance: number | null;
}

/** Konteks aktif App pada saat apply (sumber kebenaran tunggal). */
export interface SwingApplyContext {
  readonly activeSymbol: string;
  readonly activeBrokerId?: BrokerId;
}

/** Hasil apply bergaransi beserta alasan penolakan untuk diagnostik. */
export interface SwingApplyResult {
  readonly market: MarketData;
  readonly applied: boolean;
  readonly appliedSupport: number | null;
  readonly appliedResistance: number | null;
  readonly rejectionReason: string | null;
}

/**
 * Menerapkan S/R CSV ke market hanya bila level valid dan konteks cocok:
 * - simbol CSV (dinormalisasi) harus sama dengan simbol aktif;
 * - bila kedua broker diketahui dan berbeda, level ditolak;
 * - support/resistance harus finite dan > 0;
 * - untuk simbol dikenal, level harus dalam skala instrumen.
 * Mengembalikan market sebelumnya (referensi sama) bila ditolak, sehingga
 * pemanggil dapat memakai diagnostik tanpa mengubah state.
 */
export function applyCsvSwingLevels(
  previous: MarketData,
  input: CsvSwingLevelInput,
  context: SwingApplyContext,
): SwingApplyResult {
  const csvSymbol = normalizeSymbol(input.csvSymbol);
  const activeSymbol = normalizeSymbol(context.activeSymbol);
  // Tahap 6I: nama persis dulu (#AAPL, BABA.US). normalizeSymbol("#AAPL")
  // menghasilkan "" karena "#" di depan, jadi tidak boleh dipakai sendiri.
  const rawCsv = input.csvSymbol.trim().toUpperCase();
  const rawActive = context.activeSymbol.trim().toUpperCase();
  const sameSymbol =
    (rawCsv !== "" && rawCsv === rawActive) ||
    (csvSymbol !== "" && csvSymbol === activeSymbol);

  if (!sameSymbol) {
    return {
      market: previous,
      applied: false,
      appliedSupport: null,
      appliedResistance: null,
      rejectionReason:
        `Ditolak: level CSV untuk simbol ${csvSymbol || "(kosong)"} ` +
        `tidak sesuai simbol aktif ${activeSymbol || "(kosong)"}.`,
    };
  }

  if (
    input.brokerId !== undefined &&
    context.activeBrokerId !== undefined &&
    input.brokerId !== context.activeBrokerId
  ) {
    return {
      market: previous,
      applied: false,
      appliedSupport: null,
      appliedResistance: null,
      rejectionReason:
        `Ditolak: level dari broker ${input.brokerId} tidak dipakai ` +
        `untuk broker aktif ${context.activeBrokerId}. Ambil ulang data ` +
        `dari terminal broker aktif.`,
    };
  }

  if (!isUsableLevel(input.support) || !isUsableLevel(input.resistance)) {
    return {
      market: previous,
      applied: false,
      appliedSupport: null,
      appliedResistance: null,
      rejectionReason:
        "Ditolak: Support/Resistance CSV tidak valid (harus angka finite > 0).",
    };
  }

  const profile = getInstrumentProfile(rawActive || activeSymbol);

  if (
    profile.category !== "unknown" &&
    (input.support < profile.minPrice ||
      input.support > profile.maxPrice ||
      input.resistance < profile.minPrice ||
      input.resistance > profile.maxPrice)
  ) {
    return {
      market: previous,
      applied: false,
      appliedSupport: null,
      appliedResistance: null,
      rejectionReason:
        `Ditolak: level di luar skala ${profile.symbol} ` +
        `(${profile.minPrice}\u2013${profile.maxPrice}).`,
    };
  }

  const market = applySwingLevels(previous, input.support, input.resistance);

  return {
    market,
    applied: true,
    appliedSupport: market.support,
    appliedResistance: market.resistance,
    rejectionReason: null,
  };
}

/**
 * Komisi default Finex dari ekspor terminal 03 Okt 2026 (Tahap 6G):
 * 1.00 USD/lot flat untuk semua simbol (kolom Commission CSV).
 */
export const FINEX_DEFAULT_COMMISSION = 1.0;

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
 * - Finex (default): pointValue/contractSize/buffer mengikuti preset
 *   instrumentConfig; komisi diisi FINEX_DEFAULT_COMMISSION (1.00 USD/lot,
 *   CSV terminal 03 Okt 2026, Tahap 6G) bila kosong; override manual
 *   dipertahankan. Perilaku lama byte-identik kecuali auto-fill komisi.
 * - OrbiTraderBerjangka: lookup EXACT (tanpa normalizeSymbol agar
 *   "GBPUSD_ORB" tidak terpangkas menjadi "GBPUSD"); simbol terdaftar
 *   di spec32 (16 OTB, Tahap 6D) yang memakai preset: pointValue dari
 *   kalkulator tick OTB, contractSize/minLot/lotStep dari preset OTB,
 *   commission dari spec32 (33.00 OTB, Tahap 6G); buffer dipertahankan.
 * - Simbol di luar spec32 (invented/TBD): kembalikan `previous`
 *   (referensi sama, tanpa partial apply, tanpa fallback Finex).
 *   Pengguna mengisi manual dari Specification; warning tampil via
 *   hasOtbPresetForSymbol.
 * - Default strategi hanya diisi bila kosong/invalid; equity/slippage
 *   TIDAK disentuh (wajib input/konfirmasi manual). Komisi OTB diisi dari
 *   preset terverifikasi bila kosong (user override dipertahankan).
 */
export function applyBrokerPreset(
  previous: BrokerSettings,
  symbol: string,
  brokerId: BrokerId = DEFAULT_BROKER_ID,
  /**
   * force=true (tombol "Gunakan preset"): field milik broker
   * (pointValue/contractSize/commission/minLot/lotStep) SELALU ditulis
   * dari spec terverifikasi, menimpa nilai basi lintas broker
   * (mis. minLot 0.01 Finex nyangkut di OTB yang wajib 0.10).
   * Field akun/strategi (equity/slippage/riskPercent/atrMultiplier/
   * targetRR/buffer) tetap needsFill agar override manual aman.
   * Default false: perilaku lama byte-identik (auto saat ganti simbol).
   */
  force: boolean = false,
): BrokerSettings {
  if (brokerId === ORBITRADER_BROKER_ID) {
    // Tahap 6D: 16 simbol OTB aktif via spec32 (data CSV MT5 real).
    // Gate verified = spec32; commission per broker (OTB 33.00, Tahap 6G).
    // Simbol di luar spec32 (invented/TBD) → return previous
    // (referensi sama, tanpa partial apply). OTB_PRESETS fixture tetap
    // menjadi sumber profile fisik (pointValue/contractSize/minLot);
    // commission diambil dari spec32, bukan fixture.
    const spec32Defaults = getSpec32FormDefaults(symbol);

    if (!spec32Defaults.verified) {
      return previous;
    }

    const otb = getOtbInstrumentProfile(symbol);

    if (otb === null) {
      return previous;
    }

    return {
      ...previous,
      pointValue: calculateOtbTickValue(otb),
      contractSize: otb.contractSize,
      commission:
        force || needsFill(previous.commission)
          ? spec32Defaults.commission
          : previous.commission,
      riskPercent: needsFill(previous.riskPercent)
        ? STRATEGY_DEFAULTS.riskPercent
        : previous.riskPercent,
      minLot:
        force || needsFill(previous.minLot) ? otb.minVolume : previous.minLot,
      lotStep:
        force || needsFill(previous.lotStep)
          ? otb.volumeStep
          : previous.lotStep,
      atrMultiplier: needsFill(previous.atrMultiplier)
        ? STRATEGY_DEFAULTS.atrMultiplier
        : previous.atrMultiplier,
      targetRR: needsFill(previous.targetRR)
        ? STRATEGY_DEFAULTS.targetRR
        : previous.targetRR,
    };
  }

  const preset = getInstrumentPreset(symbol);

  return {
    ...previous,
    pointValue: preset.defaultPointValue,
    contractSize: preset.contractSize,
    buffer: preset.defaultBuffer,
    // Tahap 6G: komisi Finex 1.00 USD/lot (CSV terminal); override manual
    // dipertahankan (needsFill hanya mengisi nilai kosong/invalid),
    // kecuali force via tombol preset.
    commission:
      force || needsFill(previous.commission)
        ? FINEX_DEFAULT_COMMISSION
        : previous.commission,
    riskPercent: needsFill(previous.riskPercent)
      ? STRATEGY_DEFAULTS.riskPercent
      : previous.riskPercent,
    minLot:
      force || needsFill(previous.minLot)
        ? STRATEGY_DEFAULTS.minLot
        : previous.minLot,
    lotStep:
      force || needsFill(previous.lotStep)
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
  if (
    trimmed === "-" ||
    trimmed === "+" ||
    trimmed === "." ||
    trimmed === "-."
  ) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}
