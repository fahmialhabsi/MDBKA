/**
 * KC-3 Penambang Fakta (menyusul, 16 Okt 2026) — bahan pertama: Peringatan Badai (CU-1, stormWarning.ts)
 * dipakai sebagai PEMICU ARAH, diputuskan Fahmi 16 Okt 2026:
 *  - Arah = momentum 1 jam terakhir (candle sekarang vs candle STORM_WINDOW lalu — jendela SAMA
 *    dengan stormWarning): close naik → BELI, close turun → JUAL.
 *  - SL = BADAI_SL_ATR × ATR(14), TP = BADAI_TARGET_RR × jarak SL. Angka 1,2 dan 1,5 ini SAMA
 *    dengan STRATEGY_DEFAULTS.atrMultiplier/targetRR yang sudah dipakai strategi "skor" hidup
 *    (lihat src/lib/marketReset.ts ~baris 408) — bukan angka baru karangan Penambang Fakta.
 *  - Eksekusi memakai simulateTrade() (src/lib/backtest.ts, B2, sudah teruji) — bukan mesin baru;
 *    satu posisi per simbol pada satu waktu (sinyal baru dicari lagi setelah posisi tutup), sama
 *    seperti disiplin backtest.ts.
 * MURNI. HANYA dipanggil dengan candle bagian LATIH (segel ujian dijaga oleh pemanggil — lihat
 * bolehBaca()/bagianOf() di branchArchitecture.ts); modul ini tidak tahu dan tidak perlu tahu batas
 * waktu, hanya menambang candle yang diberikan.
 */
import { atrWilder } from "../calculations/indicators";
import type { Candle } from "../calculations/swingDetector";
import type { PolaCalon } from "./branchArchitecture";
import { simulateTrade, type BacktestOutcome, type BacktestPlan } from "./backtest";
import { STORM_K, STORM_WINDOW, stormWarning } from "./stormWarning";

export const BADAI_ATR_PERIOD = 14;
/** = STRATEGY_DEFAULTS.atrMultiplier (src/lib/marketReset.ts), dipakai apa adanya. */
export const BADAI_SL_ATR = 1.2;
/** = STRATEGY_DEFAULTS.targetRR (src/lib/marketReset.ts), dipakai apa adanya. */
export const BADAI_TARGET_RR = 1.5;
/** Candle trailing untuk ATR(14) saat sinyal (cukup untuk pemanasan Wilder). */
export const BADAI_ATR_WINDOW = 60;
/** Minimal trade sebelum dianggap cukup untuk dicatat sebagai Pola Calon (selaras FINGERPRINT_MIN_CARDS). */
export const BADAI_MIN_TRADE = 20;

export const BADAI_POLA_ID = "KC3-BADAI-ARAH-1";

export interface BadaiTrade {
  readonly simbol: string;
  readonly signalTime: string;
  readonly direction: "BELI" | "JUAL";
  readonly outcome: Exclude<BacktestOutcome, "TERBUKA">;
  readonly rMultiple: number;
  /** MFE (titik untung tertinggi selama posisi berjalan, kelipatan R) — dipakai Auditor Trade KC-4. */
  readonly mfeR: number;
}

interface Percobaan extends BadaiTrade {
  readonly exitIndex: number;
}

/** Satu percobaan BADAI→trade di candle sinyal `at`; null = bukan BADAI / ATR belum cukup / tanpa data masa depan / masih TERBUKA saat data habis. */
function satuPercobaan(simbol: string, candles: readonly Candle[], at: number): Percobaan | null {
  if (at < STORM_WINDOW) return null;
  const warn = stormWarning(candles.slice(0, at + 1));
  if (warn.status !== "BADAI") return null;
  const now = candles[at] as Candle;
  const past = candles[at - STORM_WINDOW] as Candle;
  const direction: "BELI" | "JUAL" = now.close >= past.close ? "BELI" : "JUAL";
  const atr = atrWilder(candles.slice(Math.max(0, at - BADAI_ATR_WINDOW + 1), at + 1), BADAI_ATR_PERIOD);
  if (atr === null || !(atr > 0)) return null;
  const risk = atr * BADAI_SL_ATR;
  const entry = now.close;
  const plan: BacktestPlan =
    direction === "BELI"
      ? { direction, entry, stopLoss: entry - risk, takeProfit: entry + risk * BADAI_TARGET_RR }
      : { direction, entry, stopLoss: entry + risk, takeProfit: entry - risk * BADAI_TARGET_RR };
  const future = candles.slice(at + 1);
  const exit = simulateTrade(plan, future, 0, null, null);
  if (exit === null || exit.outcome === "TERBUKA") return null;
  const priceResult = direction === "BELI" ? exit.exitPrice - entry : entry - exit.exitPrice;
  // MFE: titik untung tertinggi (candle high/low, bukan hanya harga keluar) selama posisi berjalan.
  const selamaPosisi = future.slice(0, exit.exitIndex + 1);
  const terbaik =
    direction === "BELI"
      ? Math.max(entry, ...selamaPosisi.map((c) => c.high))
      : Math.min(entry, ...selamaPosisi.map((c) => c.low));
  const mfe = direction === "BELI" ? terbaik - entry : entry - terbaik;
  return {
    simbol,
    signalTime: String(now.time ?? ""),
    direction,
    outcome: exit.outcome,
    rMultiple: Math.round((priceResult / risk) * 100) / 100,
    mfeR: Math.round((mfe / risk) * 100) / 100,
    exitIndex: exit.exitIndex,
  };
}

/** Tambang BADAI→trade satu simbol: satu posisi per waktu (sinyal baru dicari lagi setelah posisi tutup). */
export function tambangBadaiSimbol(simbol: string, candles: readonly Candle[]): readonly BadaiTrade[] {
  const out: Percobaan[] = [];
  let i = STORM_WINDOW;
  while (i < candles.length - 1) {
    const p = satuPercobaan(simbol, candles, i);
    if (p === null) {
      i += 1;
      continue;
    }
    out.push(p);
    i = i + 1 + p.exitIndex + 1;
  }
  return out.map(({ exitIndex: _exitIndex, ...t }) => t);
}

export interface HasilPenambangBadai {
  readonly n: number;
  readonly menang: number;
  readonly rataR: number | null;
  readonly trades: readonly BadaiTrade[];
}

/** Tambang BADAI→trade di beberapa simbol sekaligus (satu Map per simbol, candle M15 bagian LATIH). */
export function tambangBadai(bySimbol: ReadonlyMap<string, readonly Candle[]>): HasilPenambangBadai {
  const trades: BadaiTrade[] = [];
  for (const [simbol, candles] of bySimbol) trades.push(...tambangBadaiSimbol(simbol, candles));
  const n = trades.length;
  const menang = trades.filter((t) => t.outcome === "TP").length;
  const rataR = n === 0 ? null : Math.round((trades.reduce((s, t) => s + t.rMultiple, 0) / n) * 100) / 100;
  return { n, menang, rataR, trades };
}

/** Bungkus hasil tambang BADAI jadi satu entri POLA_CALON (try-out masih kosong — Pengawas Try-out belum dibangun). */
export function polaBadai(hasil: HasilPenambangBadai): PolaCalon {
  return {
    id: BADAI_POLA_ID,
    kondisi: "Peringatan Badai (gerak 1 jam M15 > 2x median 96 jendela) jadi pemicu arah: BELI/JUAL ikut momentum 1 jam terakhir.",
    bahan: ["Peringatan Badai (candle M15, stormWarning.ts)"],
    angkaBeku: { stormK: STORM_K, atrPeriode: BADAI_ATR_PERIOD, slAtr: BADAI_SL_ATR, targetRR: BADAI_TARGET_RR },
    latih: { n: hasil.n, rataR: hasil.rataR },
    tryout: { n: 0, rataR: null },
  };
}
