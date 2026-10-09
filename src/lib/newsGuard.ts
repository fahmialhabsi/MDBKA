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

/** Menit sebelum & sesudah jam rilis berita Tinggi (penetapan 9 Okt). */
export const NEWS_WINDOW_MINUTES = 30;

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
  windowMinutes: number = NEWS_WINDOW_MINUTES,
): NewsHold | null {
  if (events === null || events === undefined || events.length === 0) return null;
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
    if (Math.abs(minutesTo) > windowMinutes) continue;
    if (best !== null && Math.abs(best.minutesTo) <= Math.abs(minutesTo)) continue;
    const m = Math.round(Math.abs(minutesTo));
    const when = minutesTo >= 0 ? `${m} menit lagi` : `${m} menit lalu`;
    best = {
      event: ev,
      minutesTo,
      reason:
        `Ditahan: berita ${ev.currency.trim().toUpperCase()} (Tinggi) "${ev.event}" ` +
        `jam ${hhmm(ev.serverTime)} server (${when}; jeda ±${windowMinutes} menit)`,
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
