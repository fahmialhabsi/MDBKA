/**
 * KC-3 Penambang Fakta — bahan P-1 "Petani Kebun" (docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md §4),
 * porting PERSIS petani() di scripts/research/strategi_versi_mdbka_bt.py (baris 136-185), angka
 * dibekukan & disetujui Fahmi 16 Okt 2026 09:44 WIT. MURNI.
 *
 * Analogi: tanam sesuai musim (D1 SMA20 naik/turun 5 hari), tanam saat tanah digemburkan (H1 pullback
 * ke MA50), rawat (SL ke impas setelah +1R), panen TP 3R atau musim berganti/maks 10 hari — tidak
 * terburu-buru (BEDA dari batas 3 jam strategi skor lama).
 */
import { candleTimeMs } from "./symbolScanner";
import { sma } from "../calculations/indicators";
import type { Candle } from "../calculations/swingDetector";
import {
  atrSimple14,
  attachYesterdayDaily,
  buildDaily,
  buildLastOfDayFlags,
  lolosGerbangBiaya,
  mfeROf,
  ringkasTambang,
  rMultipleOf,
  simulateTrailing,
  type DailyBar,
  type HasilTambangBahan,
  type MinedTrade,
} from "./kc3BahanShared";
import type { PolaCalon } from "./branchArchitecture";

export const PETANI_SL_ATR = 1.5;
export const PETANI_TARGET_RR = 3.0;
export const PETANI_MAX_HARI = 10;
export const PETANI_MA_PERIODE = 50;

export const PETANI_POLA_ID = "KC3-PETANI-1";

const SEPULUH_HARI_MS = PETANI_MAX_HARI * 24 * 3_600_000;

/** MA50 H1 (SMA close, TERMASUK candle itu sendiri — candle sudah tutup saat dievaluasi). */
function buildMa50(candles: readonly Candle[]): (number | null)[] {
  const closes = candles.map((c) => c.close);
  return candles.map((_, i) => sma(closes.slice(Math.max(0, i - PETANI_MA_PERIODE + 1), i + 1), PETANI_MA_PERIODE));
}

/** Musim D1 milik candle H1 di indeks `idx` (dari D1 KEMARIN yang menempel candle itu). */
function musimOf(kemarin: readonly (DailyBar | null)[], idx: number): "BELI" | "JUAL" | "" {
  const d1 = kemarin[idx];
  if (d1 === null || d1 === undefined || d1.sma20 === null || d1.sma20Lag5 === null) return "";
  if (d1.close > d1.sma20 && d1.sma20 > d1.sma20Lag5) return "BELI";
  if (d1.close < d1.sma20 && d1.sma20 < d1.sma20Lag5) return "JUAL";
  return "";
}

/** Tambang P-1 satu simbol — satu posisi per waktu; berhenti (bukan lanjut) bila ada posisi belum selesai saat data habis. */
export function tambangPetaniSimbol(
  simbol: string,
  candles: readonly Candle[],
  spread: number,
  pointValueUsd: number,
  komisiUsdPerLot: number,
): MinedTrade[] {
  if (!(pointValueUsd > 0)) return [];
  const komisiHarga = komisiUsdPerLot / pointValueUsd;
  const daily = buildDaily(candles);
  const kemarin = attachYesterdayDaily(candles, daily);
  const lastOfDay = buildLastOfDayFlags(candles);
  const ma50 = buildMa50(candles);
  const out: MinedTrade[] = [];
  const n = candles.length;
  let i = 1;
  while (i < n - 1) {
    const j = i + 1;
    const maI = ma50[i];
    const maJ = ma50[j];
    const atrJ = atrSimple14(candles, j);
    if (maI === null || maJ === null || atrJ === null) {
      i += 1;
      continue;
    }
    const ci = candles[i] as Candle;
    const cj = candles[j] as Candle;
    const musim = musimOf(kemarin, j);
    const beli = musim === "BELI" && ci.open > maI && ci.low <= maI && cj.close > maJ;
    const jual = musim === "JUAL" && ci.open < maI && ci.high >= maI && cj.close < maJ;
    if (!beli && !jual) {
      i += 1;
      continue;
    }
    const direction: "BELI" | "JUAL" = beli ? "BELI" : "JUAL";
    const entry = beli ? cj.close + spread : cj.close;
    const sl = beli ? ci.low - PETANI_SL_ATR * atrJ : ci.high + PETANI_SL_ATR * atrJ + spread;
    const risk = Math.abs(entry - sl);
    if (risk <= 0 || !lolosGerbangBiaya(spread, komisiHarga, risk)) {
      i += 1;
      continue;
    }
    const tp = beli ? entry + PETANI_TARGET_RR * risk : entry - PETANI_TARGET_RR * risk;
    const t0Ms = candleTimeMs(cj.time);
    if (t0Ms === null) {
      i += 1;
      continue;
    }
    const d1Exit = (k: number): boolean => {
      const tk = candleTimeMs((candles[k] as Candle).time);
      if (tk === null) return false;
      if (tk - t0Ms >= SEPULUH_HARI_MS) return true;
      if (!(lastOfDay[k] ?? false)) return false;
      const nxt = k + 1;
      if (nxt >= n) return false;
      const d1nxt = kemarin[nxt];
      if (d1nxt === null || d1nxt === undefined || d1nxt.sma20 === null) return false;
      return beli ? d1nxt.close < d1nxt.sma20 : d1nxt.close > d1nxt.sma20;
    };
    const sim = simulateTrailing(candles, j, direction, entry, sl, tp, spread, { firstCandleIsEntry: false, beAt1R: true, maxBars: null, d1Exit });
    if (sim === null) break; // posisi belum selesai saat data habis -> berhenti pindai simbol ini (selaras Python)
    let outcome = sim.outcome;
    if (outcome === "MUSIM") {
      const tk = candleTimeMs((candles[sim.exitIndex] as Candle).time);
      if (tk !== null && tk - t0Ms >= SEPULUH_HARI_MS) outcome = "10HARI";
    }
    out.push({
      simbol,
      signalTime: cj.time,
      direction,
      outcome,
      rMultiple: rMultipleOf(direction, entry, sim.exitPrice, risk, komisiHarga),
      mfeR: mfeROf(candles, j, sim.exitIndex, direction, entry, risk),
    });
    i = sim.exitIndex + 1;
  }
  return out;
}

export function tambangPetani(
  bySimbol: ReadonlyMap<string, Candle[]>,
  spread: ReadonlyMap<string, number>,
  pointValueUsd: ReadonlyMap<string, number>,
  komisiUsdPerLot: ReadonlyMap<string, number>,
): HasilTambangBahan {
  const trades: MinedTrade[] = [];
  for (const [simbol, candles] of bySimbol) {
    const sp = spread.get(simbol);
    const pv = pointValueUsd.get(simbol);
    const kom = komisiUsdPerLot.get(simbol);
    if (sp === undefined || pv === undefined || kom === undefined) continue;
    trades.push(...tambangPetaniSimbol(simbol, candles, sp, pv, kom));
  }
  return ringkasTambang(trades);
}

export function polaPetani(hasil: HasilTambangBahan): PolaCalon {
  return {
    id: PETANI_POLA_ID,
    kondisi: "Petani Kebun (P-1): musim D1 (SMA20 naik/turun 5 hari) + pullback H1 ke MA50; SL 1,5×ATR, rawat ke impas di +1R, TP 3R atau musim berganti/maks 10 hari.",
    bahan: ["Musim D1 (SMA20 harian)", "MA50 H1", "ATR H1 (rata-rata sederhana 14 candle)"],
    angkaBeku: { slAtr: PETANI_SL_ATR, targetRR: PETANI_TARGET_RR, maksHari: PETANI_MAX_HARI, maPeriode: PETANI_MA_PERIODE },
    latih: { n: hasil.n, rataR: hasil.rataR },
    tryout: { n: 0, rataR: null },
  };
}
