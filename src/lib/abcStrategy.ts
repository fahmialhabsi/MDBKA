/**
 * P2 (12 Okt 2026) — STRATEGI "abc": koreksi ABC emas H4 (PDF "Strategi ABC
 * Correction untuk Trading Gold") diterjemahkan jadi aturan pasti. MODUL MURNI.
 * Disetujui Fahmi 12 Okt 2026: tanda C selesai = candle penolakan (A1),
 * TP = 2× jarak SL (B1).
 *
 * BELI (JUAL = cermin, dihitung pada harga terbalik):
 * 1. Dorongan tren: lembah swing L0 → puncak swing P0, tinggi >= `minImpulseAtr`×ATR.
 * 2. Gelombang A: lembah swing A sesudah P0, A di atas L0.
 * 3. Gelombang B: puncak swing B sesudah A, B di bawah P0 dan di atas A.
 * 4. Gelombang C: sejak B harga turun DI BAWAH A tetapi tidak menembus L0;
 *    ujung C terjadi pada candle terakhir atau sebelumnya (pola masih segar).
 * 5. Candle terakhir = penolakan (wick bawah panjang / bullish engulfing,
 *    alat yang sama dengan strategi candle C1).
 * 6. SL = ujung C − buffer broker; TP = entry + `rewardRisk`× jarak SL.
 * Lot, batas Rupiah, biaya = applyRiskGates. Angka DIKUNCI sebelum uji.
 */
import { detectSwingLevels, type Candle } from "../calculations/swingDetector";
import type { StrategySetup } from "../calculations/decisionEngine";
import type { BrokerSettings, MarketData } from "../types/analysis";
import { bearishRejection, bullishRejection, CANDLE_PARAMS } from "./candleStrategy";

export interface AbcParams {
  readonly swingStrength: number;
  readonly minImpulseAtr: number;
  readonly rewardRisk: number;
}

export const ABC_PARAMS: AbcParams = { swingStrength: 3, minImpulseAtr: 3, rewardRisk: 2 };

export interface AbcPattern {
  readonly l0: number;
  readonly p0: number;
  readonly a: number;
  readonly b: number;
  /** Ujung gelombang C (low terendah sejak B). */
  readonly c: number;
  readonly impulseAtr: number;
  readonly why: string;
}

/** Cari pola ABC naik (untuk BELI) pada candle apa adanya. null = belum ada. */
export function findBullishAbc(
  candles: readonly Candle[],
  atr: number,
  p: AbcParams = ABC_PARAMS,
): { pattern: AbcPattern | null; reason: string } {
  const n = candles.length;
  if (n < p.swingStrength * 2 + 5 || !(atr > 0)) return { pattern: null, reason: "Candle/ATR belum cukup" };
  const last = candles[n - 1];
  const sw = detectSwingLevels([...candles], last.close, p.swingStrength);
  const highs = sw.swingHighs;
  const lows = sw.swingLows;
  const bPt = highs[highs.length - 1];
  if (bPt === undefined) return { pattern: null, reason: "Belum ada puncak B" };
  const aPt = [...lows].reverse().find((l) => l.index < bPt.index);
  if (aPt === undefined) return { pattern: null, reason: "Belum ada lembah A" };
  const p0Pt = [...highs].reverse().find((h) => h.index < aPt.index);
  if (p0Pt === undefined) return { pattern: null, reason: "Belum ada puncak P0" };
  const l0Pt = [...lows].reverse().find((l) => l.index < p0Pt.index);
  if (l0Pt === undefined) return { pattern: null, reason: "Belum ada lembah L0" };

  const impulseAtr = (p0Pt.price - l0Pt.price) / atr;
  if (impulseAtr < p.minImpulseAtr) return { pattern: null, reason: "Dorongan tren terlalu kecil" };
  if (!(aPt.price > l0Pt.price && aPt.price < p0Pt.price)) return { pattern: null, reason: "Gelombang A tidak sah" };
  if (!(bPt.price < p0Pt.price && bPt.price > aPt.price)) return { pattern: null, reason: "Gelombang B tidak sah (melewati P0)" };

  const since = candles.slice(bPt.index + 1);
  if (since.length === 0) return { pattern: null, reason: "Gelombang C belum mulai" };
  const c = Math.min(...since.map((x) => x.low));
  if (c <= l0Pt.price) return { pattern: null, reason: "L0 tertembus — tren rusak" };
  if (!(c < aPt.price)) return { pattern: null, reason: "Gelombang C belum turun di bawah A" };
  const prev = candles[n - 2];
  if (!(last.low === c || prev.low === c)) return { pattern: null, reason: "Ujung C sudah lewat (pola basi)" };
  const why = bullishRejection(prev, last, CANDLE_PARAMS);
  if (why === null) return { pattern: null, reason: "Gelombang C terbentuk, menunggu candle penolakan" };
  return { pattern: { l0: l0Pt.price, p0: p0Pt.price, a: aPt.price, b: bPt.price, c, impulseAtr, why }, reason: "" };
}

const flip = (c: Candle): Candle => ({ time: c.time, open: -c.open, high: -c.low, low: -c.high, close: -c.close });

function fmt(v: number): string {
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

export function abcSetup(
  market: MarketData,
  broker: BrokerSettings,
  candles: readonly Candle[],
  p: AbcParams = ABC_PARAMS,
): StrategySetup {
  const base = { score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0 };
  const up = findBullishAbc(candles, market.atr, p);
  if (up.pattern !== null) {
    const pt = up.pattern;
    const entry = market.ask;
    const stopLoss = pt.c - broker.buffer;
    const riskDistance = entry - stopLoss;
    if (riskDistance > 0) {
      const takeProfit = entry + riskDistance * p.rewardRisk;
      return {
        ...base, decision: "BELI", entry, stopLoss, takeProfit, riskDistance, targetDistance: takeProfit - entry,
        factors: [`Tren naik ${fmt(pt.impulseAtr)}× ATR (L0 → P0)`, "Koreksi A-B-C: C turun di bawah A, L0 utuh", pt.why],
        waitWarning: "", waitExplanation: "",
      };
    }
  }
  const down = findBullishAbc(candles.map(flip), market.atr, p);
  if (down.pattern !== null) {
    const pt = down.pattern;
    const entry = market.bid;
    const stopLoss = -pt.c + broker.buffer;
    const riskDistance = stopLoss - entry;
    if (riskDistance > 0) {
      const takeProfit = entry - riskDistance * p.rewardRisk;
      return {
        ...base, decision: "JUAL", entry, stopLoss, takeProfit, riskDistance, targetDistance: entry - takeProfit,
        factors: [`Tren turun ${fmt(pt.impulseAtr)}× ATR (L0 → P0)`, "Koreksi A-B-C: C naik di atas A, L0 utuh", bearishRejection(candles[candles.length - 2], candles[candles.length - 1], CANDLE_PARAMS) ?? pt.why],
        waitWarning: "", waitExplanation: "",
      };
    }
  }
  return {
    ...base, decision: "TUNGGU", entry: (market.bid + market.ask) / 2, stopLoss: null, takeProfit: null,
    riskDistance: null, targetDistance: null,
    factors: [`Naik: ${up.reason}`, `Turun: ${down.reason}`],
    waitWarning: "Pola ABC belum lengkap: tren → A → B → C (lewat A) → candle penolakan.",
    waitExplanation: "Lebih baik menunggu: koreksi A-B-C belum selesai atau belum dikonfirmasi candle.",
  };
}
