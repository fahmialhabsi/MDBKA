/**
 * Langkah D (8 Okt 2026) — blokir "taruhan ganda".
 *
 * Tiap simbol + arah diterjemahkan jadi eksposur, mis. BELI AUDUSD =
 * {AUD: naik, USD: turun}. Sinyal baru DITAHAN bila punya eksposur yang
 * SEARAH dengan posisi terbuka (mis. BELI AUDJPY saat AUDUSD BUY terbuka
 * → sama-sama AUD naik). Eksposur berlawanan (lindung nilai) tidak diblok.
 * - Forex: mata uang base & quote.
 * - Emas/perak (XAU/XAG): berdiri sendiri (tanpa USD) — pilihan sederhana.
 * - Indeks AS (US30/US100/US500) & saham AS: satu kelompok "Saham AS".
 * - Minyak (XTIUSD, CLU): kelompok "Minyak". Lainnya: simbolnya sendiri.
 * Hanya tampilan; MDBKA tidak pernah menempatkan/menutup order. Murni.
 */
import type { AnalysisResult } from "../types/analysis";

export type Direction = "BELI" | "JUAL";

export interface OpenPositionLike {
  readonly symbol: string;
  /** Sisi MT5 (BUY/SELL) atau arah MDBKA (BELI/JUAL). */
  readonly side: string;
}

/** key → +1 (naik) / −1 (turun). */
export type Exposure = Readonly<Record<string, 1 | -1>>;

export interface DoubleBet {
  readonly symbol: string;
  readonly direction: Direction;
  readonly key: string;
  readonly sign: 1 | -1;
  readonly reason: string;
}

const CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "HKD",
]);
const METALS = new Set(["XAU", "XAG"]);
const US_INDICES = new Set(["US30", "US100", "US500"]);
const OIL = new Set(["XTIUSD", "XBRUSD", "CLU", "USOIL", "UKOIL"]);
/** Saham Finex (#) yang BUKAN saham AS (HK, Jerman, Inggris). */
const NON_US_STOCKS = new Set([
  "168", "388", "700", "763", "ADS", "ALV", "BMW", "SAP", "VOW",
  "BP", "GSK", "HSBA", "VOD",
]);

export const US_EQUITY_KEY = "Saham AS";
export const OIL_KEY = "Minyak";

export function normalizeDirection(side: string): Direction | null {
  const s = side.trim().toUpperCase();
  if (s === "BUY" || s === "BELI") return "BELI";
  if (s === "SELL" || s === "JUAL") return "JUAL";
  return null;
}

/** Kunci eksposur (tanpa arah) satu simbol. */
export function exposureKeys(symbol: string): Array<{ key: string; sign: 1 | -1 }> {
  const raw = symbol.trim().toUpperCase();
  if (raw === "") return [];
  if (raw.endsWith(".US")) return [{ key: US_EQUITY_KEY, sign: 1 }];
  if (raw.startsWith("#")) {
    const name = raw.slice(1);
    return [{ key: NON_US_STOCKS.has(name) ? raw : US_EQUITY_KEY, sign: 1 }];
  }
  const clean = raw.replace(/_ORB$/, "").replace(/\.DEC$/, "");
  if (US_INDICES.has(clean)) return [{ key: US_EQUITY_KEY, sign: 1 }];
  if (OIL.has(clean)) return [{ key: OIL_KEY, sign: 1 }];
  if (/^[A-Z]{6}$/.test(clean)) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3);
    if (METALS.has(base)) return [{ key: base, sign: 1 }];
    if (CURRENCIES.has(base) && CURRENCIES.has(quote)) {
      return [{ key: base, sign: 1 }, { key: quote, sign: -1 }];
    }
  }
  return [{ key: clean, sign: 1 }];
}

export function exposureOf(symbol: string, direction: Direction): Exposure {
  const flip = direction === "BELI" ? 1 : -1;
  const out: Record<string, 1 | -1> = {};
  for (const { key, sign } of exposureKeys(symbol)) out[key] = (sign * flip) as 1 | -1;
  return out;
}

const KEY_LABEL: Record<string, string> = { XAU: "Emas", XAG: "Perak" };

/** Posisi terbuka pertama yang searah dengan sinyal baru, atau null. */
export function findDoubleBet(
  symbol: string,
  direction: Direction,
  positions: readonly OpenPositionLike[],
): DoubleBet | null {
  const mine = exposureOf(symbol, direction);
  for (const p of positions) {
    const dir = normalizeDirection(p.side);
    if (dir === null) continue;
    const theirs = exposureOf(p.symbol, dir);
    for (const [key, sign] of Object.entries(mine)) {
      if (theirs[key] !== sign) continue;
      const label = KEY_LABEL[key] ?? key;
      return {
        symbol: p.symbol,
        direction: dir,
        key,
        sign,
        reason: `Ditahan: taruhan ganda dengan ${p.symbol} ${dir} (sama-sama ${label} ${sign > 0 ? "naik" : "turun"})`,
      };
    }
  }
  return null;
}

/**
 * Langkah 1c: tahan hasil analisa BELI/JUAL yang searah posisi terbuka.
 * Sama seperti tahanan biaya/risiko: keputusan TUNGGU, SL/TP/lot kosong.
 */
export function applyDoubleBetHold<T extends AnalysisResult>(
  result: T,
  symbol: string,
  positions: readonly OpenPositionLike[],
): T {
  if (result.decision !== "BELI" && result.decision !== "JUAL") return result;
  const dobel = findDoubleBet(symbol, result.decision, positions);
  if (dobel === null) return result;
  return {
    ...result,
    decision: "TUNGGU",
    heldBy: "korelasi",
    heldDecision: result.decision,
    heldReason: dobel.reason,
    stopLoss: null,
    takeProfit: null,
    suggestedLot: null,
    warnings: [`Mode Aman: ${dobel.reason}. Setup ditahan.`, ...result.warnings],
    explanation:
      "Mode Aman: arah sudah kompak, tetapi searah dengan posisi yang masih terbuka (taruhan ganda). Menjaga modal lebih penting daripada menggandakan risiko.",
  };
}
