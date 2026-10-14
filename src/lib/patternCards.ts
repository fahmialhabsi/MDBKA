/**
 * K5 (Tahap 17, 15 Okt 2026) — kartu pola siap tampil + sidik jari tingkat 1
 * (K-6: golongan + arah + arah D1) dan catatan "pola ini pernah …". MURNI.
 * Arah D1 dinilai dari candle D1 yang SUDAH TUTUP sebelum hari open 1.
 * Sebelum ≥ 20 kartu per sidik jari: hanya catatan, tidak mengubah keputusan.
 * Tingkat 2–3 (rezim volatilitas, sesi, pola, skor) menunggu catatan konteks K3 cukup.
 */
import type { Candle } from "../calculations/swingDetector";
import { d1Direction, type D1Direction } from "./dailyLevels";
import type { EvalExcursion, EvalTrade } from "./evaluationView";
import { riskGroupOf } from "./riskGroup";
import { buildSeriesCards, type SeriesCard, type SeriesLabel } from "./seriesCard";
import { seriesInsight, type SeriesInsight } from "./seriesInsight";

export const FINGERPRINT_MIN_CARDS = 20;

export interface PatternCardView {
  readonly card: SeriesCard;
  readonly insight: SeriesInsight;
  readonly d1: D1Direction | null;
  /** "FOREX|BUY|NAIK"; arah D1 tidak diketahui = "?". */
  readonly fingerprint: string;
}

export interface FingerprintNote {
  readonly fingerprint: string;
  readonly n: number;
  readonly counts: Readonly<Partial<Record<SeriesLabel, number>>>;
  readonly text: string;
  /** false = n < 20: catatan saja. */
  readonly enough: boolean;
}

/** Arah D1 dari candle D1 yang tutup sebelum hari `startTime` (jam server). */
export function d1DirectionAt(d1: readonly Candle[] | null, startTime: string): D1Direction | null {
  if (d1 === null) return null;
  const day = startTime.slice(0, 10);
  const closed = d1.filter((c) => c.time.slice(0, 10) < day);
  return d1Direction(closed)?.direction ?? null;
}

export function fingerprint1(card: SeriesCard, d1: D1Direction | null): string {
  return `${riskGroupOf(card.symbol).id}|${card.side}|${d1 ?? "?"}`;
}

const ORDER: readonly SeriesLabel[] = ["Kasbi Bakar", "Popeda Sagu", "Sagu Tumang", "Pupare Rebus"];

/** Catatan per sidik jari (hanya kartu berlabel). */
export function fingerprintNotes(views: readonly PatternCardView[]): FingerprintNote[] {
  const by = new Map<string, Partial<Record<SeriesLabel, number>>>();
  for (const v of views) {
    if (v.card.label === null) continue;
    const m = by.get(v.fingerprint) ?? {};
    m[v.card.label] = (m[v.card.label] ?? 0) + 1;
    by.set(v.fingerprint, m);
  }
  return [...by.entries()]
    .map(([fingerprint, counts]) => {
      const n = ORDER.reduce((s, l) => s + (counts[l] ?? 0), 0);
      const parts = ORDER.filter((l) => (counts[l] ?? 0) > 0).map((l) => `${counts[l]}× ${l}`);
      const enough = n >= FINGERPRINT_MIN_CARDS;
      return {
        fingerprint,
        n,
        counts,
        enough,
        text: `Pola ini pernah ${parts.join(", ")} (n=${n}${enough ? "" : ` < ${FINGERPRINT_MIN_CARDS}: catatan saja, belum mengubah keputusan`})`,
      };
    })
    .sort((a, b) => b.n - a.n);
}

/** Kartu + wawasan Tim 4/5 + sidik jari, urut terbaru dulu. */
export function buildPatternCards(
  trades: readonly EvalTrade[],
  excursions: Readonly<Record<string, EvalExcursion>> | undefined,
  h1Of: (symbol: string) => readonly Candle[] | null,
  d1Of: (symbol: string) => readonly Candle[] | null,
): PatternCardView[] {
  return buildSeriesCards(trades)
    .map((card) => {
      const d1 = d1DirectionAt(d1Of(card.symbol), card.startTime);
      return { card, insight: seriesInsight(card, trades, excursions, h1Of), d1, fingerprint: fingerprint1(card, d1) };
    })
    .reverse();
}
