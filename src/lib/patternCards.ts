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

/**
 * TI-3 (Tahap 17): konteks saat entry open 1 dari baris `keputusan` (K3).
 * Batas rezim & sesi DIKUNCI sebelum melihat data (seperti AUDIT_FACTORS).
 */
export interface CardContext {
  readonly rsi: number | null;
  readonly adx: number | null;
  readonly bbLebar: number | null;
  readonly posisiMa50: "DI_ATAS" | "DI_BAWAH" | null;
  /** Jam UTC keputusan entry. */
  readonly jamUtc: number | null;
}

export type VolRegime = "SEMPIT" | "SEDANG" | "LEBAR";
export type SessionBucket = "ASIA" | "EROPA" | "EROPA_AS" | "AS" | "SEPI";

/** Lebar Bollinger (atas−bawah)/tengah: < 0,5% sempit, ≤ 1,5% sedang, > 1,5% lebar. */
export function volRegime(bbLebar: number | null): VolRegime | null {
  if (bbLebar === null || !Number.isFinite(bbLebar)) return null;
  return bbLebar < 0.005 ? "SEMPIT" : bbLebar <= 0.015 ? "SEDANG" : "LEBAR";
}

/** Jam UTC: 00–07 Asia, 07–12 Eropa, 12–16 Eropa+AS, 16–21 AS, 21–24 sepi. */
export function sessionBucket(jamUtc: number | null): SessionBucket | null {
  if (jamUtc === null || !Number.isInteger(jamUtc) || jamUtc < 0 || jamUtc > 23) return null;
  return jamUtc < 7 ? "ASIA" : jamUtc < 12 ? "EROPA" : jamUtc < 16 ? "EROPA_AS" : jamUtc < 21 ? "AS" : "SEPI";
}

/** Tingkat 2 = tingkat 1 + rezim volatilitas + sesi; konteks tidak lengkap = null. */
export function fingerprint2(fp1: string, ctx: CardContext | null): string | null {
  const reg = volRegime(ctx?.bbLebar ?? null);
  const ses = sessionBucket(ctx?.jamUtc ?? null);
  return reg === null || ses === null ? null : `${fp1}|${reg}|${ses}`;
}

export interface PatternCardView {
  readonly card: SeriesCard;
  readonly insight: SeriesInsight;
  readonly d1: D1Direction | null;
  /** "FOREX|BUY|NAIK"; arah D1 tidak diketahui = "?". */
  readonly fingerprint: string;
  /** TI-3: konteks entry open 1 (catatan keputusan K3); tidak ada = null. */
  readonly context?: CardContext | null;
  /** TI-3: sidik jari tingkat 2; konteks tidak lengkap = null. */
  readonly fingerprint2?: string | null;
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
export function fingerprintNotes(views: readonly PatternCardView[], tier: 1 | 2 = 1): FingerprintNote[] {
  const by = new Map<string, Partial<Record<SeriesLabel, number>>>();
  for (const v of views) {
    const fp = tier === 1 ? v.fingerprint : (v.fingerprint2 ?? null);
    if (v.card.label === null || fp === null) continue;
    const m = by.get(fp) ?? {};
    m[v.card.label] = (m[v.card.label] ?? 0) + 1;
    by.set(fp, m);
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
  contextOf: (positionId: string) => CardContext | null = () => null,
): PatternCardView[] {
  return buildSeriesCards(trades)
    .map((card) => {
      const d1 = d1DirectionAt(d1Of(card.symbol), card.startTime);
      const fp = fingerprint1(card, d1);
      const context = card.positions[0] === undefined ? null : contextOf(card.positions[0]);
      return { card, insight: seriesInsight(card, trades, excursions, h1Of), d1, fingerprint: fp, context, fingerprint2: fingerprint2(fp, context) };
    })
    .reverse();
}

/** Dari baris `keputusan` jalur entry (K3) → konteks kartu. */
export function contextFromDecision(rec: {
  readonly waktuUtc: string | null;
  readonly masukan: { readonly rsi: number | null };
  readonly konteks?: { readonly adx: number | null; readonly bbLebar: number | null; readonly posisiMa50: "DI_ATAS" | "DI_BAWAH" | null };
}): CardContext {
  const h = rec.waktuUtc === null ? NaN : new Date(rec.waktuUtc).getUTCHours();
  return {
    rsi: rec.masukan.rsi,
    adx: rec.konteks?.adx ?? null,
    bbLebar: rec.konteks?.bbLebar ?? null,
    posisiMa50: rec.konteks?.posisiMa50 ?? null,
    jamUtc: Number.isInteger(h) ? h : null,
  };
}
