import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsvCandles } from "../../src/lib/csvCandleParser";
import { parseSpreadsFromMargin } from "../../src/lib/backtestCli";
import { canonicalSymbolForBroker } from "../../src/lib/brokerSymbols";
import { applyBrokerPreset } from "../../src/lib/marketReset";
import { withUsdPointValue } from "../../src/lib/usdPointValue";
import type { Candle } from "../../src/calculations/swingDetector";
import type { BrokerId } from "../../src/types/broker";
import type { BrokerSettings } from "../../src/types/analysis";
import type { ExchangeRates } from "../../src/services/fxRateService";
import { recommendationStatus, type Recommendation, type RecommendationInput } from "../../src/lib/branchOffice";
import type { CatatanPerbaikan, PembagianData, PolaCalon } from "../../src/lib/branchArchitecture";
import { formulirKc3Pembagian, kepalaSekolah, type FileRentang, type HasilKepalaSekolah } from "../../src/lib/kc3Kepala";
import { bulanRentang, catatanPerbaikan, formulirPolaCalon, pengawasTryout, saringKebetulan, type HasilSaring, type HasilTryout, type TahapPerbaikan } from "../../src/lib/kc3Perbaikan";
import { BAHAN_MIN_TRADE, DAFTAR_BAHAN, type BahanDefinisi } from "../../src/lib/kc3BahanRegistry";
import type { HasilTambangBahan } from "../../src/lib/kc3BahanShared";
import { candleTimeMs } from "../../src/lib/symbolScanner";
import { readAllHasil, readBranch, readLatestHasil, saveHasil, saveRecommendation } from "./branchStore";
import { readFaktaBroker } from "./kc1Runner";

/**
 * KC-3 (16 Okt 2026, digeneralisasi A-3) — penjalan Kepala Sekolah + Penambang Fakta + Penyaring
 * Kebetulan/Pengawas Try-out, kini untuk SEMUA bahan di DAFTAR_BAHAN (kc3BahanRegistry.ts): Badai
 * (M15, bahan pertama) + M-1 Mancing/P-1 Petani Kebun/F-1 Pencari Fakta (H1, dipilih Fahmi menggantikan/
 * mendampingi Badai setelah pola Badai gagal konsisten di 16/16 bulan LATIH).
 *  1. Kepala Sekolah: baca PILIHAN_BROKER (KC-1) + DAFTAR_DATA (KC-2), bekukan Pembagian Data
 *     (latih 60% · try-out 20% · ujian 20%, segel), simpan map PEMBAGIAN_DATA + Formulir R bila
 *     rentang data belum cukup.
 *  2. Untuk TIAP bahan: baca file Common Files timeframe bahan itu (M15/H1), saring HANYA bagian
 *     LATIH (segel ujian dijaga di sini), tambang, simpan map POLA_CALON. Formulir R terpisah bila
 *     file belum ada atau percobaan < BAHAN_MIN_TRADE.
 *  3. Penyaring Kebetulan: bila percobaan cukup, saring pola yang tidak konsisten antar bulan LATIH
 *     atau tanpa keunggulan di atas titik impas. Lolos -> Pengawas Try-out menguji SEKALI di bagian
 *     TRY-OUT (saring/tryout tidak pernah mengintip bagian UJIAN). Lolos try-out -> POLA_CALON
 *     diperbarui + Formulir R "Pola Calon" ke Pusat. Gagal di langkah mana pun (dengan n cukup) ->
 *     Jalur Perbaikan (CatatanPerbaikan, diagnosis -> jalan A-E, lihat src/lib/kc3Perbaikan.ts).
 * HANYA MEMBACA map cabang lain + file MT5 + config/kc1-fakta-broker.json (margin/spread); tidak
 * mengubah EA/skrip/.env; tidak mengirim order.
 */
export interface Kc3BahanHasil {
  readonly id: string;
  readonly nama: string;
  readonly tambang: HasilTambangBahan | null;
  readonly tambangMasalah: string | null;
  readonly tambangRec: Recommendation | null;
  readonly saring: HasilSaring | null;
  readonly tryout: HasilTryout | null;
  readonly perbaikan: CatatanPerbaikan | null;
  readonly polaRec: Recommendation | null;
}

export interface Kc3Run extends HasilKepalaSekolah {
  readonly broker: string;
  readonly rec: Recommendation | null;
  /** Hasil bahan pertama (Badai, M15) — dipertahankan sebagai field tersendiri (kompatibilitas A-2). */
  readonly tambang: HasilTambangBahan | null;
  readonly tambangMasalah: string | null;
  readonly tambangRec: Recommendation | null;
  readonly saring: HasilSaring | null;
  readonly tryout: HasilTryout | null;
  readonly perbaikan: CatatanPerbaikan | null;
  readonly polaRec: Recommendation | null;
  /** Hasil bahan LAINNYA (M-1/P-1/F-1, H1) — satu entri per bahan di DAFTAR_BAHAN selain Badai. */
  readonly bahanLain: readonly Kc3BahanHasil[];
}

export class Kc3Error extends Error {}

/** File M15 (MDBKA_<simbol>_M15_LONG.csv) milik simbol broker terpilih, candle apa adanya (belum disaring ke bagian mana pun). Dipakai ulang KC-4. */
export function bacaM15(commonDir: string, simbolBroker: ReadonlySet<string>): Map<string, Candle[]> {
  return bacaTimeframe(commonDir, simbolBroker, "M15");
}

/** File H1 (MDBKA_<simbol>_H1_LONG.csv) milik simbol broker terpilih — dipakai bahan M-1/P-1/F-1. Dipakai ulang KC-4. */
export function bacaH1(commonDir: string, simbolBroker: ReadonlySet<string>): Map<string, Candle[]> {
  return bacaTimeframe(commonDir, simbolBroker, "H1");
}

function bacaTimeframe(commonDir: string, simbolBroker: ReadonlySet<string>, tf: "M15" | "H1"): Map<string, Candle[]> {
  const out = new Map<string, Candle[]>();
  if (!existsSync(commonDir)) return out;
  const pola = new RegExp(`^MDBKA_(.+)_${tf}_LONG\\.csv$`);
  for (const name of readdirSync(commonDir)) {
    const m = pola.exec(name);
    if (m !== null && simbolBroker.has(m[1] as string)) {
      out.set(m[1] as string, parseCsvCandles(readFileSync(join(commonDir, name), "utf8")).candles);
    }
  }
  return out;
}

/** Baca candle Common Files sesuai timeframe satu bahan (M15/H1). Dipakai ulang KC-4. */
export function bacaBahan(commonDir: string, simbolBroker: ReadonlySet<string>, bahan: BahanDefinisi): Map<string, Candle[]> {
  return bahan.timeframe === "M15" ? bacaM15(commonDir, simbolBroker) : bacaH1(commonDir, simbolBroker);
}

/** Saring candle ke satu bagian [dariIso, sampaiIso) — segel ujian dijaga di sini (pemanggil memilih rentang). */
function saringRentang(candles: readonly Candle[], dariIso: string, sampaiIso: string): Candle[] {
  const dariMs = candleTimeMs(dariIso);
  const sampaiMs = candleTimeMs(sampaiIso);
  if (dariMs === null || sampaiMs === null) return [];
  return candles.filter((c) => {
    const t = candleTimeMs(String(c.time ?? ""));
    return t !== null && t >= dariMs && t < sampaiMs;
  });
}

/** Saring candle tiap simbol ke satu bagian [dariIso, sampaiIso) sekaligus. Dipakai ulang KC-4. */
export function saringBySimbol(m15: ReadonlyMap<string, Candle[]>, dariIso: string, sampaiIso: string): Map<string, Candle[]> {
  const out = new Map<string, Candle[]>();
  for (const [simbol, candles] of m15) out.set(simbol, saringRentang(candles, dariIso, sampaiIso));
  return out;
}

/** Jumlah bahan/pola BERBEDA yang pernah ditambang KC-3 ("makin banyak dicoba, makin ketat" — §6a), lintas SEMUA bahan. */
function hitungJumlahPolaPernahDitambang(dataDir: string): number {
  const ids = new Set<string>();
  for (const h of readAllHasil(dataDir, "KC-3", "POLA_CALON")) {
    const id = (h.data as { id?: unknown } | null)?.id;
    if (typeof id === "string") ids.add(id);
  }
  return Math.max(1, ids.size);
}

/** Percobaan Jalur Perbaikan ke berapa untuk satu polaId (1 = belum pernah dicatat sebelumnya). */
function hitungPercobaanKe(dataDir: string, polaId: string): number {
  let n = 0;
  for (const h of readAllHasil(dataDir, "KC-3", "CATATAN_PERBAIKAN")) {
    if ((h.data as { polaId?: unknown } | null)?.polaId === polaId) n += 1;
  }
  return n + 1;
}

/** CatatanPerbaikan TERAKHIR untuk satu polaId; null = belum pernah dicatat. */
function catatanTerakhir(dataDir: string, polaId: string): CatatanPerbaikan | null {
  const semua = readAllHasil(dataDir, "KC-3", "CATATAN_PERBAIKAN")
    .map((h) => h.data as CatatanPerbaikan | null)
    .filter((c): c is CatatanPerbaikan => c !== null && c.polaId === polaId);
  return semua.length === 0 ? null : (semua[semua.length - 1] as CatatanPerbaikan);
}

/**
 * Audit A-2 (16 Okt 2026): sebelum fix ini, SETIAP kali KC-3 dijalankan ulang pada pola yang masih
 * gagal dengan data yang SAMA, sistem mencatat satu "percobaan" Jalur Perbaikan baru — padahal belum
 * ada perbaikan logika apa pun yang benar-benar dicoba. Fix: hanya catat percobaan baru bila diagnosis
 * (alasan) BERBEDA dari CatatanPerbaikan terakhir untuk pola ini; selain itu, pakai ulang catatan lama.
 */
function catatanBaruAtauLama(dataDir: string, polaId: string, tahap: TahapPerbaikan, alasan: string, now: Date): CatatanPerbaikan {
  const sebelumnya = catatanTerakhir(dataDir, polaId);
  if (sebelumnya !== null && sebelumnya.diagnosis === alasan) return sebelumnya;
  const percobaanKe = hitungPercobaanKe(dataDir, polaId);
  const catatan = catatanPerbaikan(polaId, percobaanKe, tahap, alasan);
  saveHasil(dataDir, "KC-3", "CATATAN_PERBAIKAN", catatan, now);
  return catatan;
}

/** Formulir R yang judulnya identik dan BELUM final diputuskan Pusat (MENUNGGU/DITUNDA) — hindari kirim dobel (audit A-2). */
function formulirPendingSerupa(dataDir: string, judul: string): Recommendation | null {
  const ada = readBranch(dataDir, "KC-3").find((x) => x.rec.judul === judul && (recommendationStatus(x.decisions) === "MENUNGGU" || recommendationStatus(x.decisions) === "DITUNDA"));
  return ada?.rec ?? null;
}

function formulirTambang(broker: string, bahanNama: string, teks: string, tanggal: string): RecommendationInput {
  return {
    judul: `Penambang Fakta KC-3 (${broker}): ${bahanNama} belum bisa ditambang`,
    fakta: [{ teks, sumber: `Penambang Fakta KC-3 ${tanggal}` }],
    batasData: "Hanya file Common Files milik broker terpilih, bagian LATIH saja (sebelum batas try-out).",
    usulan: "Jalankan skrip ExportLongH1MDBKA di MT5 broker terpilih (timeframe sesuai bahan ini) agar filenya ada, lalu jalankan ulang KC-3.",
    risiko: "Tidak mengubah data, tidak mengirim order; hanya menandai tambang bahan ini belum bisa jalan / belum cukup percobaan.",
  };
}

const ZERO_BROKER: BrokerSettings = {
  equity: 0, riskPercent: 0, minLot: 0, lotStep: 0, pointValue: 0,
  contractSize: 0, commission: 0, slippage: 0, buffer: 0, atrMultiplier: 0, targetRR: 0,
};

export interface BiayaPerSimbol {
  readonly spread: Map<string, number>;
  readonly pointValueUsd: Map<string, number>;
  readonly komisiUsdPerLot: Map<string, number>;
}

/** Spread (file Margin) + pointValue/komisi USD (applyBrokerPreset/withUsdPointValue, jalur SAMA dengan KC-1) per simbol broker terpilih. Dipakai ulang KC-4. */
export function resolveBiaya(commonDir: string, faktaFile: string, brokerId: BrokerId, rates: ExchangeRates | null): BiayaPerSimbol {
  const spread = new Map<string, number>();
  const pointValueUsd = new Map<string, number>();
  const komisiUsdPerLot = new Map<string, number>();
  const fakta = readFaktaBroker(faktaFile).find((f) => f.id === brokerId);
  if (fakta === undefined) return { spread, pointValueUsd, komisiUsdPerLot };
  const marginFile = join(commonDir, `MDBKA_Margin_${fakta.margin}.csv`);
  if (!existsSync(marginFile)) return { spread, pointValueUsd, komisiUsdPerLot };
  const spreads = parseSpreadsFromMargin(readFileSync(marginFile, "utf8"));
  for (const [symbol, sp] of spreads) {
    const canonical = canonicalSymbolForBroker(symbol, brokerId) || symbol;
    const b = withUsdPointValue(applyBrokerPreset({ ...ZERO_BROKER }, canonical, brokerId), canonical, brokerId, rates);
    spread.set(symbol, sp);
    pointValueUsd.set(symbol, b.pointValue);
    komisiUsdPerLot.set(symbol, b.commission);
  }
  return { spread, pointValueUsd, komisiUsdPerLot };
}

/** Tambang + Penyaring Kebetulan + Pengawas Try-out untuk SATU bahan (dipakai Badai & bahanLain — identik). */
function prosesBahan(
  dataDir: string,
  broker: string,
  brokerId: BrokerId,
  bahan: BahanDefinisi,
  split: PembagianData,
  rawBySimbol: ReadonlyMap<string, Candle[]>,
  biaya: BiayaPerSimbol,
  fxRates: ExchangeRates | null,
  tanggal: string,
  now: Date,
): Kc3BahanHasil {
  const kosong: Omit<Kc3BahanHasil, "tambang" | "tambangMasalah" | "tambangRec"> = {
    id: bahan.id, nama: bahan.nama, saring: null, tryout: null, perbaikan: null, polaRec: null,
  };
  if (rawBySimbol.size === 0) {
    const masalah = `Tidak ada file ${bahan.timeframe} (MDBKA_<simbol>_${bahan.timeframe}_LONG.csv) untuk bahan ${bahan.nama}.`;
    const form = formulirTambang(broker, bahan.nama, masalah, tanggal);
    const rec = formulirPendingSerupa(dataDir, form.judul) ?? saveRecommendation(dataDir, "KC-3", form, now);
    return { ...kosong, tambang: null, tambangMasalah: masalah, tambangRec: rec };
  }
  const latihBySimbol = saringBySimbol(rawBySimbol, split.dari, split.latihSampai);
  const opts = { spread: biaya.spread, pointValueUsd: biaya.pointValueUsd, komisiUsdPerLot: biaya.komisiUsdPerLot, brokerId, fxRates };
  const tambang = bahan.tambang({ bySimbol: latihBySimbol, ...opts });
  const pola: PolaCalon = bahan.bungkus(tambang);
  saveHasil(dataDir, "KC-3", "POLA_CALON", pola, now);
  if (tambang.n < BAHAN_MIN_TRADE) {
    const masalah = `Hanya ${tambang.n} percobaan ${bahan.nama} di bagian LATIH (kurang dari ${BAHAN_MIN_TRADE}); belum cukup untuk Penyaring Kebetulan.`;
    const form = formulirTambang(broker, bahan.nama, masalah, tanggal);
    const rec = formulirPendingSerupa(dataDir, form.judul) ?? saveRecommendation(dataDir, "KC-3", form, now);
    return { ...kosong, tambang, tambangMasalah: masalah, tambangRec: rec };
  }
  // Penyaring Kebetulan: pola harus konsisten di setiap bulan LATIH + lolos titik impas (§6a).
  const bulanLatih = bulanRentang(split.dari, split.latihSampai);
  const jumlahPola = hitungJumlahPolaPernahDitambang(dataDir);
  const saring = saringKebetulan(tambang.trades, bulanLatih, jumlahPola);
  if (saring.status === "LOLOS") {
    // Pengawas Try-out: uji SEKALI di bagian TRY-OUT, belum pernah diintip sebelumnya.
    const tryoutBySimbol = saringBySimbol(rawBySimbol, split.latihSampai, split.tryoutSampai);
    const tryoutTambang = bahan.tambang({ bySimbol: tryoutBySimbol, ...opts });
    const tryout = pengawasTryout(tryoutTambang.trades);
    if (tryout.lolos) {
      saveHasil(dataDir, "KC-3", "POLA_CALON", { ...pola, tryout: { n: tryout.n, rataR: tryout.rataR } }, now);
      const formPola = formulirPolaCalon(pola, tryout, broker, tanggal);
      const polaRec = formulirPendingSerupa(dataDir, formPola.judul) ?? saveRecommendation(dataDir, "KC-3", formPola, now);
      return { id: bahan.id, nama: bahan.nama, tambang, tambangMasalah: null, tambangRec: null, saring, tryout, perbaikan: null, polaRec };
    }
    const perbaikan = catatanBaruAtauLama(dataDir, pola.id, "TRYOUT_GAGAL", tryout.alasan, now);
    return { id: bahan.id, nama: bahan.nama, tambang, tambangMasalah: null, tambangRec: null, saring, tryout, perbaikan, polaRec: null };
  }
  if (saring.status === "GAGAL" && saring.sebab !== undefined) {
    const perbaikan = catatanBaruAtauLama(dataDir, pola.id, saring.sebab, saring.alasan, now);
    return { id: bahan.id, nama: bahan.nama, tambang, tambangMasalah: null, tambangRec: null, saring, tryout: null, perbaikan, polaRec: null };
  }
  return { id: bahan.id, nama: bahan.nama, tambang, tambangMasalah: null, tambangRec: null, saring, tryout: null, perbaikan: null, polaRec: null };
}

export function runKc3(opts: {
  readonly dataDir: string;
  readonly commonDir: string;
  readonly now: Date;
  readonly faktaFile?: string;
  readonly rates?: ExchangeRates | null;
}): Kc3Run {
  const pilihan = readLatestHasil(opts.dataDir, "KC-1", "PILIHAN_BROKER");
  const pilihanData = pilihan?.data as { broker?: unknown } | null | undefined;
  const broker = typeof pilihanData?.broker === "string" ? pilihanData.broker : null;
  if (broker === null) throw new Kc3Error("Belum ada broker terpilih dari KC-1 (map PILIHAN_BROKER disetujui Pusat).");

  const daftar = readLatestHasil(opts.dataDir, "KC-2", "DAFTAR_DATA");
  const daftarData = daftar?.data as { broker?: unknown; files?: unknown } | null | undefined;
  if (daftarData?.broker !== broker || !Array.isArray(daftarData.files)) {
    throw new Kc3Error("Belum ada DAFTAR_DATA KC-2 untuk broker terpilih (jalankan pemeriksaan KC-2 dulu).");
  }
  const files = daftarData.files as FileRentang[];

  const hasil = kepalaSekolah(broker, files);
  const tanggal = opts.now.toISOString().slice(0, 10);
  if (hasil.split !== null) {
    saveHasil(opts.dataDir, "KC-3", "PEMBAGIAN_DATA", { ...hasil.split, hariBersama: hasil.hariBersama }, opts.now);
  }
  const form = formulirKc3Pembagian(broker, hasil, tanggal);
  const rec = form === null ? null : (formulirPendingSerupa(opts.dataDir, form.judul) ?? saveRecommendation(opts.dataDir, "KC-3", form, opts.now));

  let badai: Kc3BahanHasil = { id: DAFTAR_BAHAN[0]?.id ?? "", nama: DAFTAR_BAHAN[0]?.nama ?? "", tambang: null, tambangMasalah: null, tambangRec: null, saring: null, tryout: null, perbaikan: null, polaRec: null };
  const bahanLain: Kc3BahanHasil[] = [];
  const split = hasil.split;
  if (split !== null) {
    const simbolBroker = new Set(files.map((f) => f.simbol));
    const brokerId = broker as BrokerId;
    const faktaFile = opts.faktaFile ?? join(process.cwd(), "config", "kc1-fakta-broker.json");
    const biaya = resolveBiaya(opts.commonDir, faktaFile, brokerId, opts.rates ?? null);
    // Baca+parse tiap timeframe SEKALI, dipakai ulang lintas bahan yang berbagi timeframe (M-1/P-1/F-1
    // semua H1) — sebelum fix ini tiap bahan H1 baca ulang 81 file Common Files dari disk sendiri-sendiri,
    // bikin KC-3 menggantung menit-menitan (audit A-3, terbukti saat verifikasi di browser).
    const candlePerTimeframe = new Map<BahanDefinisi["timeframe"], Map<string, Candle[]>>();
    DAFTAR_BAHAN.forEach((bahan, i) => {
      let raw = candlePerTimeframe.get(bahan.timeframe);
      if (raw === undefined) {
        raw = bacaBahan(opts.commonDir, simbolBroker, bahan);
        candlePerTimeframe.set(bahan.timeframe, raw);
      }
      const hasilBahan = prosesBahan(opts.dataDir, broker, brokerId, bahan, split, raw, biaya, opts.rates ?? null, tanggal, opts.now);
      if (i === 0) badai = hasilBahan;
      else bahanLain.push(hasilBahan);
    });
  }

  return {
    broker, ...hasil, rec,
    tambang: badai.tambang, tambangMasalah: badai.tambangMasalah, tambangRec: badai.tambangRec,
    saring: badai.saring, tryout: badai.tryout, perbaikan: badai.perbaikan, polaRec: badai.polaRec,
    bahanLain,
  };
}

export type Kc3BahanStatus = "BELUM_DITAMBANG" | "DIPROSES" | "GAGAL" | "MENUNGGU_PERSETUJUAN" | "DISETUJUI" | "SUDAH_DIUJI_KC4";

export interface Kc3BahanRingkasan {
  readonly id: string;
  readonly nama: string;
  readonly timeframe: "M15" | "H1";
  readonly pola: PolaCalon | null;
  readonly perbaikan: CatatanPerbaikan | null;
  readonly status: Kc3BahanStatus;
}

/** Status terkini SEMUA bahan (Badai + M-1/P-1/F-1) untuk panel KC-3 — dipanggil lepas dari runKc3() (tidak menambah apa pun, baca saja). */
export function ringkasanBahan(dataDir: string): Kc3BahanRingkasan[] {
  const semuaPola = readAllHasil(dataDir, "KC-3", "POLA_CALON")
    .map((h) => h.data as PolaCalon | null)
    .filter((p): p is PolaCalon => p !== null);
  const semuaCatatan = readAllHasil(dataDir, "KC-3", "CATATAN_PERBAIKAN")
    .map((h) => h.data as CatatanPerbaikan | null)
    .filter((c): c is CatatanPerbaikan => c !== null);
  const kc3Recs = readBranch(dataDir, "KC-3");
  const vonisAda = new Set(
    readAllHasil(dataDir, "KC-4", "VONIS_UJIAN")
      .map((h) => (h.data as { polaId?: unknown } | null)?.polaId)
      .filter((id): id is string => typeof id === "string"),
  );
  return DAFTAR_BAHAN.map((bahan) => {
    const polaUntukBahan = semuaPola.filter((p) => p.id === bahan.id);
    const pola = polaUntukBahan.length === 0 ? null : (polaUntukBahan[polaUntukBahan.length - 1] as PolaCalon);
    const catatanUntukBahan = semuaCatatan.filter((c) => c.polaId === bahan.id);
    const perbaikan = catatanUntukBahan.length === 0 ? null : (catatanUntukBahan[catatanUntukBahan.length - 1] as CatatanPerbaikan);
    let status: Kc3BahanStatus;
    if (vonisAda.has(bahan.id)) status = "SUDAH_DIUJI_KC4";
    else if (pola === null) status = "BELUM_DITAMBANG";
    else if (perbaikan !== null) status = "GAGAL";
    else if (pola.tryout.n > 0) {
      const judul = `Pola Calon KC-3 lolos try-out: ${bahan.id}`;
      const disetujui = kc3Recs.some((x) => x.rec.judul === judul && recommendationStatus(x.decisions) === "DISETUJUI");
      status = disetujui ? "DISETUJUI" : "MENUNGGU_PERSETUJUAN";
    } else status = "DIPROSES";
    return { id: bahan.id, nama: bahan.nama, timeframe: bahan.timeframe, pola, perbaikan, status };
  });
}
