/**
 * Segmentasi M-1 Mancing per simbol/golongan/sesi/arah, bagian LATIH (diagnosa, bukan bahan baru) — 17 Okt 2026.
 * Pemicu: ablasi exit (ablasi_exit_mancing.ts) membuktikan tidak ada aturan keluar yang membalik M-1
 * jadi positif secara keseluruhan (PF mentok 0,80). Sebelum menyerah pada bahan ini: apakah ada
 * SUB-KELOMPOK (golongan/simbol/sesi/arah) yang mendekati atau sudah lolos impas, tersembunyi oleh
 * rata-rata gabungan yang negatif?
 * Reuse PERSIS tambangMancing() produksi (kc3BahanMancing.ts) — tidak ada aturan baru, hanya
 * pengelompokan hasil yang SUDAH ditambang. riskGroupOf() (riskGroup.ts) = golongan resmi yang sama
 * dipakai Mode Aman/KC-4 (lampu), bukan pengelompokan baru.
 * Pakai: npx tsx scripts/research/segmentasi_mancing.ts
 */
import { join } from "node:path";
import { bacaBahan, resolveBiaya, saringBySimbol } from "../../server/services/kc3Runner";
import { readLatestHasil } from "../../server/services/branchStore";
import { resolveCommonFilesDir } from "../../server/routes/marginRoutes";
import { getCachedEcbRates } from "../../server/routes/fxRoutes";
import { FALLBACK_RATES } from "../../src/services/fxRateService";
import { DAFTAR_BAHAN } from "../../src/lib/kc3BahanRegistry";
import { utcHourOfServerTime, type MinedTrade } from "../../src/lib/kc3BahanShared";
import { riskGroupOf } from "../../src/lib/riskGroup";
import { BAHAN_MIN_TRADE } from "../../src/lib/kc3BahanRegistry";

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

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

interface Stat {
  readonly key: string;
  readonly n: number;
  readonly win: number;
  readonly rataR: number;
  readonly medianR: number | null;
  readonly pf: number;
}

function statOf(key: string, trades: readonly MinedTrade[]): Stat {
  const Rs = trades.map((t) => t.rMultiple);
  const win = trades.filter((t) => t.rMultiple > 0).length;
  const pos = Rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const neg = -Rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  return { key, n: trades.length, win, rataR: Rs.reduce((a, b) => a + b, 0) / Rs.length, medianR: median(Rs), pf: neg > 0 ? pos / neg : Infinity };
}

function cetak(judul: string, trades: readonly MinedTrade[], keyFn: (t: MinedTrade) => string): void {
  console.log(`\n==== ${judul} ====`);
  const groups = new Map<string, MinedTrade[]>();
  for (const t of trades) {
    const k = keyFn(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const stats = [...groups.entries()].map(([k, v]) => statOf(k, v)).sort((a, b) => b.rataR - a.rataR);
  for (const s of stats) {
    const tanda = s.n >= BAHAN_MIN_TRADE ? (s.rataR > 0 ? "  <- POSITIF, n cukup" : s.pf >= 1.2 ? "  <- PF>=1,2, n cukup" : "") : "  (n<20, belum cukup utk dinilai)";
    console.log(`  ${s.key.padEnd(20)} n=${String(s.n).padStart(5)} menang ${String(Math.round((100 * s.win) / s.n)).padStart(3)}% rata-rata R=${s.rataR >= 0 ? "+" : ""}${s.rataR.toFixed(3)} median=${s.medianR?.toFixed(2)} PF=${s.pf === Infinity ? "inf" : s.pf.toFixed(2)}${tanda}`);
  }
}

function sesiBucket(signalTime: string): string {
  const h = utcHourOfServerTime(signalTime);
  if (h === null) return "?";
  if (h < 11) return "07-10 UTC";
  if (h < 15) return "11-14 UTC";
  return "15-19 UTC";
}

function main(): void {
  console.log(`Broker: ${broker} · LATIH: ${split?.dari} s/d ${split?.latihSampai}`);
  const bahanMancing = DAFTAR_BAHAN.find((b) => b.nama === "M-1 Mancing");
  if (bahanMancing === undefined) throw new Error("bahan M-1 tidak ditemukan");
  const raw = bacaBahan(commonDir, simbolBroker, bahanMancing);
  const latih = saringBySimbol(raw, split?.dari as string, split?.latihSampai as string);
  const hasil = bahanMancing.tambang({
    bySimbol: latih,
    spread: biaya.spread,
    pointValueUsd: biaya.pointValueUsd,
    komisiUsdPerLot: biaya.komisiUsdPerLot,
    brokerId: broker as never,
    fxRates: rates,
  });
  const trades = hasil.trades;
  console.log(`Total trade LATIH (aturan M-1 SEKARANG, tidak diubah): n=${trades.length}`);

  cetak("Per GOLONGAN (riskGroupOf, sama dengan Mode Aman/KC-4)", trades, (t) => riskGroupOf(t.simbol).label);
  cetak("Per SIMBOL (ambang lolos n>=20)", trades, (t) => t.simbol);
  cetak("Per SESI (jam UTC)", trades, (t) => sesiBucket(t.signalTime));
  cetak("Per ARAH", trades, (t) => t.direction);
}

main();
