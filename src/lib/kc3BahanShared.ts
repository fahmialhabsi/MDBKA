/**
 * KC-3 Penambang Fakta — infrastruktur BERSAMA untuk bahan M-1 Mancing, P-1 Petani
 * Kebun, F-1 Pencari Fakta (docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md §3-5),
 * dipilih Fahmi 16 Okt 2026 menggantikan/mendampingi "Badai" (bahan pertama,
 * kc3Penambang.ts). Rumus & angka di sini PORTING PERSIS dari riset yang sudah
 * dibekukan & disetujui Fahmi 16 Okt 2026 09:44 WIT
 * (scripts/research/strategi_versi_mdbka_bt.py) — bukan tebakan baru. MURNI.
 */
import { sma } from "../calculations/indicators";
import type { Candle } from "../calculations/swingDetector";

// ---------- Trade & hasil tambang generik (dipakai semua bahan, termasuk Badai) ----------

export type MinedOutcome = "TP" | "SL" | "IMPAS" | "WAKTU" | "MUSIM" | "10HARI";

export interface MinedTrade {
  readonly simbol: string;
  readonly signalTime: string;
  readonly direction: "BELI" | "JUAL";
  readonly outcome: MinedOutcome;
  readonly rMultiple: number;
  /** MFE (titik untung tertinggi selama posisi berjalan, kelipatan R) — dipakai Auditor Trade KC-4. */
  readonly mfeR: number;
}

export interface HasilTambangBahan {
  readonly n: number;
  readonly menang: number;
  readonly rataR: number | null;
  readonly trades: readonly MinedTrade[];
}

export function ringkasTambang(trades: readonly MinedTrade[]): HasilTambangBahan {
  const n = trades.length;
  const menang = trades.filter((t) => t.outcome === "TP").length;
  const rataR = n === 0 ? null : Math.round((trades.reduce((s, t) => s + t.rMultiple, 0) / n) * 100) / 100;
  return { n, menang, rataR, trades };
}

/** R-multiple porting r_of() Python: P&L searah posisi / risiko AWAL, dikurangi komisi (satuan harga)/risiko. */
export function rMultipleOf(direction: "BELI" | "JUAL", entry: number, exitPrice: number, risk: number, commissionInPrice: number): number {
  const priceResult = direction === "BELI" ? exitPrice - entry : entry - exitPrice;
  return Math.round((priceResult / risk - commissionInPrice / risk) * 100) / 100;
}

/** MFE (R) selama posisi berjalan candle fromIdx..toIdx (inklusif) — pola sama dengan Badai (kc3Penambang.ts). */
export function mfeROf(candles: readonly Candle[], fromIdx: number, toIdx: number, direction: "BELI" | "JUAL", entry: number, risk: number): number {
  const window = candles.slice(Math.max(0, fromIdx), toIdx + 1);
  const terbaik =
    direction === "BELI"
      ? Math.max(entry, ...window.map((c) => c.high))
      : Math.min(entry, ...window.map((c) => c.low));
  const mfe = direction === "BELI" ? terbaik - entry : entry - terbaik;
  return Math.round((mfe / risk) * 100) / 100;
}

// ---------- Gerbang biaya 10% (reuse rumus MAX_COST_SHARE_OF_RISK, decisionEngine.ts) ----------

/** = MAX_COST_SHARE_OF_RISK (src/calculations/decisionEngine.ts) — dipakai apa adanya, bukan angka baru. */
export const MAX_BIAYA_DARI_RISIKO = 0.1;

/** Lolos gerbang biaya? sp+komisi(satuan harga) <= 10% risiko. risk<=0 -> tidak lolos (gerbang + sah). */
export function lolosGerbangBiaya(spread: number, commissionInPrice: number, risk: number): boolean {
  return risk > 0 && spread + commissionInPrice <= MAX_BIAYA_DARI_RISIKO * risk;
}

// ---------- ATR sederhana (rata-rata True Range 14 candle TUTUP, anti-lookahead) ----------
// BEDA SENGAJA dari atrWilder() (Wilder smoothing, calculations/indicators.ts): riset M-1/P-1
// membekukan "ATR H1 = rata-rata sederhana True Range 14 candle yang sudah tutup" (komentar
// baris 11 & 32 strategi_versi_mdbka_bt.py). F-1 TIDAK pakai ini — F-1 reuse ATR Wilder apa
// adanya lewat scoreSetup()/computeIndicators() (bagian dari strategi skor yang sudah ada).

function trueRange(now: Candle, prevClose: number): number {
  return Math.max(now.high - now.low, Math.abs(now.high - prevClose), Math.abs(now.low - prevClose));
}

/** ATR sederhana PADA candle ke-`at` = rata-rata TR 14 candle TUTUP sebelum `at` ([at-14, at-1]). null bila data kurang. */
export function atrSimple14(candles: readonly Candle[], at: number, period = 14): number | null {
  const akhir = at - 1;
  const awal = at - period;
  if (awal < 1) return null; // TR butuh prevClose; TR index 0 selalu tidak sah
  let total = 0;
  for (let i = awal; i <= akhir; i += 1) {
    const now = candles[i];
    const prev = candles[i - 1];
    if (now === undefined || prev === undefined) return null;
    total += trueRange(now, prev.close);
  }
  return total / period;
}

// ---------- Agregasi D1 dari H1 (tanggal kalender jam server, selaras candleTimeMs()) ----------

export interface DailyBar {
  readonly dayKey: string; // "YYYY-MM-DD" jam server
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly sma20: number | null;
  /** sma20 milik hari (indeks harian) - 5, BUKAN mundur 5 hari kalender (selaras pandas .shift(5)). */
  readonly sma20Lag5: number | null;
}

/** "2026.01.15 10:00" / "2026-01-15 10:00" -> "2026-01-15" (tanggal jam server apa adanya, tanpa konversi zona). */
export function dayKeyOf(time: string): string | null {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})/.exec(time.trim());
  return m === null ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Bar harian dari candle H1 (urut waktu naik) — satu bar per tanggal kalender jam server. */
export function buildDaily(candlesH1: readonly Candle[]): DailyBar[] {
  const perHari: { dayKey: string; high: number; low: number; close: number }[] = [];
  for (const c of candlesH1) {
    const dayKey = dayKeyOf(c.time);
    if (dayKey === null) continue;
    const last = perHari[perHari.length - 1];
    if (last !== undefined && last.dayKey === dayKey) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close; // candle terakhir hari itu (data urut waktu naik)
    } else {
      perHari.push({ dayKey, high: c.high, low: c.low, close: c.close });
    }
  }
  const closes = perHari.map((d) => d.close);
  return perHari.map((d, i) => ({
    ...d,
    sma20: sma(closes.slice(0, i + 1), 20),
    sma20Lag5: i - 5 >= 0 ? sma(closes.slice(0, i - 5 + 1), 20) : null,
  }));
}

/** last_of_day Python: true bila candle ini candle TERAKHIR pada tanggalnya (atau candle terakhir array). */
export function buildLastOfDayFlags(candlesH1: readonly Candle[]): readonly boolean[] {
  return candlesH1.map((c, i) => {
    const next = candlesH1[i + 1];
    return next === undefined || dayKeyOf(c.time) !== dayKeyOf(next.time);
  });
}

/** DailyBar KEMARIN (hari - 1, sudah tutup) untuk tiap candle H1 — null bila hari pertama/tak dikenal. */
export function attachYesterdayDaily(candlesH1: readonly Candle[], daily: readonly DailyBar[]): readonly (DailyBar | null)[] {
  const dayIndex = new Map<string, number>();
  daily.forEach((d, i) => dayIndex.set(d.dayKey, i));
  return candlesH1.map((c) => {
    const dayKey = dayKeyOf(c.time);
    if (dayKey === null) return null;
    const idx = dayIndex.get(dayKey);
    return idx === undefined || idx === 0 ? null : (daily[idx - 1] ?? null);
  });
}

// ---------- Jam UTC sebenarnya dari waktu candle (jam SERVER) — HANYA untuk sesi M-1 ----------

/**
 * Porting PERSIS strategi_versi_mdbka_bt.py baris 41-42: server dianggap NY+7 jam tetap
 * (tutup harian NY 17:00 = 00:00 server), angka jam server-7 lalu dibaca sebagai jam
 * dinding America/New_York (sadar DST: EST/EDT), dikonversi ke UTC. Dipakai HANYA untuk
 * filter sesi M-1 (07-20 UTC) — bagian lain modul KC-3 tetap pakai jam server apa adanya
 * (selaras candleTimeMs(), symbolScanner.ts), jadi JANGAN dipakai di luar M-1.
 */
export function utcHourOfServerTime(serverTime: string): number | null {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})/.exec(serverTime.trim());
  if (m === null) return null;
  const nyWallAsUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 7, Number(m[5]));
  const utcMs = nyWallClockToUtcMs(nyWallAsUtc);
  return utcMs === null ? null : new Date(utcMs).getUTCHours();
}

// Dibuat SEKALI (bukan per panggilan): tambang M-1 memanggil utcHourOfServerTime() untuk tiap candle
// (puluhan ribu per simbol x puluhan simbol) — membuat Intl.DateTimeFormat baru tiap panggilan
// terbukti jadi titik lambat nyata (KC-3 sempat menggantung beberapa menit sebelum fix ini, audit A-3).
const NY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23",
});

/** "Angka y/m/d/h/mi ini SEHARUSNYA dibaca sebagai jam dinding America/New_York" -> ms UTC sebenarnya (sadar DST). */
function nyWallClockToUtcMs(wallAsUtcMs: number): number | null {
  if (!Number.isFinite(wallAsUtcMs)) return null;
  try {
    let guess = wallAsUtcMs;
    for (let i = 0; i < 2; i += 1) {
      const parts = NY_FORMATTER.formatToParts(new Date(guess));
      const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? NaN);
      const actualAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
      if (!Number.isFinite(actualAsUtc)) return null;
      const diff = wallAsUtcMs - actualAsUtc;
      guess += diff;
      if (diff === 0) break;
    }
    return guess;
  } catch {
    return null;
  }
}

// ---------- Simulator posisi dengan trailing-ke-impas + exit kondisional + batas BAR ----------

export interface SimulateTrailingResult {
  readonly outcome: MinedOutcome;
  readonly exitIndex: number;
  readonly exitPrice: number;
}

export interface SimulateTrailingOpts {
  /** true (M-1): candle startIndex ikut dicek (SL saja, umpan baru disentuh candle itu).
   *  false (P-1/F-1): mulai dicek dari startIndex+1 (masuk di close candle startIndex). */
  readonly firstCandleIsEntry: boolean;
  /** true (P-1): begitu untung >= 1R, SL digeser ke titik masuk (impas). */
  readonly beAt1R: boolean;
  /** Batas BAR (bukan jam) sejak masuk; null = tanpa batas bar. */
  readonly maxBars: number | null;
  /** Exit kondisional (mis. musim D1 berganti / 10 hari) -> outcome "MUSIM". */
  readonly d1Exit?: (index: number) => boolean;
}

/**
 * Porting PERSIS simulate() strategi_versi_mdbka_bt.py (baris 58-88). simulateTrade()
 * (backtest.ts) TIDAK punya trailing/exit-kondisional/batas-bar — dipakai Badai saja.
 * SL & TP tersentuh candle sama -> SL (konservatif, sama seperti simulateTrade()).
 * null = TERBUKA (data habis sebelum keluar) — pemanggil memutuskan lanjut/berhenti scan.
 */
export function simulateTrailing(
  candles: readonly Candle[],
  startIndex: number,
  direction: "BELI" | "JUAL",
  entry: number,
  stopLossAwal: number,
  takeProfit: number,
  spread: number,
  opts: SimulateTrailingOpts,
): SimulateTrailingResult | null {
  const risk = Math.abs(entry - stopLossAwal);
  const beli = direction === "BELI";
  let curSl = stopLossAwal;
  let held = 0;
  const start = opts.firstCandleIsEntry ? startIndex : startIndex + 1;
  for (let k = start; k < candles.length; k += 1) {
    const c = candles[k];
    if (c === undefined) break;
    const first = k === startIndex;
    if (!first) held += 1;
    if (beli) {
      if (c.low <= curSl) {
        const exitPrice = first ? curSl : Math.min(curSl, c.open);
        return { outcome: curSl !== entry ? "SL" : "IMPAS", exitIndex: k, exitPrice };
      }
      if (!first && c.high >= takeProfit) {
        return { outcome: "TP", exitIndex: k, exitPrice: c.open > takeProfit ? c.open : takeProfit };
      }
      if (opts.beAt1R && !first && c.high >= entry + risk) curSl = Math.max(curSl, entry);
    } else {
      if (c.high + spread >= curSl) {
        const exitPrice = first ? curSl : Math.max(curSl, c.open + spread);
        return { outcome: curSl !== entry ? "SL" : "IMPAS", exitIndex: k, exitPrice };
      }
      if (!first && c.low + spread <= takeProfit) {
        return { outcome: "TP", exitIndex: k, exitPrice: c.open + spread < takeProfit ? c.open + spread : takeProfit };
      }
      if (opts.beAt1R && !first && c.low + spread <= entry - risk) curSl = Math.min(curSl, entry);
    }
    if (opts.d1Exit !== undefined && !first && opts.d1Exit(k)) {
      return { outcome: "MUSIM", exitIndex: k, exitPrice: beli ? c.close : c.close + spread };
    }
    if (opts.maxBars !== null && held >= opts.maxBars) {
      return { outcome: "WAKTU", exitIndex: k, exitPrice: beli ? c.close : c.close + spread };
    }
  }
  return null;
}
