import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsvCandles } from "../../src/lib/csvCandleParser";
import type { Candle } from "../../src/calculations/swingDetector";
import { recommendationStatus, type Recommendation, type RecommendationInput } from "../../src/lib/branchOffice";
import type { CatatanPerbaikan, PolaCalon } from "../../src/lib/branchArchitecture";
import { formulirKc3Pembagian, kepalaSekolah, type FileRentang, type HasilKepalaSekolah } from "../../src/lib/kc3Kepala";
import { BADAI_MIN_TRADE, polaBadai, tambangBadai, type HasilPenambangBadai } from "../../src/lib/kc3Penambang";
import { bulanRentang, catatanPerbaikan, formulirPolaCalon, pengawasTryout, saringKebetulan, type HasilSaring, type HasilTryout, type TahapPerbaikan } from "../../src/lib/kc3Perbaikan";
import { candleTimeMs } from "../../src/lib/symbolScanner";
import { readAllHasil, readBranch, readLatestHasil, saveHasil, saveRecommendation } from "./branchStore";

/**
 * KC-3 (16 Okt 2026) — penjalan Kepala Sekolah + Penambang Fakta + Penyaring Kebetulan/Pengawas Try-out.
 *  1. Kepala Sekolah: baca PILIHAN_BROKER (KC-1) + DAFTAR_DATA (KC-2), bekukan Pembagian Data
 *     (latih 60% · try-out 20% · ujian 20%, segel), simpan map PEMBAGIAN_DATA + Formulir R bila
 *     rentang data belum cukup.
 *  2. Penambang Fakta: bila Pembagian Data ada, pindai file M15 Common Files milik broker terpilih,
 *     saring HANYA bagian LATIH (segel ujian dijaga di sini, bukan di kc3Penambang.ts), tambang
 *     "Peringatan Badai jadi pemicu arah" (bahan pertama, diputuskan Fahmi 16 Okt 2026), simpan map
 *     POLA_CALON. Formulir R terpisah bila file M15 belum ada atau percobaan < 20 (belum cukup untuk
 *     Penyaring Kebetulan).
 *  3. Penyaring Kebetulan: bila percobaan cukup, saring pola yang tidak konsisten antar bulan LATIH
 *     atau tanpa keunggulan di atas titik impas. Lolos -> Pengawas Try-out menguji SEKALI di bagian
 *     TRY-OUT (saring/tryout tidak pernah mengintip bagian UJIAN). Lolos try-out -> POLA_CALON
 *     diperbarui + Formulir R "Pola Calon" ke Pusat. Gagal di langkah mana pun (dengan n cukup) ->
 *     Jalur Perbaikan (CatatanPerbaikan, diagnosis -> jalan A-E, lihat src/lib/kc3Perbaikan.ts).
 * HANYA MEMBACA map cabang lain + file MT5; tidak mengubah EA/skrip/.env; tidak mengirim order.
 */
export interface Kc3Run extends HasilKepalaSekolah {
  readonly broker: string;
  readonly rec: Recommendation | null;
  readonly tambang: HasilPenambangBadai | null;
  readonly tambangMasalah: string | null;
  readonly tambangRec: Recommendation | null;
  readonly saring: HasilSaring | null;
  readonly tryout: HasilTryout | null;
  readonly perbaikan: CatatanPerbaikan | null;
  readonly polaRec: Recommendation | null;
}

export class Kc3Error extends Error {}

/** File M15 (MDBKA_<simbol>_M15_LONG.csv) milik simbol broker terpilih, candle apa adanya (belum disaring ke bagian mana pun). Dipakai ulang KC-4. */
export function bacaM15(commonDir: string, simbolBroker: ReadonlySet<string>): Map<string, Candle[]> {
  const out = new Map<string, Candle[]>();
  if (!existsSync(commonDir)) return out;
  for (const name of readdirSync(commonDir)) {
    const m = /^MDBKA_(.+)_M15_LONG\.csv$/.exec(name);
    if (m !== null && simbolBroker.has(m[1] as string)) {
      out.set(m[1] as string, parseCsvCandles(readFileSync(join(commonDir, name), "utf8")).candles);
    }
  }
  return out;
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

/** Jumlah bahan/pola BERBEDA yang pernah ditambang KC-3 ("makin banyak dicoba, makin ketat" — §6a). */
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

/**
 * CatatanPerbaikan TERAKHIR untuk satu polaId (lama ke baru dari readAllHasil, ambil yang terakhir);
 * null = belum pernah dicatat. Dipakai untuk mendeteksi run ulang tanpa perubahan (lihat catatanBaruAtauLama()).
 */
function catatanTerakhir(dataDir: string, polaId: string): CatatanPerbaikan | null {
  const semua = readAllHasil(dataDir, "KC-3", "CATATAN_PERBAIKAN")
    .map((h) => h.data as CatatanPerbaikan | null)
    .filter((c): c is CatatanPerbaikan => c !== null && c.polaId === polaId);
  return semua.length === 0 ? null : (semua[semua.length - 1] as CatatanPerbaikan);
}

/**
 * Audit A-2 (16 Okt 2026): sebelum fix ini, SETIAP kali KC-3 dijalankan ulang pada pola yang masih
 * gagal dengan data yang SAMA, sistem mencatat satu "percobaan" Jalur Perbaikan baru — padahal belum
 * ada perbaikan logika apa pun yang benar-benar dicoba. Klik tombol "Jalankan" berkali-kali saat
 * debugging bisa menghabiskan MAX_PERCOBAAN (7) dan memaksa E_ARSIP dini. Fix: hanya catat percobaan
 * baru bila diagnosis (alasan) BERBEDA dari CatatanPerbaikan terakhir untuk pola ini; selain itu, pakai
 * ulang catatan lama (tidak menulis map baru, tidak menaikkan hitungan percobaan).
 */
function catatanBaruAtauLama(dataDir: string, polaId: string, tahap: TahapPerbaikan, alasan: string, now: Date): CatatanPerbaikan {
  const sebelumnya = catatanTerakhir(dataDir, polaId);
  if (sebelumnya !== null && sebelumnya.diagnosis === alasan) return sebelumnya;
  const percobaanKe = hitungPercobaanKe(dataDir, polaId);
  const catatan = catatanPerbaikan(polaId, percobaanKe, tahap, alasan);
  saveHasil(dataDir, "KC-3", "CATATAN_PERBAIKAN", catatan, now);
  return catatan;
}

/**
 * Formulir R yang judulnya identik dan BELUM final diputuskan Pusat (MENUNGGU/DITUNDA) — hindari kirim
 * dobel saat tombol "Jalankan" diklik berulang dengan data yang belum berubah (audit A-2, selaras pola
 * idempoten KC-5). Bila Pusat sudah SETUJU/TOLAK Formulir R lama, masalah yang masih berlanjut boleh
 * mendapat Formulir R baru (keputusan lama tidak ditimpa, hanya tidak menghalangi laporan berikutnya).
 */
function formulirPendingSerupa(dataDir: string, judul: string): Recommendation | null {
  const ada = readBranch(dataDir, "KC-3").find((x) => x.rec.judul === judul && (recommendationStatus(x.decisions) === "MENUNGGU" || recommendationStatus(x.decisions) === "DITUNDA"));
  return ada?.rec ?? null;
}

function formulirTambang(broker: string, teks: string, tanggal: string): RecommendationInput {
  return {
    judul: `Penambang Fakta KC-3 (${broker}): BADAI belum bisa ditambang`,
    fakta: [{ teks, sumber: `Penambang Fakta KC-3 ${tanggal}` }],
    batasData: "Hanya file M15 Common Files milik broker terpilih, bagian LATIH saja (sebelum batas try-out).",
    usulan: "Jalankan skrip ExportLongH1MDBKA di MT5 broker terpilih dengan InpPeriod=M15 agar ada file *_M15_LONG.csv, lalu jalankan ulang KC-3.",
    risiko: "Tidak mengubah data, tidak mengirim order; hanya menandai tambang BADAI belum bisa jalan / belum cukup percobaan.",
  };
}

export function runKc3(opts: { readonly dataDir: string; readonly commonDir: string; readonly now: Date }): Kc3Run {
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

  let tambang: HasilPenambangBadai | null = null;
  let tambangMasalah: string | null = null;
  let tambangRec: Recommendation | null = null;
  let saring: HasilSaring | null = null;
  let tryout: HasilTryout | null = null;
  let perbaikan: CatatanPerbaikan | null = null;
  let polaRec: Recommendation | null = null;
  const split = hasil.split;
  if (split !== null) {
    const simbolBroker = new Set(files.map((f) => f.simbol));
    const m15 = bacaM15(opts.commonDir, simbolBroker);
    if (m15.size === 0) {
      tambangMasalah = `Tidak ada file M15 (MDBKA_<simbol>_M15_LONG.csv) untuk ${simbolBroker.size} simbol broker ${broker}.`;
    } else {
      const latihBySimbol = saringBySimbol(m15, split.dari, split.latihSampai);
      tambang = tambangBadai(latihBySimbol);
      const pola: PolaCalon = polaBadai(tambang);
      saveHasil(opts.dataDir, "KC-3", "POLA_CALON", pola, opts.now);
      if (tambang.n < BADAI_MIN_TRADE) {
        tambangMasalah = `Hanya ${tambang.n} percobaan BADAI di bagian LATIH (kurang dari ${BADAI_MIN_TRADE}); belum cukup untuk Penyaring Kebetulan.`;
      } else {
        // Penyaring Kebetulan: pola harus konsisten di setiap bulan LATIH + lolos titik impas (§6a).
        const bulanLatih = bulanRentang(split.dari, split.latihSampai);
        const jumlahPola = hitungJumlahPolaPernahDitambang(opts.dataDir);
        saring = saringKebetulan(tambang.trades, bulanLatih, jumlahPola);
        if (saring.status === "LOLOS") {
          // Pengawas Try-out: uji SEKALI di bagian TRY-OUT, belum pernah diintip sebelumnya.
          const tryoutBySimbol = saringBySimbol(m15, split.latihSampai, split.tryoutSampai);
          tryout = pengawasTryout(tambangBadai(tryoutBySimbol).trades);
          if (tryout.lolos) {
            saveHasil(opts.dataDir, "KC-3", "POLA_CALON", { ...pola, tryout: { n: tryout.n, rataR: tryout.rataR } }, opts.now);
            const formPola = formulirPolaCalon(pola, tryout, broker, tanggal);
            polaRec = formulirPendingSerupa(opts.dataDir, formPola.judul) ?? saveRecommendation(opts.dataDir, "KC-3", formPola, opts.now);
          } else {
            perbaikan = catatanBaruAtauLama(opts.dataDir, pola.id, "TRYOUT_GAGAL", tryout.alasan, opts.now);
          }
        } else if (saring.status === "GAGAL" && saring.sebab !== undefined) {
          perbaikan = catatanBaruAtauLama(opts.dataDir, pola.id, saring.sebab, saring.alasan, opts.now);
        }
      }
    }
    if (tambangMasalah !== null) {
      const formTambang = formulirTambang(broker, tambangMasalah, tanggal);
      tambangRec = formulirPendingSerupa(opts.dataDir, formTambang.judul) ?? saveRecommendation(opts.dataDir, "KC-3", formTambang, opts.now);
    }
  }

  return { broker, ...hasil, rec, tambang, tambangMasalah, tambangRec, saring, tryout, perbaikan, polaRec };
}
