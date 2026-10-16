import { join } from "node:path";
import { recommendationStatus, type Recommendation } from "../../src/lib/branchOffice";
import type { BrokerId } from "../../src/types/broker";
import type { ExchangeRates } from "../../src/services/fxRateService";
import type { PembagianData, PolaCalon } from "../../src/lib/branchArchitecture";
import { DATA_CUKUP_HARI } from "../../src/lib/kc1Assessment";
import { formulirVonis, ujiK1K7, type HasilK1K7, type VonisUjian } from "../../src/lib/kc4Kepala";
import { auditTrade, type HasilAuditor } from "../../src/lib/kc4Auditor";
import { bahanById } from "../../src/lib/kc3BahanRegistry";
import { bacaBahan, resolveBiaya, saringBySimbol } from "./kc3Runner";
import { readAllHasil, readBranch, readLatestHasil, saveHasil, saveRecommendation } from "./branchStore";

/**
 * KC-4 (16 Okt 2026, digeneralisasi A-3) — penjalan Kepala Ruang Ujian & Penguji Data Lama + Auditor
 * Trade (lampu 1 saja; lampu 2/3 belum dibangun — butuh trade demo/live nyata berjalan, bukan data
 * historis).
 * Syarat jalan: (1) rentang data bersama Pembagian Data KC-3 >= DATA_CUKUP_HARI (365 hari, HARD-GATE
 * sejak audit A-2 16 Okt 2026 atas keputusan Fahmi — sebelumnya cuma advisory); (2) ADA Pola Calon KC-3
 * (bahan mana pun di kc3BahanRegistry.ts — Badai/M-1/P-1/F-1) yang Formulir R "lolos try-out"-nya sudah
 * DISETUJUI Pusat DAN belum pernah diuji KC-4 (satu pola, satu kali uji — gagal = gugur; banyak bahan
 * bisa disetujui bersamaan sejak A-3, jadi dicari yang PALING LAMA menunggu & belum diuji, bukan asal
 * "map POLA_CALON terbaru" yang sejak A-3 bisa milik bahan mana saja).
 * Uji di bagian UJIAN bersegel (hanya KC-4 yang boleh membaca), memakai mesin tambang yang SAMA dengan
 * bahan yang menghasilkan pola itu (kc3BahanRegistry.ts, bukan selalu Badai lagi): kriteria K1-K7
 * (kc4Kepala.ts) DAN Auditor Trade (kc4Auditor.ts) — LULUS hanya bila KEDUANYA lolos (gerbang terpisah).
 * HANYA MEMBACA map cabang lain + file MT5 + config/kc1-fakta-broker.json; tidak mengubah EA/skrip/.env;
 * tidak mengirim order.
 */
export interface Kc4Run {
  readonly broker: string;
  readonly polaId: string;
  readonly k1k7: HasilK1K7;
  readonly auditor: HasilAuditor;
  readonly vonis: VonisUjian;
  readonly rec: Recommendation;
}

export class Kc4Error extends Error {}

type CariPolaHasil =
  | { readonly status: "SIAP"; readonly pola: PolaCalon }
  | { readonly status: "SUDAH_DIUJI"; readonly polaId: string }
  | { readonly status: "BELUM_ADA" };

/** Pola Calon mana pun (bahan apa pun) yang Formulir R "lolos try-out"-nya SUDAH DISETUJUI Pusat DAN belum diuji KC-4 — paling lama menunggu dipilih lebih dulu. */
function cariPolaSiapUji(dataDir: string): CariPolaHasil {
  const semua = readAllHasil(dataDir, "KC-3", "POLA_CALON")
    .map((h) => h.data as PolaCalon | null)
    .filter((p): p is PolaCalon => p !== null);
  const terbaruPerId = new Map<string, PolaCalon>();
  for (const p of semua) terbaruPerId.set(p.id, p); // readAllHasil lama -> baru, terakhir per id menang
  const kc3Recs = readBranch(dataDir, "KC-3");
  const vonisAda = new Set(
    readAllHasil(dataDir, "KC-4", "VONIS_UJIAN")
      .map((h) => (h.data as { polaId?: unknown } | null)?.polaId)
      .filter((id): id is string => typeof id === "string"),
  );
  let disetujuiTapiSudahDiuji: string | null = null;
  for (const p of terbaruPerId.values()) {
    const judul = `Pola Calon KC-3 lolos try-out: ${p.id}`;
    const disetujui = kc3Recs.some((x) => x.rec.judul === judul && recommendationStatus(x.decisions) === "DISETUJUI");
    if (!disetujui) continue;
    if (vonisAda.has(p.id)) {
      disetujuiTapiSudahDiuji = p.id;
      continue;
    }
    return { status: "SIAP", pola: p };
  }
  return disetujuiTapiSudahDiuji !== null ? { status: "SUDAH_DIUJI", polaId: disetujuiTapiSudahDiuji } : { status: "BELUM_ADA" };
}

export function runKc4(opts: {
  readonly dataDir: string;
  readonly commonDir: string;
  readonly now: Date;
  readonly faktaFile?: string;
  readonly rates?: ExchangeRates | null;
}): Kc4Run {
  const pilihan = readLatestHasil(opts.dataDir, "KC-1", "PILIHAN_BROKER");
  const pilihanData = pilihan?.data as { broker?: unknown } | null | undefined;
  const broker = typeof pilihanData?.broker === "string" ? pilihanData.broker : null;
  if (broker === null) throw new Kc4Error("Belum ada broker terpilih dari KC-1 (map PILIHAN_BROKER disetujui Pusat).");

  const daftar = readLatestHasil(opts.dataDir, "KC-2", "DAFTAR_DATA");
  const daftarData = daftar?.data as { broker?: unknown; files?: unknown } | null | undefined;
  if (daftarData?.broker !== broker || !Array.isArray(daftarData.files)) {
    throw new Kc4Error("Belum ada DAFTAR_DATA KC-2 untuk broker terpilih (jalankan pemeriksaan KC-2 dulu).");
  }
  const simbolBroker = new Set((daftarData.files as readonly { simbol?: unknown }[]).map((f) => f.simbol).filter((s): s is string => typeof s === "string"));

  const pembagian = readLatestHasil(opts.dataDir, "KC-3", "PEMBAGIAN_DATA");
  const split = pembagian?.data as (PembagianData & { readonly hariBersama?: number | null }) | null | undefined;
  if (split === null || split === undefined) throw new Kc4Error("Belum ada Pembagian Data KC-3 (jalankan KC-3 dulu).");
  // Audit A-2 (16 Okt 2026): ambang DATA_CUKUP_HARI sebelumnya hanya advisory (Formulir R info) —
  // Pusat bisa SETUJU Pola Calon meski rentang data pendek, lalu KC-4 tetap menguji dengan sampel UJIAN
  // yang terlalu kecil untuk K1-K7 dipercaya. Atas keputusan Fahmi, sekarang hard-gate: KC-4 menolak
  // jalan (bukan cuma mengingatkan) selama rentang bersama < DATA_CUKUP_HARI (365 hari).
  if (split.hariBersama === undefined || split.hariBersama === null || split.hariBersama < DATA_CUKUP_HARI) {
    const berapa = split.hariBersama === undefined || split.hariBersama === null ? "tidak diketahui" : `hanya ${Math.round(split.hariBersama)} hari`;
    throw new Kc4Error(`Rentang data bersama ${berapa} (kurang dari ${DATA_CUKUP_HARI}); KC-4 tidak boleh menguji sampai KC-2 punya data H1 lebih panjang dan KC-3 dijalankan ulang.`);
  }

  const cari = cariPolaSiapUji(opts.dataDir);
  if (cari.status === "SUDAH_DIUJI") {
    throw new Kc4Error(`Pola Calon "${cari.polaId}" sudah pernah diuji KC-4 — satu pola hanya diuji SEKALI (gagal = gugur, lulus = tidak diuji ulang).`);
  }
  if (cari.status === "BELUM_ADA") {
    throw new Kc4Error('Tidak ada Pola Calon KC-3 (bahan mana pun) yang Formulir R "lolos try-out"-nya sudah DISETUJUI Pusat dan belum diuji KC-4.');
  }
  const pola = cari.pola;

  const bahan = bahanById(pola.id);
  if (bahan === null) throw new Kc4Error(`Pola Calon "${pola.id}" bukan bahan yang terdaftar (kc3BahanRegistry.ts) — tidak tahu mesin tambang mana yang dipakai.`);

  const brokerId = broker as BrokerId;
  const faktaFile = opts.faktaFile ?? join(process.cwd(), "config", "kc1-fakta-broker.json");
  const rates = opts.rates ?? null;
  const biaya = resolveBiaya(opts.commonDir, faktaFile, brokerId, rates);
  const tambangOpts = { spread: biaya.spread, pointValueUsd: biaya.pointValueUsd, komisiUsdPerLot: biaya.komisiUsdPerLot, brokerId, fxRates: rates };

  const raw = bacaBahan(opts.commonDir, simbolBroker, bahan);
  const ujianBySimbol = saringBySimbol(raw, split.ujianDari, split.sampai);
  const latihBySimbol = saringBySimbol(raw, split.dari, split.latihSampai);
  const ujian = bahan.tambang({ bySimbol: ujianBySimbol, ...tambangOpts });
  const latih = bahan.tambang({ bySimbol: latihBySimbol, ...tambangOpts });

  const k1k7 = ujiK1K7(ujian.trades, latih.trades, split.ujianDari, split.sampai);
  const auditor = auditTrade(ujian.trades);
  const vonis: VonisUjian = k1k7.lulus && !auditor.tolak ? "LULUS" : "GAGAL";
  const tanggal = opts.now.toISOString().slice(0, 10);
  saveHasil(opts.dataDir, "KC-4", "VONIS_UJIAN", { polaId: pola.id, broker, k1k7, auditor, vonis }, opts.now);
  const rec = saveRecommendation(opts.dataDir, "KC-4", formulirVonis(pola.id, broker, k1k7, auditor, vonis, tanggal), opts.now);

  return { broker, polaId: pola.id, k1k7, auditor, vonis, rec };
}
