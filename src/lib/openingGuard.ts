/**
 * O1 (10 Okt 2026) — Satpam pembukaan bursa untuk INDEKS & saham AS (MURNI).
 *
 * Latar: US100 Finex 9 Okt — candle saat bursa AS buka (22:30 WIT) bergerak
 * 225 poin (±4× biasa) dan menyapu SL posisi yang dibuka berjam-jam sebelumnya.
 * Jam sesi MT5 tidak mengenal pembukaan bursa asli (CFD indeks ±24 jam).
 * Penetapan Fahmi (10 Okt): sinyal baru DITAHAN dari 30 menit sebelum s/d
 * 60 menit sesudah pembukaan; posisi terbuka diberi peringatan 60 menit sebelum.
 * Jam buka dihitung di zona waktu bursa asal (Intl) → ikut musim panas/dingin
 * otomatis. Hari libur bursa tidak dikenali (tetap ditahan = aman).
 */
import type { AnalysisResult } from "../types/analysis";
import { baseRiskSymbol, riskGroupOf } from "./riskGroup";

export const OPENING_HOLD_BEFORE_MIN = 30;
export const OPENING_HOLD_AFTER_MIN = 60;
export const OPENING_WARN_BEFORE_MIN = 60;

interface Exchange {
  readonly name: string;
  readonly timeZone: string;
  /** Jam buka lokal bursa, menit sejak tengah malam. */
  readonly openMin: number;
}

const US: Exchange = { name: "bursa AS", timeZone: "America/New_York", openMin: 9 * 60 + 30 };
const EXCHANGES: Readonly<Record<string, Exchange>> = {
  US30: US,
  US100: US,
  US500: US,
  DE30: { name: "bursa Jerman", timeZone: "Europe/Berlin", openMin: 9 * 60 },
  UK100: { name: "bursa London", timeZone: "Europe/London", openMin: 8 * 60 },
  JP225: { name: "bursa Tokyo", timeZone: "Asia/Tokyo", openMin: 9 * 60 },
  HK50: { name: "bursa Hong Kong", timeZone: "Asia/Hong_Kong", openMin: 9 * 60 + 30 },
};

/** Bursa asal simbol (indeks / saham AS), atau null bila tidak diatur. */
export function exchangeFor(symbol: string): Exchange | null {
  const base = baseRiskSymbol(symbol);
  if (EXCHANGES[base] !== undefined) return EXCHANGES[base];
  return riskGroupOf(symbol).id === "SAHAM_AS" ? US : null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localClock(nowMs: number, timeZone: string): { day: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(nowMs));
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
    const day = WEEKDAYS.indexOf(get("weekday"));
    const minutes = Number(get("hour")) * 60 + Number(get("minute"));
    return day < 0 || !Number.isFinite(minutes) ? null : { day, minutes };
  } catch {
    return null;
  }
}

function witLabel(ms: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jayapura", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(ms)).replace(".", ":");
}

export interface OpeningState {
  readonly exchange: string;
  /** Menit relatif terhadap pembukaan hari ini (negatif = sebelum buka). */
  readonly minutesFromOpen: number;
  /** Jam buka dalam WIT, mis. "22:30". */
  readonly openWit: string;
}

/** Posisi jam sekarang terhadap pembukaan bursa HARI KERJA ini; null = tidak relevan. */
export function openingState(symbol: string, nowMs: number): OpeningState | null {
  const ex = exchangeFor(symbol);
  if (ex === null || !Number.isFinite(nowMs)) return null;
  const clock = localClock(nowMs, ex.timeZone);
  if (clock === null || clock.day === 0 || clock.day === 6) return null;
  const minutesFromOpen = clock.minutes - ex.openMin;
  const openMs = nowMs - minutesFromOpen * 60_000;
  return { exchange: ex.name, minutesFromOpen, openWit: witLabel(openMs) };
}

/** Sinyal baru ditahan −30 … +60 menit dari pembukaan. */
export function findOpeningHold(symbol: string, nowMs: number): { readonly reason: string } | null {
  const st = openingState(symbol, nowMs);
  if (st === null) return null;
  const m = st.minutesFromOpen;
  if (m < -OPENING_HOLD_BEFORE_MIN || m > OPENING_HOLD_AFTER_MIN) return null;
  return {
    reason:
      m < 0
        ? `Ditahan: ${st.exchange} buka ${st.openWit} WIT (${-m} menit lagi) — harga biasa melonjak saat pembukaan`
        : `Ditahan: ${st.exchange} baru buka ${st.openWit} WIT (${m} menit lalu) — tunggu sampai ${OPENING_HOLD_AFTER_MIN} menit setelah buka`,
  };
}

/** Peringatan untuk POSISI terbuka: ≤60 menit sebelum pembukaan. */
export function openingWarning(symbol: string, nowMs: number): string | null {
  const st = openingState(symbol, nowMs);
  if (st === null) return null;
  const m = st.minutesFromOpen;
  if (m < -OPENING_WARN_BEFORE_MIN || m >= 0) return null;
  return `Posisi ini akan melewati pembukaan ${st.exchange} ${st.openWit} WIT (${-m} menit lagi) — harga bisa melonjak; pertimbangkan tutup atau kecilkan risiko`;
}

/** O2b: Hasil analisa ikut ditahan dekat pembukaan bursa (heldBy "buka"). */
export function applyOpeningHold<T extends AnalysisResult>(result: T, symbol: string, nowMs: number | null): T {
  if (result.decision !== "BELI" && result.decision !== "JUAL") return result;
  if (nowMs === null) return result;
  const hold = findOpeningHold(symbol, nowMs);
  if (hold === null) return result;
  return {
    ...result,
    decision: "TUNGGU",
    heldBy: "buka",
    heldDecision: result.decision,
    heldReason: hold.reason,
    stopLoss: null,
    takeProfit: null,
    suggestedLot: null,
    warnings: [`Mode Aman: ${hold.reason}. Setup ditahan.`, ...result.warnings],
    explanation:
      "Mode Aman: arah sudah kompak, tetapi bursa asal simbol ini sedang/akan buka. Saat pembukaan harga sering melonjak dan menyapu SL; tunggu sampai 60 menit setelah buka.",
  };
}
