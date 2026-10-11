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

export type StrategyId = "skor";

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
