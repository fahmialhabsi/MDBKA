/**
 * Analisa sebab-rugi KC-3, bagian LATIH (diagnosa, BUKAN strategi baru, BUKAN angka baru, 17 Okt 2026).
 * Reuse PERSIS infrastruktur yang sudah tervalidasi, bukan tulis ulang:
 *  - Baca data & tambang: bacaBahan/resolveBiaya/saringBySimbol (server/services/kc3Runner.ts),
 *    DAFTAR_BAHAN (src/lib/kc3BahanRegistry.ts) — Badai/M-1/P-1/F-1 ditambang lewat bahan.tambang()
 *    yang SAMA dipakai kc3Runner/kc4Runner.
 *  - Klasifikasi sebab-rugi dari MFE: AUDIT_RULES.againstMfeR (<0,3R = melawan sejak masuk) dan
 *    .reversalMfeR (>=0,5R lalu rugi = berbalik) — src/lib/tradeAudit.ts, T-AUDIT asli 13 Okt 2026,
 *    dipakai APA ADANYA, tidak ada ambang baru.
 * HANYA MEMBACA (tidak ada saveHasil/saveRecommendation, tidak mengubah decisionEngine.ts).
 * Prasyarat: KC-1/KC-2/KC-3 sudah pernah dijalankan (map PILIHAN_BROKER/DAFTAR_DATA/PEMBAGIAN_DATA ada di data/).
 * Pakai: npx tsx scripts/research/analisa_sebab_rugi_kc3.ts
 */
import { join } from "node:path";
import { bacaBahan, resolveBiaya, saringBySimbol } from "../../server/services/kc3Runner";
import { readLatestHasil } from "../../server/services/branchStore";
import { resolveCommonFilesDir } from "../../server/routes/marginRoutes";
import { getCachedEcbRates } from "../../server/routes/fxRoutes";
import { FALLBACK_RATES } from "../../src/services/fxRateService";
import { DAFTAR_BAHAN } from "../../src/lib/kc3BahanRegistry";
import { AUDIT_RULES } from "../../src/lib/tradeAudit";
import { sinyalSkorDariCandles } from "../../src/lib/kc3BahanFakta";
import { attachYesterdayDaily, buildDaily, lolosGerbangBiaya, type MinedTrade } from "../../src/lib/kc3BahanShared";
import type { Candle } from "../../src/calculations/swingDetector";
import type { BrokerId } from "../../src/types/broker";

const dataDir = join(process.cwd(), "data");
const commonDir = resolveCommonFilesDir();
const faktaFile = join(process.cwd(), "config", "kc1-fakta-broker.json");

const pilihan = readLatestHasil(dataDir, "KC-1", "PILIHAN_BROKER");
const broker = (pilihan?.data as { broker?: unknown } | null)?.broker;
if (typeof broker !== "string") {
  console.error("Belum ada broker terpilih (map PILIHAN_BROKER KC-1 kosong) — jalankan KC-1 dulu.");
  process.exit(1);
}
const brokerId = broker as BrokerId;

const split = readLatestHasil(dataDir, "KC-3", "PEMBAGIAN_DATA")?.data as { dari?: unknown; latihSampai?: unknown } | null;
if (typeof split?.dari !== "string" || typeof split?.latihSampai !== "string") {
  console.error("Belum ada Pembagian Data KC-3 (map PEMBAGIAN_DATA kosong) — jalankan KC-3 dulu.");
  process.exit(1);
}
const dari = split.dari;
const latihSampai = split.latihSampai;

const daftarData = readLatestHasil(dataDir, "KC-2", "DAFTAR_DATA")?.data as { files?: unknown } | null;
const files = Array.isArray(daftarData?.files) ? (daftarData.files as { simbol: string }[]) : [];
const simbolBroker = new Set(files.map((f) => f.simbol));

const rates = getCachedEcbRates() ?? FALLBACK_RATES;
const biaya = resolveBiaya(commonDir, faktaFile, brokerId, rates);

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const pct = (n: number, total: number): string => `${Math.round((100 * n) / total)}%`;

/** Sebab-rugi dari MFE, AUDIT_RULES (tradeAudit.ts) apa adanya — hanya untuk trade rugi (R<=0). */
function sebabRugi(t: MinedTrade): string {
  if (t.rMultiple > 0) return "MENANG";
  if (t.mfeR >= AUDIT_RULES.reversalMfeR) return "BERBALIK_SETELAH_0_5R";
  if (t.mfeR < AUDIT_RULES.againstMfeR) return "MELAWAN_SEJAK_MASUK";
  return "TANPA_SEBAB_PASTI";
}

function tabulasi(label: string, map: Map<string, number>, total: number): void {
  const baris = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v} (${pct(v, total)})`)
    .join(" · ");
  console.log(`  ${label}: ${baris}`);
}

async function analisaBahan(bahan: (typeof DAFTAR_BAHAN)[number]): Promise<void> {
  console.log(`\n==== ${bahan.nama} (${bahan.timeframe}) ====`);
  const raw = bacaBahan(commonDir, simbolBroker, bahan);
  if (raw.size === 0) {
    console.log(`  Tidak ada file ${bahan.timeframe} (MDBKA_<simbol>_${bahan.timeframe}_LONG.csv).`);
    return;
  }
  const latihBySimbol = saringBySimbol(raw, dari, latihSampai);
  const hasil = bahan.tambang({
    bySimbol: latihBySimbol,
    spread: biaya.spread,
    pointValueUsd: biaya.pointValueUsd,
    komisiUsdPerLot: biaya.komisiUsdPerLot,
    brokerId,
    fxRates: rates,
  });
  const trades = hasil.trades;
  if (trades.length === 0) {
    console.log("  n=0 — tidak ada percobaan LATIH.");
    return;
  }
  const Rs = trades.map((t) => t.rMultiple);
  const mean = Rs.reduce((a, b) => a + b, 0) / Rs.length;
  const win = trades.filter((t) => t.rMultiple > 0).length;
  console.log(`  n=${trades.length} · menang ${pct(win, trades.length)} · rata-rata R=${mean.toFixed(3)} · median R=${median(Rs)?.toFixed(3)}`);

  const cara = new Map<string, number>();
  for (const t of trades) cara.set(t.outcome, (cara.get(t.outcome) ?? 0) + 1);
  tabulasi("keluar", cara, trades.length);

  const sebab = new Map<string, number>();
  for (const t of trades) {
    const s = sebabRugi(t);
    sebab.set(s, (sebab.get(s) ?? 0) + 1);
  }
  tabulasi("sebab (MFE, AUDIT_RULES T-AUDIT)", sebab, trades.length);
}

/**
 * Funnel saksi 1/2 F-1 (replikasi loop tambangFaktaSimbol, kc3BahanFakta.ts, HANYA untuk hitung —
 * tidak re-simulasi exit, jadi "lolosBiaya" sedikit lebih tinggi dari n trade asli bila posisi masih
 * TERBUKA saat data habis; itu dicatat terpisah, bukan dianggap trade).
 */
function funnelFakta(bySimbol: ReadonlyMap<string, Candle[]>): { totalSinyal: number; lolosSaksi1: number; lolosSaksi2: number; lolosBiaya: number } {
  let totalSinyal = 0;
  let lolosSaksi1 = 0;
  let lolosSaksi2 = 0;
  let lolosBiaya = 0;
  for (const [simbol, candles] of bySimbol) {
    const sp = biaya.spread.get(simbol);
    const pv = biaya.pointValueUsd.get(simbol);
    const kom = biaya.komisiUsdPerLot.get(simbol);
    if (sp === undefined || pv === undefined || kom === undefined || !(pv > 0)) continue;
    const komisiHarga = kom / pv;
    const sinyal = sinyalSkorDariCandles(simbol, brokerId, candles, rates, sp);
    totalSinyal += sinyal.length;
    const daily = buildDaily(candles);
    const kemarin = attachYesterdayDaily(candles, daily);
    const idx = new Map<string, number>();
    candles.forEach((c, i) => idx.set(c.time, i));
    let free = 0;
    for (const s of sinyal) {
      const i = idx.get(s.signalTime);
      if (i === undefined || i < free) continue;
      const ci = candles[i] as Candle;
      const beli = s.direction === "BELI";
      const dist = Math.abs(s.entry - s.stopLoss);
      if (!(dist > 0)) continue;
      let j: number | null = null;
      for (let langkah = 1; langkah <= 2; langkah += 1) {
        const k = i + langkah;
        const ck = candles[k];
        if (ck === undefined) continue;
        if (beli ? ck.close > ci.high : ck.close < ci.low) {
          j = k;
          break;
        }
      }
      if (j === null) continue;
      lolosSaksi1 += 1;
      const d1 = kemarin[j];
      if (d1 === null || d1 === undefined || d1.sma20 === null) continue;
      if (beli ? !(d1.close > d1.sma20) : !(d1.close < d1.sma20)) continue;
      lolosSaksi2 += 1;
      if (!lolosGerbangBiaya(sp, komisiHarga, dist)) continue;
      lolosBiaya += 1;
      free = j + 1;
    }
  }
  return { totalSinyal, lolosSaksi1, lolosSaksi2, lolosBiaya };
}

async function main(): Promise<void> {
  console.log(`Broker: ${broker} · LATIH: ${dari} s/d ${latihSampai}`);
  for (const bahan of DAFTAR_BAHAN) {
    await analisaBahan(bahan);
  }

  console.log(`\n==== F-1 Pencari Fakta — funnel saksi (kenapa n=0?) ====`);
  const faktaBahan = DAFTAR_BAHAN.find((b) => b.id === "KC3-FAKTA-1");
  const rawH1 = faktaBahan === undefined ? new Map<string, Candle[]>() : bacaBahan(commonDir, simbolBroker, faktaBahan);
  const latihH1 = saringBySimbol(rawH1, dari, latihSampai);
  const f = funnelFakta(latihH1);
  console.log(`  laporan awal (sinyal skor $758, gerbang Mode Aman) = ${f.totalSinyal}`);
  console.log(`  -> lolos saksi 1 (tembus high/low <=2 candle)      = ${f.lolosSaksi1} (${f.totalSinyal > 0 ? pct(f.lolosSaksi1, f.totalSinyal) : "-"})`);
  console.log(`  -> lolos saksi 2 (arah D1 setuju)                  = ${f.lolosSaksi2} (${f.lolosSaksi1 > 0 ? pct(f.lolosSaksi2, f.lolosSaksi1) : "-"})`);
  console.log(`  -> lolos gerbang biaya (<=10% risiko)               = ${f.lolosBiaya} (${f.lolosSaksi2 > 0 ? pct(f.lolosBiaya, f.lolosSaksi2) : "-"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
