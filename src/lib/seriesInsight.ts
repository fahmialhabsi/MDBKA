/**
 * K4 (Tahap 17, 15 Okt 2026) — Tim 4 (Pembelajaran Rugi) dan Tim 5 (Pembaca
 * pola) untuk kartu rangkaian. MURNI; aturan pasti, bukan tafsiran.
 *  - Tim 4: sebab rugi rangkaian Pupare Rebus dari MFE open 1 (ambang sama
 *    dengan T-AUDIT): MFE ≥ 0,5R → BERBALIK_SETELAH_0_5R (titik impas
 *    terlambat); MFE < 0,3R → MELAWAN_SEJAK_MASUK (pemicu lemah); selain itu
 *    TANPA_SEBAB_PASTI. Tanpa rekaman MFE → DATA_TIDAK_ADA.
 *  - Tim 5: pola penolakan/engulfing (aturan candleStrategy) pada candle H1
 *    selama posisi berjalan, dibedakan searah / melawan posisi. Candle di luar
 *    berkas H1 (±200 jam terakhir) → null, bukan tebakan.
 */
import type { Candle } from "../calculations/swingDetector";
import { bearishRejection, bullishRejection } from "./candleStrategy";
import type { EvalExcursion, EvalTrade } from "./evaluationView";
import { serverTimeMs } from "./lossStreakGuard";
import type { SeriesCard } from "./seriesCard";
import { AUDIT_RULES } from "./tradeAudit";

export type SeriesLossCause = "BERBALIK_SETELAH_0_5R" | "MELAWAN_SEJAK_MASUK" | "TANPA_SEBAB_PASTI" | "DATA_TIDAK_ADA";

export interface PatternNote {
  readonly time: string;
  readonly pattern: string;
  /** true = mendukung arah posisi; false = melawan. */
  readonly withPosition: boolean;
}

export interface SeriesInsight {
  readonly lossCause: SeriesLossCause | null;
  readonly mfeR: number | null;
  readonly maeR: number | null;
  /** null = candle selama posisi tidak tersedia. */
  readonly patterns: readonly PatternNote[] | null;
}

export function seriesLossCause(excursion: EvalExcursion | undefined): SeriesLossCause {
  if (excursion === undefined || excursion.coverage === "TANPA_DATA" || excursion.mfeR === null) return "DATA_TIDAK_ADA";
  if (excursion.mfeR >= AUDIT_RULES.reversalMfeR) return "BERBALIK_SETELAH_0_5R";
  if (excursion.mfeR < AUDIT_RULES.againstMfeR) return "MELAWAN_SEJAK_MASUK";
  return "TANPA_SEBAB_PASTI";
}

/** Pola H1 antara jam buka dan jam tutup (jam server); data tidak menutupi masa posisi = null. */
export function patternsDuring(h1: readonly Candle[] | null, side: "BUY" | "SELL", openTime: string, closeTime: string): PatternNote[] | null {
  if (h1 === null || h1.length === 0) return null;
  const open = serverTimeMs(openTime);
  const close = serverTimeMs(closeTime);
  const first = serverTimeMs(h1[0]?.time ?? "");
  if (open === null || close === null || first === null || first > open) return null;
  const out: PatternNote[] = [];
  for (let i = 1; i < h1.length; i++) {
    const c = h1[i];
    const t = c === undefined ? null : serverTimeMs(c.time);
    if (c === undefined || t === null || t < open - 3_600_000 || t > close) continue;
    const up = bullishRejection(h1[i - 1], c);
    const down = bearishRejection(h1[i - 1], c);
    if (up !== null) out.push({ time: c.time, pattern: up, withPosition: side === "BUY" });
    if (down !== null) out.push({ time: c.time, pattern: down, withPosition: side === "SELL" });
  }
  return out;
}

/** Gabungkan Tim 4 + Tim 5 untuk satu kartu (open 1 = posisi pertama rangkaian). */
export function seriesInsight(
  card: SeriesCard,
  trades: readonly EvalTrade[],
  excursions: Readonly<Record<string, EvalExcursion>> | undefined,
  h1Of: (symbol: string) => readonly Candle[] | null,
): SeriesInsight {
  const list = trades.filter((t) => card.positions.includes(t.positionId));
  const open1 = list.find((t) => t.positionId === card.positions[0]);
  const ex = open1 === undefined ? undefined : excursions?.[open1.positionId];
  const lastClose = list.reduce((m, t) => (t.closeTime > m ? t.closeTime : m), open1?.closeTime ?? "");
  return {
    lossCause: card.label === "Pupare Rebus" ? seriesLossCause(ex) : null,
    mfeR: ex?.mfeR ?? null,
    maeR: ex?.maeR ?? null,
    patterns: open1 === undefined ? null : patternsDuring(h1Of(card.symbol), card.side, open1.openTime, lastClose),
  };
}
