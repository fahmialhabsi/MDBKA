/**
 * Ablasi EXIT M-1 Mancing, bagian LATIH saja (ujian tetap bersegel) — 17 Okt 2026.
 * DIAGNOSA/WHAT-IF, BUKAN bahan baru, BUKAN pengganti kc3BahanMancing.ts (angka di sana TIDAK diubah).
 *
 * Pemicu: analisa sebab-rugi (analisa_sebab_rugi_kc3.ts) menunjukkan M-1 "melawan sejak masuk" cuma
 * 3% (arah masuk sudah bagus) tapi "BERBALIK_SETELAH_0,5R" 57% (sempat untung >=0,5R lalu balik rugi).
 * M-1 saat ini TIDAK punya proteksi profit (beAt1R: false di kc3BahanMancing.ts) — pertanyaannya: kalau
 * SL digeser ke impas begitu +0,5R / lebih sabar / TP lebih dekat, apakah rata-rata R membaik?
 *
 * Deteksi entry PERSIS kc3BahanMancing.ts (tidak diubah) — hanya ATURAN KELUAR yang divariasikan satu per
 * satu dari baseline (SL 0,5xATR, TP 1,0R, sabar 3 candle, tanpa proteksi) supaya efeknya bisa dipisahkan.
 * Pakai: npx tsx scripts/research/ablasi_exit_mancing.ts
 */
import { join } from "node:path";
import { bacaBahan, resolveBiaya, saringBySimbol } from "../../server/services/kc3Runner";
import { readLatestHasil } from "../../server/services/branchStore";
import { resolveCommonFilesDir } from "../../server/routes/marginRoutes";
import { getCachedEcbRates } from "../../server/routes/fxRoutes";
import { FALLBACK_RATES } from "../../src/services/fxRateService";
import { DAFTAR_BAHAN } from "../../src/lib/kc3BahanRegistry";
import {
  atrSimple14,
  attachYesterdayDaily,
  buildDaily,
  dayKeyOf,
  lolosGerbangBiaya,
  mfeROf,
  rMultipleOf,
  utcHourOfServerTime,
  type MinedTrade,
} from "../../src/lib/kc3BahanShared";
import {
  MANCING_ATR_WINDOW,
  MANCING_SESI_DARI_UTC,
  MANCING_SESI_SAMPAI_UTC,
  MANCING_SL_ATR,
  MANCING_TARGET_RR,
  MANCING_MAX_BAR,
  MANCING_TENANG_JENDELA,
  MANCING_TENANG_KALI,
} from "../../src/lib/kc3BahanMancing";
import type { Candle } from "../../src/calculations/swingDetector";

const dataDir = join(process.cwd(), "data");
const commonDir = resolveCommonFilesDir();
const faktaFile = join(process.cwd(), "config", "kc1-fakta-broker.json");
const broker = (readLatestHasil(dataDir, "KC-1", "PILIHAN_BROKER")?.data as { broker?: string })?.broker;
if (typeof broker !== "string") {
  console.error("Belum ada broker terpilih (KC-1).");
  process.exit(1);
}
const split = readLatestHasil(dataDir, "KC-3", "PEMBAGIAN_DATA")?.data as { dari?: string; latihSampai?: string } | null;
if (typeof split?.dari !== "string" || typeof split?.latihSampai !== "string") {
  console.error("Belum ada Pembagian Data KC-3.");
  process.exit(1);
}
const daftarData = readLatestHasil(dataDir, "KC-2", "DAFTAR_DATA")?.data as { files?: { simbol: string }[] } | null;
const simbolBroker = new Set((daftarData?.files ?? []).map((f) => f.simbol));
const rates = getCachedEcbRates() ?? FALLBACK_RATES;
const biaya = resolveBiaya(commonDir, faktaFile, broker as never, rates);

// ---------- Duplikat lokal: cuacaTenang (median) — tidak diexport kc3BahanMancing.ts ----------
const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
function cuacaTenang(candles: readonly Candle[], i: number): boolean {
  if (i < 1 + MANCING_TENANG_JENDELA) return false;
  const rngSebelum = (candles[i - 1] as Candle).high - (candles[i - 1] as Candle).low;
  const window = candles.slice(i - 1 - MANCING_TENANG_JENDELA, i - 1).map((c) => c.high - c.low);
  const med = median(window);
  return med !== null && rngSebelum <= MANCING_TENANG_KALI * med;
}

// ---------- Duplikat lokal: simulateTrailing (kc3BahanShared.ts) + beAtR UMUM (bukan cuma 1R) ----------
interface SimOpts {
  readonly maxBars: number | null;
  /** null = tanpa proteksi (baseline M-1); angka = geser SL ke impas begitu untung >= beAtR * risk. */
  readonly beAtR: number | null;
}
function simulateTrailingVar(
  candles: readonly Candle[],
  startIndex: number,
  direction: "BELI" | "JUAL",
  entry: number,
  stopLossAwal: number,
  takeProfit: number,
  spread: number,
  opts: SimOpts,
): { outcome: MinedTrade["outcome"]; exitIndex: number; exitPrice: number } | null {
  const risk = Math.abs(entry - stopLossAwal);
  const beli = direction === "BELI";
  let curSl = stopLossAwal;
  let held = 0;
  for (let k = startIndex; k < candles.length; k += 1) {
    const c = candles[k];
    if (c === undefined) break;
    const first = k === startIndex;
    if (!first) held += 1;
    if (beli) {
      if (c.low <= curSl) {
        const exitPrice = first ? curSl : Math.min(curSl, c.open);
        return { outcome: curSl !== entry ? "SL" : "IMPAS", exitIndex: k, exitPrice };
      }
      if (!first && c.high >= takeProfit) return { outcome: "TP", exitIndex: k, exitPrice: c.open > takeProfit ? c.open : takeProfit };
      if (opts.beAtR !== null && !first && c.high >= entry + opts.beAtR * risk) curSl = Math.max(curSl, entry);
    } else {
      if (c.high + spread >= curSl) {
        const exitPrice = first ? curSl : Math.max(curSl, c.open + spread);
        return { outcome: curSl !== entry ? "SL" : "IMPAS", exitIndex: k, exitPrice };
      }
      if (!first && c.low + spread <= takeProfit) return { outcome: "TP", exitIndex: k, exitPrice: c.open + spread < takeProfit ? c.open + spread : takeProfit };
      if (opts.beAtR !== null && !first && c.low + spread <= entry - opts.beAtR * risk) curSl = Math.min(curSl, entry);
    }
    if (opts.maxBars !== null && held >= opts.maxBars) return { outcome: "WAKTU", exitIndex: k, exitPrice: beli ? c.close : c.close + spread };
  }
  return null;
}

// ---------- Duplikat lokal: loop entry M-1 PERSIS kc3BahanMancing.ts, hanya parameter KELUAR divariasikan ----------
interface VarOpts {
  readonly slAtr: number;
  readonly targetRR: number;
  readonly maxBars: number | null;
  readonly beAtR: number | null;
}
function tambangMancingVar(
  simbol: string,
  candles: readonly Candle[],
  spread: number,
  pointValueUsd: number,
  komisiUsdPerLot: number,
  v: VarOpts,
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
      let entry: number, sl: number, risk: number, tp: number;
      if (beli) {
        entry = d1.low + MANCING_ATR_WINDOW * atr;
        if (!(c.open + spread > entry && c.low + spread <= entry)) continue;
        sl = d1.low - v.slAtr * atr;
        risk = entry - sl;
        tp = entry + risk * v.targetRR;
      } else {
        entry = d1.high - MANCING_ATR_WINDOW * atr;
        if (!(c.open < entry && c.high >= entry)) continue;
        sl = d1.high + v.slAtr * atr;
        risk = sl - entry;
        tp = entry - risk * v.targetRR;
      }
      dipakai.add(kunci);
      if (!lolosGerbangBiaya(spread, komisiHarga, risk)) continue;
      const direction: "BELI" | "JUAL" = beli ? "BELI" : "JUAL";
      const sim = simulateTrailingVar(candles, i, direction, entry, sl, tp, spread, { maxBars: v.maxBars, beAtR: v.beAtR });
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

function median2(xs: readonly number[]): number | null {
  return median(xs);
}

function laporkan(label: string, v: VarOpts, latihBySimbol: ReadonlyMap<string, Candle[]>): void {
  const trades: MinedTrade[] = [];
  for (const [simbol, candles] of latihBySimbol) {
    const sp = biaya.spread.get(simbol);
    const pv = biaya.pointValueUsd.get(simbol);
    const kom = biaya.komisiUsdPerLot.get(simbol);
    if (sp === undefined || pv === undefined || kom === undefined) continue;
    trades.push(...tambangMancingVar(simbol, candles, sp, pv, kom, v));
  }
  if (trades.length === 0) {
    console.log(`${label}: n=0`);
    return;
  }
  const Rs = trades.map((t) => t.rMultiple);
  const mean = Rs.reduce((a, b) => a + b, 0) / Rs.length;
  const win = trades.filter((t) => t.rMultiple > 0).length;
  const pos = Rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const neg = -Rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  const pf = neg > 0 ? pos / neg : Infinity;
  const cara = new Map<string, number>();
  for (const t of trades) cara.set(t.outcome, (cara.get(t.outcome) ?? 0) + 1);
  const caraStr = [...cara.entries()].map(([k, v2]) => `${k} ${Math.round((100 * v2) / trades.length)}%`).join(" · ");
  console.log(
    `${label}: n=${trades.length} · menang ${Math.round((100 * win) / trades.length)}% · rata-rata R=${mean.toFixed(3)} · median R=${median2(Rs)?.toFixed(3)} · PF=${pf.toFixed(2)} · keluar ${caraStr}`,
  );
}

function main(): void {
  console.log(`Broker: ${broker} · LATIH: ${split?.dari} s/d ${split?.latihSampai}\n`);
  const bahanMancing = DAFTAR_BAHAN.find((b) => b.nama === "M-1 Mancing");
  if (bahanMancing === undefined) throw new Error("bahan M-1 tidak ditemukan");
  const raw = bacaBahan(commonDir, simbolBroker, bahanMancing);
  const latih = saringBySimbol(raw, split?.dari as string, split?.latihSampai as string);

  const baseline: VarOpts = { slAtr: MANCING_SL_ATR, targetRR: MANCING_TARGET_RR, maxBars: MANCING_MAX_BAR, beAtR: null };
  laporkan("BASELINE (aturan M-1 sekarang: SL 0,5xATR, TP 1,0R, sabar 3 candle, tanpa proteksi)", baseline, latih);
  console.log("");
  laporkan("V1 proteksi di +0,5R (SL->impas begitu capai 0,5R)", { ...baseline, beAtR: 0.5 }, latih);
  laporkan("V2 proteksi di +0,5R + sabar 6 candle", { ...baseline, beAtR: 0.5, maxBars: 6 }, latih);
  laporkan("V3 sabar 6 candle saja (tanpa proteksi, kontrol)", { ...baseline, maxBars: 6 }, latih);
  laporkan("V4 TP lebih dekat 0,5R (tanpa proteksi)", { ...baseline, targetRR: 0.5 }, latih);
  laporkan("V5 TP 0,5R + proteksi di +0,25R", { ...baseline, targetRR: 0.5, beAtR: 0.25 }, latih);
  console.log("");
  console.log("-- Lanjutan: menang 37% secara matematis butuh RR>=1,70 untuk impas (tanpa biaya) --");
  laporkan("V6 TP 1,5R, sabar tetap 3 candle", { ...baseline, targetRR: 1.5 }, latih);
  laporkan("V7 TP 1,5R, sabar 6 candle", { ...baseline, targetRR: 1.5, maxBars: 6 }, latih);
  laporkan("V8 TP 2,0R, sabar 8 candle", { ...baseline, targetRR: 2.0, maxBars: 8 }, latih);
  laporkan("V9 TP 2,0R, sabar TANPA batas", { ...baseline, targetRR: 2.0, maxBars: null }, latih);
}

main();
