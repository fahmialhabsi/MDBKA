/**
 * S2 (12 Okt 2026) — RAK STRATEGI. MODUL MURNI.
 *
 * Satu strategi = satu fungsi yang MENGUSULKAN setup (arah + SL/TP) dari
 * data pasar + riwayat candle. Lot, batas Rupiah golongan, dan gerbang
 * biaya Mode Aman SELALU lewat applyRiskGates (rumus tunggal, S1).
 *
 * Default "skor" = mesin lama (scoreSetup) → hasil identik dengan
 * analyzeMarket. Strategi baru hanya ditambahkan di sini setelah lulus
 * rapor uji data lama (npm run backtest) — tampilan tetap memakai default.
 */
import type { Candle } from "../calculations/swingDetector";
import { scoreSetup, type StrategySetup } from "../calculations/decisionEngine";
import type { BrokerSettings, MarketData } from "../types/analysis";
import { candleSetup } from "./candleStrategy";
import { scalpSetup } from "./scalpStrategy";
import { abcSetup } from "./abcStrategy";

export type StrategyId = "skor" | "candle" | "scalping" | "abc";

export interface StrategyContext {
  readonly market: MarketData;
  readonly broker: BrokerSettings;
  /** Candle H1 tertutup, lama → baru (candle terakhir = market). */
  readonly candles: readonly Candle[];
}

export interface Strategy {
  readonly id: StrategyId;
  readonly label: string;
  readonly description: string;
  propose(context: StrategyContext): StrategySetup;
}

export const DEFAULT_STRATEGY_ID: StrategyId = "skor";

export const STRATEGIES: Readonly<Record<StrategyId, Strategy>> = {
  skor: {
    id: "skor",
    label: "Skor indikator",
    description: "MA50 + CCI + MACD + RSI (skor >= 3 searah MA50); SL support/resistance atau ATR, TP = R:R broker.",
    propose: ({ market, broker }) => scoreSetup(market, broker),
  },
  candle: {
    id: "candle",
    label: "Pola candle (tren → mundur → penolakan)",
    description: "C1: tren HH/HL dari swing, mundur >= 1×ATR tanpa menembus lembah/puncak, lalu wick penolakan atau engulfing; SL di ujung wick, TP = R:R broker.",
    propose: ({ market, broker, candles }) => candleSetup(market, broker, candles),
  },
  scalping: {
    id: "scalping",
    label: "Scalping MIFX (MA9×MA120 + Stochastic + engulfing)",
    description: "P1: tren MA9/MA120 + crossing baru (<= 24 candle) + Stochastic 14,3 sempat <= 20 / >= 80 + engulfing; SL ujung 2 candle, TP = 2× SL (PDF MIFX).",
    propose: ({ market, broker, candles }) => scalpSetup(market, broker, candles),
  },
  abc: {
    id: "abc",
    label: "Koreksi ABC emas H4 (tren → A-B-C → penolakan)",
    description: "P2: dorongan L0→P0 >= 3×ATR, koreksi A-B-C (C lewat A, L0 utuh), candle penolakan di ujung C; SL ujung C, TP = 2× SL (PDF ABC gold).",
    propose: ({ market, broker, candles }) => abcSetup(market, broker, candles),
  },
};

export const STRATEGY_IDS: readonly StrategyId[] = Object.keys(STRATEGIES) as StrategyId[];

/** Strategi menurut id; id kosong/tak dikenal → default. */
export function getStrategy(id: StrategyId | null | undefined): Strategy {
  return id !== null && id !== undefined && id in STRATEGIES ? STRATEGIES[id] : STRATEGIES[DEFAULT_STRATEGY_ID];
}

/** Teks bebas (argumen perintah / URL) → id; tak dikenal → null (jujur, tanpa tebakan). */
export function parseStrategyId(raw: string | null | undefined): StrategyId | null {
  const v = (raw ?? "").trim().toLowerCase();
  return (STRATEGY_IDS as readonly string[]).includes(v) ? (v as StrategyId) : null;
}
