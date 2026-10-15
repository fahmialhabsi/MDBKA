import { findOpeningHold } from "./openingGuard";
import { applyRiskGates, type StrategySetup } from "../calculations/decisionEngine";
import { computeIndicators } from "../calculations/indicators";
import { validateAnalysisInputs } from "../calculations/inputValidator";
import { detectScaleMismatch } from "../calculations/scaleValidator";
import { resolveSwingLevels } from "../calculations/swingDetector";
import { usdIdrRate, type ExchangeRates } from "../services/fxRateService";
import type { AnalysisResult, BrokerSettings, MarketData } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { canonicalSymbolForBroker } from "./brokerSymbols";
import { findDoubleBet } from "./correlationGuard";
import { addOnDecision, type AddOnPosition } from "./addOnRule";
import { findNewsHold, type NewsEventLike } from "./newsGuard";
import { findSessionHold, type TradeSession } from "./sessionGuard";
import { parseCsvCandles } from "./csvCandleParser";
import { resolveCsvBidAsk, type LiveQuoteLike } from "./csvQuote";
import { riskCapFor, withSlippageReserve } from "./riskGroup";
import { applyBrokerPreset, createEmptyMarketForSymbol } from "./marketReset";
import { signalReason } from "./signalReason";
import { proofHoldReason, type EvalTradeStats } from "./evaluationView";
import { getStrategy, type StrategyId } from "./strategyRegistry";
import { tickSizeForSymbol } from "./tickSize";
import { buildBlockedReasons } from "./validationView";
import { withUsdPointValue } from "./usdPointValue";
import { getInstrumentSpec32 } from "./instrumentSpecs32";

/**
 * Langkah 3b (Mode Aman, 8 Okt 2026) — pemindai satu simbol.
 *
 * Meniru PERSIS alur CSV di App (parse → indikator → bid/ask → S/R →
 * preset broker → konversi USD → validasi → analyzeMarket), sehingga
 * hasil pemindai = hasil "Hasil analisa" bila CSV yang sama dimuat.
 * Murni: tanpa React/fetch, aman diuji.
 */
export type ScanStatus =
  | "LOLOS"
  | "DITAHAN_BIAYA"
  | "DITAHAN_RISIKO"
  | "DITAHAN_KORELASI"
  | "DITAHAN_JEDA"
  | "DITAHAN_BERITA"
  | "DITAHAN_SESI"
  | "DITAHAN_SPEK"
  | "DITAHAN_BUKA"
  | "DITAHAN_BUKTI"
  | "TUNGGU"
  | "PASAR_TUTUP"
  | "DATA";

export interface ScanInput {
  readonly symbol: string;
  readonly brokerId: BrokerId;
  readonly csv: string;
  readonly quote: LiveQuoteLike | null;
  readonly equity: number;
  readonly fxRates: ExchangeRates | null;
  readonly nowMs?: number;
  /**
   * Waktu candle TERBARU di antara semua simbol broker yang sama (ms, jam
   * server). Simbol yang tertinggal >= 2 jam = pasar tutup / data basi.
   * Perbandingan relatif → aman tanpa konversi zona waktu.
   */
  readonly referenceCandleMs?: number | null;
  /** Langkah D: posisi terbuka broker ini; sinyal searah → DITAHAN_KORELASI. */
  readonly openPositions?: readonly AddOnPosition[];
  /**
   * T2 (13 Okt 2026): izinkan masuk lagi di simbol SAMA (akun terbukti demo +
   * mode Demo). absen/false = perilaku lama (taruhan ganda).
   */
  readonly addOnAllowed?: boolean;
  /** Langkah F: alasan jeda 3 rugi beruntun (null = tidak jeda). */
  readonly pauseReason?: string | null;
  /**
   * Satpam Kalender K4: event kalender broker ini (jam server). null/absen =
   * kalender tidak tersedia → satpam diabaikan (penetapan Fahmi 9 Okt).
   */
  readonly newsEvents?: readonly NewsEventLike[] | null;
  /** Jam server penilaian berita; default jam quote live (quotes.csv). */
  readonly newsNow?: string;
  /** Satpam Sesi S3: jam trading resmi broker (null/absen = diabaikan). Jam = newsNow. */
  readonly sessions?: readonly TradeSession[] | null;
  /**
   * V2c (10 Okt 2026): simbol yang spesifikasi MT5-nya beda dengan spec32
   * (contract/tick/mata uang profit) → alasan. null/absen = file spesifikasi
   * tidak tersedia → satpam diabaikan.
   */
  readonly specHolds?: ReadonlyMap<string, string> | null;
  /**
   * O2 (10 Okt 2026): jam NYATA (ms UTC) untuk satpam pembukaan bursa indeks
   * & saham AS (−30/+60 mnt). null/absen = satpam diabaikan.
   */
  readonly openingNowMs?: number | null;
  /**
   * F4/F5 (12 Okt 2026): bukti History MT5 kelompok LOLOS broker ini (demo + live).
   * Terbukti rugi → DITAHAN_BUKTI; absen = tanpa satpam bukti (perilaku lama).
   */
  readonly proof?: EvalTradeStats | null;
  /**
   * F2 (13 Okt 2026): gerbang kualitas data (ekspor EA hidup + koneksi
   * terminal). Teks alasan = status DATA (tahan, lebih aman); null/absen = lolos.
   */
  readonly dataQualityReason?: string | null;
  /** S2: strategi pengusul setup; absen = "skor" (identik analyzeMarket). */
  readonly strategy?: StrategyId;
}

export interface ScanRow {
  readonly symbol: string;
  readonly status: ScanStatus;
  readonly decision: AnalysisResult["decision"] | null;
  /** Arah asli: BELI/JUAL bila ada sinyal (termasuk yang ditahan), selain itu TUNGGU. */
  readonly direction: AnalysisResult["decision"] | null;
  /** true = sinyal BELI/JUAL ditahan Mode Aman (biaya/risiko). */
  readonly held: boolean;
  readonly score: number | null;
  readonly reason: string;
  readonly costShareOfRisk: number | null;
  readonly candles: number;
  /**
   * Butir 3 (9 Okt): angka order untuk halaman detail (Salin SL/TP). Hanya
   * diisi bila status LOLOS; selain itu absen/null (tidak ada angka order).
   */
  readonly plan?: ScanPlan | null;
  /**
   * B5d (12 Okt 2026): angka risiko untuk sinyal DITAHAN_RISIKO (absen di
   * status lain) — bahan "modal yang dibutuhkan" di rapor uji data lama.
   */
  readonly riskHold?: ScanRiskHold;
  /** T2: true = LOLOS sebagai "masuk lagi" di simbol sama (kelompok bukti TAMBAH, demo). */
  readonly addOn?: boolean;
}

export interface ScanRiskHold {
  /** Risiko pada lot minimum broker (USD, termasuk spread & komisi). */
  readonly riskAtMinLotUsd: number;
  /** Persen risiko per trade dari modal (preset, mis. 1). */
  readonly riskPercent: number;
  /** Batas golongan dalam USD; null = golongan ditahan / kurs tidak ada. */
  readonly capUsd: number | null;
}

export interface ScanPlan {
  readonly direction: "BELI" | "JUAL";
  readonly entry: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly suggestedLot: number | null;
  /** Risiko pada lot minimum & batas risiko yang dipakai (USD). */
  readonly riskAtMinLot: number | null;
  readonly maxRiskUsd: number;
  readonly riskDistance: number | null;
  readonly targetDistance: number | null;
}

const ZERO_MARKET: MarketData = {
  symbol: "", timeframe: "", bid: 0, ask: 0, close: 0, open: 0, high: 0,
  low: 0, ma50: 0, cci: 0, rsi: 0, macd: 0, macdSignal: 0, atr: 0,
  support: 0, resistance: 0,
};

const ZERO_BROKER: BrokerSettings = {
  equity: 0, riskPercent: 0, minLot: 0, lotStep: 0, pointValue: 0,
  contractSize: 0, commission: 0, slippage: 0, buffer: 0,
  atrMultiplier: 0, targetRR: 0,
};

function dataRow(symbol: string, reason: string, candles: number): ScanRow {
  return {
    symbol, status: "DATA", decision: null, direction: null, held: false,
    score: null, reason, costShareOfRisk: null, candles,
  };
}

/** T2 (Tahap 15): awalan alasan untuk sinyal masuk lagi (kelompok TAMBAH). */
export const ADD_ON_REASON_PREFIX = "Masuk lagi (TAMBAH, posisi pertama aman): ";

/**
 * E1 (Tahap 15): nilai poin USD per lot untuk simbol broker — sumber sama
 * dengan pemindai (preset broker + konversi mata uang kuotasi). Kurs belum
 * ada atau preset tidak dikenal (nilai 0) = null, bukan angka karangan.
 */
export function scanPointValueUsd(symbol: string, brokerId: BrokerId, fxRates: ExchangeRates | null): number | null {
  if (fxRates === null) return null;
  const sym = canonicalSymbolForBroker(symbol, brokerId);
  // Finex: simbol di luar spec32 memakai nilai bawaan preset (bukan spesifikasi) → null.
  if (brokerId === "finex" && getInstrumentSpec32(sym)?.broker !== "finex") return null;
  const pv = withUsdPointValue(applyBrokerPreset({ ...ZERO_BROKER }, sym, brokerId), sym, brokerId, fxRates).pointValue;
  return Number.isFinite(pv) && pv > 0 ? pv : null;
}

/** Selisih minimum (jam) terhadap candle terbaru broker agar dianggap basi. */
export const STALE_CANDLE_HOURS = 2;

/** "2026.10.07 19:00" → ms (diperlakukan sebagai UTC; hanya untuk selisih). */
export function candleTimeMs(time: string): number | null {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})/.exec(time.trim());
  if (m === null) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** Waktu candle terakhir pada teks CSV MDBKA (kolom pertama baris terakhir). */
export function lastCandleTimeMs(csv: string): number | null {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  return candleTimeMs(lines[lines.length - 1].split(",")[0] ?? "");
}

/**
 * TB-2 (13 Okt 2026): hasil pemindai + setup strategi SEBELUM gerbang Mode
 * Aman (SL/TP asli untuk trade bayangan). setup null = belum sampai strategi
 * (data/pasar tutup). Hasil `row` identik dengan scanSymbol.
 */
export interface ScanDetail {
  readonly row: ScanRow;
  readonly setup: StrategySetup | null;
}

export function scanSymbolDetailed(input: ScanInput): ScanDetail {
  const sink: { setup: StrategySetup | null } = { setup: null };
  const row = scanCore(input, sink);
  return { row, setup: sink.setup };
}

export function scanSymbol(input: ScanInput): ScanRow {
  return scanCore(input, { setup: null });
}

function scanCore(input: ScanInput, sink: { setup: StrategySetup | null }): ScanRow {
  const symbol = canonicalSymbolForBroker(input.symbol, input.brokerId);
  if (symbol === "") return dataRow(input.symbol, "Simbol tidak dikenal", 0);
  if (input.dataQualityReason !== undefined && input.dataQualityReason !== null) {
    return dataRow(symbol, input.dataQualityReason, 0);
  }

  const parsed = parseCsvCandles(input.csv);
  const count = parsed.candles.length;
  const indicators = computeIndicators(parsed.candles);
  if (count === 0 || indicators === null) {
    return dataRow(symbol, `Candle kurang (${count}, butuh 50+)`, count);
  }

  const last = parsed.candles[count - 1];
  const lastMs = candleTimeMs(String(last.time ?? ""));
  if (
    input.referenceCandleMs !== undefined &&
    input.referenceCandleMs !== null &&
    lastMs !== null &&
    input.referenceCandleMs - lastMs >= STALE_CANDLE_HOURS * 3_600_000
  ) {
    const lagHours = Math.round((input.referenceCandleMs - lastMs) / 3_600_000);
    return {
      symbol, status: "PASAR_TUTUP", decision: null, direction: null,
      held: false, score: null, costShareOfRisk: null, candles: count,
      reason: `Pasar tutup / data basi: candle terakhir ${last.time}, tertinggal ${lagHours} jam`,
    };
  }
  const quote = resolveCsvBidAsk(
    last.close,
    tickSizeForSymbol(symbol),
    symbol,
    input.quote,
    input.nowMs,
  );
  const levels = resolveSwingLevels(parsed.candles, quote.bid);
  const market: MarketData = {
    ...createEmptyMarketForSymbol(symbol, ZERO_MARKET),
    symbol,
    timeframe: "H1",
    open: last.open,
    high: last.high,
    low: last.low,
    close: last.close,
    ...quote,
    ma50: indicators.ma50,
    rsi: indicators.rsi,
    cci: indicators.cci,
    atr: indicators.atr,
    macd: indicators.macd,
    macdSignal: indicators.macdSignal,
    ...(levels.support !== null ? { support: levels.support } : {}),
    ...(levels.resistance !== null ? { resistance: levels.resistance } : {}),
  };

  const preset = applyBrokerPreset(
    { ...ZERO_BROKER, equity: input.equity },
    symbol,
    input.brokerId,
  );
  // Mode Aman R3: batas risiko golongan (Rupiah) ikut dinilai pemindai.
  // R-1 (15 Okt 2026): dengan cadangan slippage ÷1,1 (hanya pemindai/entry/bayangan).
  const broker: BrokerSettings = withSlippageReserve({
    ...withUsdPointValue(preset, symbol, input.brokerId, input.fxRates),
    riskCap: riskCapFor(symbol, usdIdrRate(input.fxRates)),
  });
  const reasons = buildBlockedReasons({
    market,
    broker: preset,
    validation: validateAnalysisInputs(market, broker, input.brokerId),
    scaleIssues: detectScaleMismatch(market),
  });
  if (reasons !== null) return dataRow(symbol, reasons[0] ?? "Data belum lengkap", count);

  const setup = getStrategy(input.strategy).propose({ market, broker, candles: parsed.candles });
  sink.setup = setup;
  const result = applyRiskGates(market, broker, setup);
  // T2: sinyal ini "masuk lagi" di simbol sama (kelompok bukti TAMBAH)?
  let addOnHit = false;
  const status: ScanStatus =
    result.heldBy === "biaya"
      ? "DITAHAN_BIAYA"
      : result.heldBy === "risiko"
        ? "DITAHAN_RISIKO"
        : result.decision === "TUNGGU"
          ? "TUNGGU"
          : result.riskStatus === "MEMENUHI batas risiko"
            ? "LOLOS"
            : "DITAHAN_RISIKO";
  // V2c: spesifikasi broker berubah → hitungan risiko tak bisa dipercaya → tahan.
  const specReason = input.specHolds?.get(symbol) ?? null;
  if (status === "LOLOS" && (result.decision === "BELI" || result.decision === "JUAL") && specReason !== null) {
    return {
      symbol,
      status: "DITAHAN_SPEK",
      decision: "TUNGGU",
      direction: result.decision,
      held: true,
      score: result.score,
      reason: `${specReason} — sinyal ditahan sampai MDBKA diperbarui`,
      costShareOfRisk: result.costShareOfRisk ?? null,
      candles: count,
    };
  }
  // F5: "Lolos" yang sudah terbukti rugi di History MT5 → tahan (TUNGGU, tanpa SL/TP).
  const buktiReason = proofHoldReason(input.proof);
  if (status === "LOLOS" && (result.decision === "BELI" || result.decision === "JUAL") && buktiReason !== null) {
    return {
      symbol,
      status: "DITAHAN_BUKTI",
      decision: "TUNGGU",
      direction: result.decision,
      held: true,
      score: result.score,
      reason: buktiReason,
      costShareOfRisk: result.costShareOfRisk ?? null,
      candles: count,
    };
  }
  // Langkah F: jeda setelah 3 rugi beruntun menahan semua sinyal lolos.
  if (
    status === "LOLOS" &&
    (result.decision === "BELI" || result.decision === "JUAL") &&
    input.pauseReason !== undefined &&
    input.pauseReason !== null
  ) {
    return {
      symbol,
      status: "DITAHAN_JEDA",
      decision: "TUNGGU",
      direction: result.decision,
      held: true,
      score: result.score,
      reason: input.pauseReason,
      costShareOfRisk: result.costShareOfRisk ?? null,
      candles: count,
    };
  }
  // Satpam Kalender K4: lolos tapi dekat berita Tinggi (±30 mnt) → tahan.
  if (
    status === "LOLOS" &&
    (result.decision === "BELI" || result.decision === "JUAL")
  ) {
    const berita = findNewsHold(
      symbol,
      input.newsNow ?? input.quote?.timestamp ?? "",
      input.newsEvents,
    );
    if (berita !== null) {
      return {
        symbol,
        status: "DITAHAN_BERITA",
        decision: "TUNGGU",
        direction: result.decision,
        held: true,
        score: result.score,
        reason: berita.reason,
        costShareOfRisk: result.costShareOfRisk ?? null,
        candles: count,
      };
    }
  }
  // Satpam Sesi S3: lolos tapi pasar segera tutup / saham jelang libur → tahan.
  if (
    status === "LOLOS" &&
    (result.decision === "BELI" || result.decision === "JUAL")
  ) {
    const sesi = findSessionHold(symbol, input.newsNow ?? input.quote?.timestamp ?? "", input.sessions);
    if (sesi !== null) {
      return {
        symbol,
        status: "DITAHAN_SESI",
        decision: "TUNGGU",
        direction: result.decision,
        held: true,
        score: result.score,
        reason: sesi.reason,
        costShareOfRisk: result.costShareOfRisk ?? null,
        candles: count,
      };
    }
  }
  // O2: lolos tapi dekat pembukaan bursa asal (indeks / saham AS) → tahan.
  if (
    status === "LOLOS" &&
    (result.decision === "BELI" || result.decision === "JUAL") &&
    input.openingNowMs !== undefined &&
    input.openingNowMs !== null
  ) {
    const buka = findOpeningHold(symbol, input.openingNowMs);
    if (buka !== null) {
      return {
        symbol,
        status: "DITAHAN_BUKA",
        decision: "TUNGGU",
        direction: result.decision,
        held: true,
        score: result.score,
        reason: buka.reason,
        costShareOfRisk: result.costShareOfRisk ?? null,
        candles: count,
      };
    }
  }
  // Langkah D: lolos tapi searah dengan posisi terbuka → taruhan ganda.
  if (
    status === "LOLOS" &&
    (result.decision === "BELI" || result.decision === "JUAL") &&
    input.openPositions !== undefined
  ) {
    const tambah = addOnDecision(symbol, result.decision, input.openPositions, input.addOnAllowed === true);
    const dobel =
      tambah.holdReason !== null
        ? { reason: tambah.holdReason }
        : tambah.addOn
          ? findDoubleBet(symbol, result.decision, tambah.positionsForCorrelation)
          : findDoubleBet(symbol, result.decision, input.openPositions);
    if (tambah.addOn && dobel === null) addOnHit = true;
    if (dobel !== null) {
      return {
        symbol,
        status: "DITAHAN_KORELASI",
        decision: "TUNGGU",
        direction: result.decision,
        held: true,
        score: result.score,
        reason: dobel.reason,
        costShareOfRisk: result.costShareOfRisk ?? null,
        candles: count,
      };
    }
  }
  const plan: ScanPlan | null =
    status === "LOLOS" &&
    (result.decision === "BELI" || result.decision === "JUAL") &&
    result.stopLoss !== null &&
    result.takeProfit !== null
      ? {
          direction: result.decision,
          entry: result.entry,
          stopLoss: result.stopLoss,
          takeProfit: result.takeProfit,
          suggestedLot: result.suggestedLot,
          riskAtMinLot: result.riskAtMinLot,
          maxRiskUsd: result.maxRiskUsd,
          riskDistance: result.riskDistance,
          targetDistance: result.targetDistance,
        }
      : null;
  const row: ScanRow = {
    symbol,
    status,
    decision: result.decision,
    direction: result.heldDecision ?? result.decision,
    held: result.heldDecision !== null && result.heldDecision !== undefined,
    score: result.score,
    reason: signalReason(result),
    costShareOfRisk: result.costShareOfRisk ?? null,
    candles: count,
    plan,
    ...(addOnHit ? { addOn: true } : {}),
    ...(status === "DITAHAN_RISIKO" && result.riskAtMinLot !== null
      ? {
          riskHold: {
            riskAtMinLotUsd: result.riskAtMinLot,
            riskPercent: broker.riskPercent,
            capUsd: broker.riskCap?.usd ?? null,
          },
        }
      : {}),
  };
  // F4: teks Alasan memuat bukti History MT5 yang sama dengan badge status.
  // T2: masuk lagi diberi awalan agar terbaca beda dari entry pertama.
  const reasonText = input.proof === undefined ? row.reason : signalReason(result, input.proof);
  if (!addOnHit && input.proof === undefined) return row;
  return { ...row, reason: addOnHit ? `${ADD_ON_REASON_PREFIX}${reasonText}` : reasonText };
}

const STATUS_ORDER: Record<ScanStatus, number> = {
  LOLOS: 0,
  DITAHAN_BIAYA: 1,
  DITAHAN_RISIKO: 2,
  DITAHAN_KORELASI: 3,
  DITAHAN_JEDA: 4,
  DITAHAN_BERITA: 5,
  DITAHAN_SESI: 6,
  DITAHAN_SPEK: 7,
  DITAHAN_BUKA: 8,
  DITAHAN_BUKTI: 9,
  TUNGGU: 10,
  PASAR_TUTUP: 11,
  DATA: 12,
};

/** Urutan tampil: LOLOS dulu, lalu yang paling dekat lolos; skor kuat di atas. */
export function sortScanRows(rows: readonly ScanRow[]): ScanRow[] {
  return [...rows].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const byScore = Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0);
    if (byScore !== 0) return byScore;
    const byCost = (a.costShareOfRisk ?? 1) - (b.costShareOfRisk ?? 1);
    if (byCost !== 0) return byCost;
    return a.symbol.localeCompare(b.symbol);
  });
}
