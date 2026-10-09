/**
 * Satpam Kalender K3 (9 Okt 2026) — aturan "jangan masuk dekat berita".
 *
 * Penetapan Fahmi: hanya berita TINGGI (HIGH), jendela ±30 menit untuk
 * semua golongan, mata uang ikut mata uang harga simbol. Jam berita &
 * jam "sekarang" WAJIB jam server broker yang sama (format MT5
 * "YYYY.MM.DD HH:MM:SS") → tanpa konversi zona waktu. Kalender tidak ada
 * = tidak ada tahanan (satpam diabaikan). MODUL MURNI (CJS-safe).
 */
import type { AnalysisResult } from "../types/analysis";
import { parseSnapshotTime } from "./dataFreshness";
import { baseRiskSymbol, riskGroupOf } from "./riskGroup";
import { TIME_STOP_HOURS, timeStopApplies } from "./exitMonitor";

/** Menit sebelum & sesudah jam rilis berita Tinggi (penetapan 9 Okt). */
export const NEWS_WINDOW_MINUTES = 30;

/**
 * Penetapan Fahmi 9 Okt (siang): golongan ber-time-stop (Forex & Forex JPY,
 * horizon 3 jam) ditahan bila ada berita Tinggi dalam 3 jam KE DEPAN —
 * posisi yang dibuka sekarang masih terbuka saat berita rilis. Sesudah
 * rilis tetap 30 menit. Golongan lain: 30 menit sebelum.
 */
export function newsMinutesBefore(symbol: string): number {
  return timeStopApplies(symbol) ? TIME_STOP_HOURS * 60 : NEWS_WINDOW_MINUTES;
}

function windowText(before: number, after: number): string {
  if (before === after) return `jeda ±${after} menit`;
  const b = before % 60 === 0 ? `${before / 60} jam` : `${before} menit`;
  return `jeda ${b} sebelum s/d ${after} menit sesudah`;
}

export interface NewsEventLike {
  readonly serverTime: string;
  readonly currency: string;
  readonly importance: string;
  readonly event: string;
}

export interface NewsHold {
  readonly event: NewsEventLike;
  /** Positif = berita belum rilis (menit lagi); negatif = sudah lewat. */
  readonly minutesTo: number;
  readonly reason: string;
}

const INDEX_CURRENCIES: Readonly<Record<string, readonly string[]>> = {
  US30: ["USD"], US100: ["USD"], US500: ["USD"],
  DE30: ["EUR"], UK100: ["GBP"], JP225: ["JPY"], HK50: ["HKD", "CNY"],
};

/** Mata uang berita yang menggerakkan simbol ini ([] = tidak dicek). */
export function newsCurrenciesOf(symbol: string): string[] {
  const s = baseRiskSymbol(symbol);
  switch (riskGroupOf(symbol).id) {
    case "FOREX":
    case "FOREX_JPY":
    case "FOREX_TIDAK_LAZIM": {
      const fix = (c: string) => (c === "GBX" ? "GBP" : c);
      return [...new Set([fix(s.slice(0, 3)), fix(s.slice(3, 6))])];
    }
    case "LOGAM":
    case "MINYAK":
    case "SAHAM_AS":
      return ["USD"];
    case "INDEKS":
      return [...(INDEX_CURRENCIES[s] ?? [])];
    default:
      return [];
  }
}

function hhmm(serverTime: string): string {
  return serverTime.trim().slice(11, 16);
}

/**
 * Berita Tinggi terdekat dalam jendela ±NEWS_WINDOW_MINUTES untuk mata
 * uang simbol, atau null. Jam tak terbaca → null (tidak menahan).
 */
export function findNewsHold(
  symbol: string,
  serverNow: string,
  events: readonly NewsEventLike[] | null | undefined,
  windowMinutes?: number,
): NewsHold | null {
  if (events === null || events === undefined || events.length === 0) return null;
  // windowMinutes eksplisit = jendela simetris; tanpa itu ikut golongan simbol.
  const after = windowMinutes ?? NEWS_WINDOW_MINUTES;
  const before = windowMinutes ?? newsMinutesBefore(symbol);
  const nowMs = parseSnapshotTime(serverNow);
  if (nowMs === null) return null;
  const currencies = new Set(newsCurrenciesOf(symbol));
  if (currencies.size === 0) return null;
  let best: NewsHold | null = null;
  for (const ev of events) {
    if (ev.importance.trim().toUpperCase() !== "HIGH") continue;
    if (!currencies.has(ev.currency.trim().toUpperCase())) continue;
    const evMs = parseSnapshotTime(ev.serverTime);
    if (evMs === null) continue;
    const minutesTo = (evMs - nowMs) / 60_000;
    if (minutesTo > before || minutesTo < -after) continue;
    if (best !== null && Math.abs(best.minutesTo) <= Math.abs(minutesTo)) continue;
    const m = Math.round(Math.abs(minutesTo));
    const when =
      minutesTo < 0
        ? `${m} menit lalu`
        : m >= 60
          ? `${Math.floor(m / 60)} jam ${m % 60} menit lagi`
          : `${m} menit lagi`;
    best = {
      event: ev,
      minutesTo,
      reason:
        `Ditahan: berita ${ev.currency.trim().toUpperCase()} (Tinggi) "${ev.event}" ` +
        `jam ${hhmm(ev.serverTime)} server (${when}; ${windowText(before, after)})`,
    };
  }
  return best;
}

/**
 * K5: tahan hasil analisa BELI/JUAL yang dekat berita Tinggi (sama seperti
 * tahanan jeda/korelasi: TUNGGU, SL/TP/lot kosong). Tanpa kalender = tetap.
 */
export function applyNewsHold<T extends AnalysisResult>(
  result: T,
  symbol: string,
  serverNow: string | null,
  events: readonly NewsEventLike[] | null,
): T {
  if (result.decision !== "BELI" && result.decision !== "JUAL") return result;
  const hold = findNewsHold(symbol, serverNow ?? "", events);
  if (hold === null) return result;
  return {
    ...result,
    decision: "TUNGGU",
    heldBy: "berita",
    heldDecision: result.decision,
    heldReason: hold.reason,
    stopLoss: null,
    takeProfit: null,
    suggestedLot: null,
    warnings: [`Mode Aman: ${hold.reason}. Setup ditahan.`, ...result.warnings],
    explanation:
      "Mode Aman: arah sudah kompak, tetapi ada berita ekonomi penting dalam 30 menit. Harga bisa melonjak tiba-tiba dan menyapu SL; tunggu sampai berita lewat.",
  };
}

export interface UpcomingNews {
  readonly event: NewsEventLike;
  /** Positif = menit lagi; negatif = sudah lewat (masih dalam jendela). */
  readonly minutesTo: number;
  /** Teks relatif, mis. "dalam 3 hari 14 jam", "20 menit lagi", "15 menit lalu". */
  readonly when: string;
}

function relative(minutesTo: number): string {
  const m = Math.round(Math.abs(minutesTo));
  if (minutesTo < 0) return `${m} menit lalu`;
  if (m < 60) return `${m} menit lagi`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `dalam ${d} hari ${h} jam` : `dalam ${h} jam ${m % 60} menit`;
}

/**
 * K6: berita Tinggi yang belum lewat jendela (≥ sekarang − jendela), urut
 * waktu, maks `limit`. Jam = jam server broker yang sama. MURNI.
 */
export function upcomingHighNews(
  events: readonly NewsEventLike[] | null | undefined,
  serverNow: string | null,
  limit = 8,
  windowMinutes: number = NEWS_WINDOW_MINUTES,
): UpcomingNews[] {
  if (events === null || events === undefined || serverNow === null) return [];
  const nowMs = parseSnapshotTime(serverNow);
  if (nowMs === null) return [];
  const out: UpcomingNews[] = [];
  for (const ev of events) {
    if (ev.importance.trim().toUpperCase() !== "HIGH") continue;
    const evMs = parseSnapshotTime(ev.serverTime);
    if (evMs === null) continue;
    const minutesTo = (evMs - nowMs) / 60_000;
    if (minutesTo < -windowMinutes) continue;
    out.push({ event: ev, minutesTo, when: relative(minutesTo) });
  }
  out.sort((a, b) => a.minutesTo - b.minutesTo);
  return out.slice(0, limit);
}
