/**
 * KC-3 Penambang Fakta — bahan M-1 "Mancing" (docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md §3),
 * porting PERSIS mancing() di scripts/research/strategi_versi_mdbka_bt.py (baris 95-133), angka
 * dibekukan & disetujui Fahmi 16 Okt 2026 09:44 WIT. MURNI — tidak tahu harga live, tidak mengirim order.
 *
 * Analogi: pasang umpan di level kemarin (high untuk JUAL, low untuk BELI), tunggu disentuh, SL/TP
 * ketat (0,5/0,5 ATR = 1R), sabar maksimal 3 candle H1, umpan basi di luar sesi 07-20 UTC/cuaca badai.
 */
import type { Candle } from "../calculations/swingDetector";
import {
  atrSimple14,
  attachYesterdayDaily,
  buildDaily,
  dayKeyOf,
  lolosGerbangBiaya,
  mfeROf,
  ringkasTambang,
  rMultipleOf,
  simulateTrailing,
  utcHourOfServerTime,
  type HasilTambangBahan,
  type MinedTrade,
} from "./kc3BahanShared";
import type { PolaCalon } from "./branchArchitecture";

export const MANCING_ATR_WINDOW = 0.1;
export const MANCING_SL_ATR = 0.5;
export const MANCING_TARGET_RR = 1.0;
export const MANCING_MAX_BAR = 3;
export const MANCING_SESI_DARI_UTC = 7;
export const MANCING_SESI_SAMPAI_UTC = 20;
export const MANCING_TENANG_JENDELA = 96;
export const MANCING_TENANG_KALI = 2;

export const MANCING_POLA_ID = "KC3-MANCING-1";

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Cuaca "bukan badai" candle ke-i: rentang candle i-1 <= 2x median rentang 96 candle sebelum i-1. */
function cuacaTenang(candles: readonly Candle[], i: number): boolean {
  if (i < 1 + MANCING_TENANG_JENDELA) return false;
  const rngSebelum = (candles[i - 1] as Candle).high - (candles[i - 1] as Candle).low;
  const window = candles.slice(i - 1 - MANCING_TENANG_JENDELA, i - 1).map((c) => c.high - c.low);
  const med = median(window);
  return med !== null && rngSebelum <= MANCING_TENANG_KALI * med;
}

/** Tambang M-1 satu simbol — satu posisi per waktu (lompat ke exit sebelum mencari sinyal lagi). */
export function tambangMancingSimbol(
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
  const out: MinedTrade[] = [];
  let free = 0;
  const dipakai = new Set<string>();
  for (let i = 0; i < candles.length; i += 1) {
    if (i < free) continue;
    const d1 = kemarin[i];
    const atr = atrSimple14(candles, i);
    const jamUtc = utcHourOfServerTime((candles[i] as Candle).time);
    if (d1 === null || atr === null || atr <= 0 || jamUtc === null) continue;
    if (!(jamUtc >= MANCING_SESI_DARI_UTC && jamUtc < MANCING_SESI_SAMPAI_UTC)) continue;
    if (!cuacaTenang(candles, i)) continue;
    const c = candles[i] as Candle;
    const hariIni = dayKeyOf(c.time);
    for (const beli of [true, false]) {
      const kunci = `${hariIni ?? i}|${beli ? "BELI" : "JUAL"}`;
      if (dipakai.has(kunci)) continue;
      let entry: number;
      let sl: number;
      let risk: number;
      let tp: number;
      if (beli) {
        entry = d1.low + MANCING_ATR_WINDOW * atr;
        if (!(c.open + spread > entry && c.low + spread <= entry)) continue;
        sl = d1.low - MANCING_SL_ATR * atr;
        risk = entry - sl;
        tp = entry + risk * MANCING_TARGET_RR;
      } else {
        entry = d1.high - MANCING_ATR_WINDOW * atr;
        if (!(c.open < entry && c.high >= entry)) continue;
        sl = d1.high + MANCING_SL_ATR * atr;
        risk = sl - entry;
        tp = entry - risk * MANCING_TARGET_RR;
      }
      dipakai.add(kunci);
      if (!lolosGerbangBiaya(spread, komisiHarga, risk)) continue;
      const direction = beli ? "BELI" : "JUAL";
      const sim = simulateTrailing(candles, i, direction, entry, sl, tp, spread, {
        firstCandleIsEntry: true,
        beAt1R: false,
        maxBars: MANCING_MAX_BAR,
      });
      if (sim === null) continue;
      out.push({
        simbol,
        signalTime: c.time,
        direction,
        outcome: sim.outcome,
        rMultiple: rMultipleOf(direction, entry, sim.exitPrice, risk, komisiHarga),
        mfeR: mfeROf(candles, i, sim.exitIndex, direction, entry, risk),
      });
      free = sim.exitIndex + 1;
      break;
    }
  }
  return out;
}

export function tambangMancing(bySimbol: ReadonlyMap<string, Candle[]>, spread: ReadonlyMap<string, number>, pointValueUsd: ReadonlyMap<string, number>, komisiUsdPerLot: ReadonlyMap<string, number>): HasilTambangBahan {
  const trades: MinedTrade[] = [];
  for (const [simbol, candles] of bySimbol) {
    const sp = spread.get(simbol);
    const pv = pointValueUsd.get(simbol);
    const kom = komisiUsdPerLot.get(simbol);
    if (sp === undefined || pv === undefined || kom === undefined) continue;
    trades.push(...tambangMancingSimbol(simbol, candles, sp, pv, kom));
  }
  return ringkasTambang(trades);
}

export function polaMancing(hasil: HasilTambangBahan): PolaCalon {
  return {
    id: MANCING_POLA_ID,
    kondisi: "Mancing (M-1): umpan di level high/low kemarin ± 0,1×ATR, sesi 07-20 UTC, bukan badai; SL 0,5×ATR, TP 1R, sabar 3 candle H1.",
    bahan: ["Level harian kemarin (D1 high/low)", "ATR H1 (rata-rata sederhana 14 candle)"],
    angkaBeku: { umpanAtr: MANCING_ATR_WINDOW, slAtr: MANCING_SL_ATR, targetRR: MANCING_TARGET_RR, maxBar: MANCING_MAX_BAR, sesiDariUtc: MANCING_SESI_DARI_UTC, sesiSampaiUtc: MANCING_SESI_SAMPAI_UTC },
    latih: { n: hasil.n, rataR: hasil.rataR },
    tryout: { n: 0, rataR: null },
  };
}
