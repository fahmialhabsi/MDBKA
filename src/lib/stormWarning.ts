/**
 * CU-1 (15 Okt 2026, disetujui Fahmi) — "Peringatan Badai 30 menit".
 * Temuan Lolosyiob v2 (docs/LOLOSYIOB-KERJA-CEPAT-2026-10-15.md bag. 13.3), diuji ulang di M15
 * (5 pasangan Forex + XAUUSD Finex, Sep 2025 – Okt 2026): bila rentang 1 jam terakhir (4 candle M15)
 * > 2× median rentang 1 jam sebelumnya (96 jendela), peluang rentang 30 menit berikutnya > 1,5× biasa
 * = 58–61% (latih/ujian), dibanding 18% saat normal.
 * MURNI & hanya peringatan: tidak menahan sinyal, tidak mengubah keputusan / Hasil analisa.
 * Yang diramal hanya KEKUATAN gerak, bukan ARAH.
 */
import type { Candle } from "../calculations/swingDetector";

export const STORM_WINDOW = 4; // 4 × M15 = 1 jam
export const STORM_MEDIAN_N = 96; // 96 jendela ≈ 1 hari
export const STORM_MIN_HISTORY = 40; // median minimal dari 40 jendela
export const STORM_K = 2;
/** Angka bukti uji (dipakai di teks; bukan hasil hitung langsung). */
export const STORM_EVIDENCE = { stormPct: 60, normalPct: 18 } as const;

export type StormStatus = "BADAI" | "NORMAL" | "DATA_KURANG";

export interface StormWarning {
  readonly status: StormStatus;
  /** Rentang 1 jam terakhir ÷ median; null bila data kurang. */
  readonly ratio: number | null;
  readonly text: string;
}

function windowRange(c: readonly Candle[], end: number): number {
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = end - STORM_WINDOW + 1; i <= end; i++) {
    const k = c[i] as Candle;
    if (k.high > hi) hi = k.high;
    if (k.low < lo) lo = k.low;
  }
  return hi - lo;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const fmt = (v: number): string => v.toFixed(1).replace(".", ",");

/** candles: M15 TERTUTUP, urut lama → baru. */
export function stormWarning(candles: readonly Candle[]): StormWarning {
  const last = candles.length - 1;
  const hist: number[] = [];
  for (let end = last - 1; end >= STORM_WINDOW - 1 && hist.length < STORM_MEDIAN_N; end--) hist.push(windowRange(candles, end));
  if (last < STORM_WINDOW - 1 || hist.length < STORM_MIN_HISTORY) {
    return { status: "DATA_KURANG", ratio: null, text: "Peringatan badai: candle M15 belum cukup" };
  }
  const med = median(hist);
  const now = windowRange(candles, last);
  if (!(med > 0)) return { status: "DATA_KURANG", ratio: null, text: "Peringatan badai: harga datar, tidak dinilai" };
  const ratio = now / med;
  if (ratio > STORM_K) {
    return {
      status: "BADAI",
      ratio,
      text: `Peringatan Badai 30 menit: gerak 1 jam terakhir ${fmt(ratio)}× biasanya — peluang gerak liar ±${STORM_EVIDENCE.stormPct}% (normal ±${STORM_EVIDENCE.normalPct}%). SL lebih mudah tersentuh; hanya peringatan, arah tidak diramal.`,
    };
  }
  return { status: "NORMAL", ratio, text: `Cuaca normal: gerak 1 jam ${fmt(ratio)}× biasanya` };
}
