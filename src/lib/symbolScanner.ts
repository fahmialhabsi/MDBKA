import { analyzeMarket } from "../calculations/decisionEngine";
import { computeIndicators } from "../calculations/indicators";
import { validateAnalysisInputs } from "../calculations/inputValidator";
import { detectScaleMismatch } from "../calculations/scaleValidator";
import { resolveSwingLevels } from "../calculations/swingDetector";
import type { ExchangeRates } from "../services/fxRateService";
import type { AnalysisResult, BrokerSettings, MarketData } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { canonicalSymbolForBroker } from "./brokerSymbols";
import { parseCsvCandles } from "./csvCandleParser";
import { resolveCsvBidAsk, type LiveQuoteLike } from "./csvQuote";
import { applyBrokerPreset, createEmptyMarketForSymbol } from "./marketReset";
import { signalReason } from "./signalReason";
import { tickSizeForSymbol } from "./tickSize";
import { buildBlockedReasons } from "./validationView";
import { withUsdPointValue } from "./usdPointValue";

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

export function scanSymbol(input: ScanInput): ScanRow {
  const symbol = canonicalSymbolForBroker(input.symbol, input.brokerId);
  if (symbol === "") return dataRow(input.symbol, "Simbol tidak dikenal", 0);

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
  const broker = withUsdPointValue(preset, symbol, input.brokerId, input.fxRates);
  const reasons = buildBlockedReasons({
    market,
    broker: preset,
    validation: validateAnalysisInputs(market, broker, input.brokerId),
    scaleIssues: detectScaleMismatch(market),
  });
  if (reasons !== null) return dataRow(symbol, reasons[0] ?? "Data belum lengkap", count);

  const result = analyzeMarket(market, broker);
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
  return {
    symbol,
    status,
    decision: result.decision,
    direction: result.heldDecision ?? result.decision,
    held: result.heldDecision !== null && result.heldDecision !== undefined,
    score: result.score,
    reason: signalReason(result),
    costShareOfRisk: result.costShareOfRisk ?? null,
    candles: count,
  };
}

const STATUS_ORDER: Record<ScanStatus, number> = {
  LOLOS: 0,
  DITAHAN_BIAYA: 1,
  DITAHAN_RISIKO: 2,
  TUNGGU: 3,
  PASAR_TUTUP: 4,
  DATA: 5,
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
