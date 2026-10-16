/**
 * KC-3 Penambang Fakta — bahan F-1 "Pencari Fakta" (docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md
 * §5), porting PERSIS fakta() di scripts/research/strategi_versi_mdbka_bt.py (baris 188-216), angka
 * dibekukan & disetujui Fahmi 16 Okt 2026 09:44 WIT. MURNI (fungsi tambang sendiri) — tapi "laporan
 * awal" diambil lewat runBacktest() (src/lib/backtest.ts), PIPA STRATEGI SKOR yang SUDAH ADA, SAMA
 * dengan live (bukan menulis ulang indikator/gerbang Mode Aman). decisionEngine.ts TIDAK diubah.
 *
 * Analogi: sinyal strategi skor (laporan awal) belum jadi vonis; butuh saksi 1 (harga menembus
 * high/low candle sinyal dalam <=2 candle) dan saksi 2 (arah D1 setuju), baru masuk.
 *
 * Keputusan Fahmi (lihat chat KC-3 bahan baru): "laporan awal" dari sinyal strategi skor SETELAH
 * gerbang Mode Aman (sama seperti audit-skor.csv Python, = trade yang BENAR-BENAR diambil di backtest
 * skor) — bukan sinyal mentah scoreSetup() sebelum gerbang. Modal acuan $758, sama dengan dasar
 * T-AUDIT asli (docs/RANCANGAN-...md baris 4, strategi_versi_mdbka_bt.py baris 6).
 */
import { runBacktest, type BacktestTrade } from "./backtest";
import { timeStopApplies } from "./exitMonitor";
import type { Candle } from "../calculations/swingDetector";
import type { BrokerId } from "../types/broker";
import type { ExchangeRates } from "../services/fxRateService";
import {
  attachYesterdayDaily,
  buildDaily,
  lolosGerbangBiaya,
  mfeROf,
  ringkasTambang,
  rMultipleOf,
  simulateTrailing,
  type HasilTambangBahan,
  type MinedTrade,
} from "./kc3BahanShared";
import type { PolaCalon } from "./branchArchitecture";

export const FAKTA_TARGET_RR = 1.5;
export const FAKTA_SAKSI_MAX_CANDLE = 2;
/** = modal acuan T-AUDIT asli ($758, docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md baris 4). */
export const FAKTA_EQUITY_ACUAN_USD = 758;

export const FAKTA_POLA_ID = "KC3-FAKTA-1";

/** Serialisasi candle -> CSV format MDBKA (time,open,high,low,close,tick_volume) untuk runBacktest(). */
function keCsv(candles: readonly Candle[]): string {
  const baris = candles.map((c) => `${c.time},${c.open},${c.high},${c.low},${c.close},0`);
  return ["time,open,high,low,close,tick_volume", ...baris].join("\n");
}

/**
 * Cache proses (bukan disk) hasil runBacktest() per (simbol+broker+rentang candle+spread) — terbukti
 * perlu saat verifikasi nyata (audit A-3): F-1 memindai ulang seluruh riwayat skor tiap simbol lewat
 * mesin backtest penuh, dan KC-3 sering dijalankan ulang (debugging/klik berkali-kali) pada data H1
 * yang BELUM berubah. Kunci cache murah (jumlah+waktu candle pertama/terakhir), bukan isi penuh — cukup
 * untuk membedakan rentang LATIH vs TRY-OUT dan data yang benar-benar baru, tanpa menghitung hash berat.
 * Hilang saat proses backend restart (tsx watch) — aman, cuma mempercepat run berikutnya.
 */
const cacheSinyal = new Map<string, readonly BacktestTrade[]>();

function kunciCacheSinyal(symbol: string, brokerId: BrokerId, candles: readonly Candle[], spread: number): string {
  const pertama = candles[0]?.time ?? "";
  const terakhir = candles[candles.length - 1]?.time ?? "";
  return `${brokerId}|${symbol}|${candles.length}|${pertama}|${terakhir}|${spread}`;
}

/** "Laporan awal": trade yang benar-benar diambil strategi skor (equity $758) — REUSE runBacktest(), bukan tulis ulang indikator. */
export function sinyalSkorDariCandles(symbol: string, brokerId: BrokerId, candles: readonly Candle[], fxRates: ExchangeRates | null, spread: number): readonly BacktestTrade[] {
  const kunci = kunciCacheSinyal(symbol, brokerId, candles, spread);
  const dariCache = cacheSinyal.get(kunci);
  if (dariCache !== undefined) return dariCache;
  const hasil = runBacktest({ symbol, brokerId, csv: keCsv(candles), equity: FAKTA_EQUITY_ACUAN_USD, fxRates, spread });
  const sinyal = hasil.error === null ? hasil.trades : [];
  cacheSinyal.set(kunci, sinyal);
  return sinyal;
}

/** Tambang F-1 satu simbol dari sinyal skor yang sudah ada — satu posisi per waktu. */
export function tambangFaktaSimbol(
  simbol: string,
  candles: readonly Candle[],
  sinyal: readonly BacktestTrade[],
  spread: number,
  pointValueUsd: number,
  komisiUsdPerLot: number,
): MinedTrade[] {
  if (!(pointValueUsd > 0)) return [];
  const komisiHarga = komisiUsdPerLot / pointValueUsd;
  const daily = buildDaily(candles);
  const kemarin = attachYesterdayDaily(candles, daily);
  const indeksWaktu = new Map<string, number>();
  candles.forEach((c, i) => indeksWaktu.set(c.time, i));
  const batasBar = timeStopApplies(simbol) ? 3 : null;

  const out: MinedTrade[] = [];
  let free = 0;
  for (const s of sinyal) {
    const i = indeksWaktu.get(s.signalTime);
    if (i === undefined || i < free) continue;
    const ci = candles[i] as Candle;
    const beli = s.direction === "BELI";
    const dist = Math.abs(s.entry - s.stopLoss);
    if (!(dist > 0)) continue;
    // Saksi 1 (waktu): dalam <= 2 candle H1, close menembus high (BELI) / low (JUAL) candle sinyal.
    let j: number | null = null;
    for (let langkah = 1; langkah <= FAKTA_SAKSI_MAX_CANDLE; langkah += 1) {
      const k = i + langkah;
      const ck = candles[k];
      if (ck === undefined) continue;
      if (beli ? ck.close > ci.high : ck.close < ci.low) {
        j = k;
        break;
      }
    }
    if (j === null) continue;
    const cj = candles[j] as Candle;
    // Saksi 2 (tempat lain): arah D1 kemarin setuju.
    const d1 = kemarin[j];
    if (d1 === null || d1 === undefined || d1.sma20 === null) continue;
    if (beli ? !(d1.close > d1.sma20) : !(d1.close < d1.sma20)) continue;
    const entry = beli ? cj.close + spread : cj.close;
    const sl = beli ? entry - dist : entry + dist;
    const tp = beli ? entry + FAKTA_TARGET_RR * dist : entry - FAKTA_TARGET_RR * dist;
    if (!lolosGerbangBiaya(spread, komisiHarga, dist)) continue;
    const direction: "BELI" | "JUAL" = beli ? "BELI" : "JUAL";
    const sim = simulateTrailing(candles, j, direction, entry, sl, tp, spread, { firstCandleIsEntry: false, beAt1R: false, maxBars: batasBar });
    if (sim === null) continue;
    out.push({
      simbol,
      signalTime: cj.time,
      direction,
      outcome: sim.outcome,
      rMultiple: rMultipleOf(direction, entry, sim.exitPrice, dist, komisiHarga),
      mfeR: mfeROf(candles, j, sim.exitIndex, direction, entry, dist),
    });
    free = sim.exitIndex + 1;
  }
  return out;
}

export function tambangFakta(
  bySimbol: ReadonlyMap<string, Candle[]>,
  brokerId: BrokerId,
  fxRates: ExchangeRates | null,
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
    const sinyal = sinyalSkorDariCandles(simbol, brokerId, candles, fxRates, sp);
    trades.push(...tambangFaktaSimbol(simbol, candles, sinyal, sp, pv, kom));
  }
  return ringkasTambang(trades);
}

export function polaFakta(hasil: HasilTambangBahan): PolaCalon {
  return {
    id: FAKTA_POLA_ID,
    kondisi: "Pencari Fakta (F-1): sinyal strategi skor yang sudah diambil (equity $758) dikuatkan saksi 1 (tembus high/low candle sinyal <=2 candle) + saksi 2 (arah D1 setuju) sebelum masuk.",
    bahan: ["Sinyal strategi skor (decisionEngine.ts, tidak diubah)", "Musim D1 (SMA20 harian)"],
    angkaBeku: { targetRR: FAKTA_TARGET_RR, saksiMaxCandle: FAKTA_SAKSI_MAX_CANDLE, equityAcuanUsd: FAKTA_EQUITY_ACUAN_USD },
    latih: { n: hasil.n, rataR: hasil.rataR },
    tryout: { n: 0, rataR: null },
  };
}
