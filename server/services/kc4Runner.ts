import { recommendationStatus, type Recommendation } from "../../src/lib/branchOffice";
import type { PembagianData, PolaCalon } from "../../src/lib/branchArchitecture";
import { DATA_CUKUP_HARI } from "../../src/lib/kc1Assessment";
import { formulirVonis, ujiK1K7, type HasilK1K7, type VonisUjian } from "../../src/lib/kc4Kepala";
import { auditTrade, type HasilAuditor } from "../../src/lib/kc4Auditor";
import { tambangBadai } from "../../src/lib/kc3Penambang";
import { bacaM15, saringBySimbol } from "./kc3Runner";
import { readAllHasil, readBranch, readLatestHasil, saveHasil, saveRecommendation } from "./branchStore";

/**
 * KC-4 (16 Okt 2026) — penjalan Kepala Ruang Ujian & Penguji Data Lama + Auditor Trade (lampu 1 saja;
 * lampu 2/3 belum dibangun — butuh trade demo/live nyata berjalan, bukan data historis).
 * Syarat jalan: (1) rentang data bersama Pembagian Data KC-3 >= DATA_CUKUP_HARI (365 hari, HARD-GATE
 * sejak audit A-2 16 Okt 2026 atas keputusan Fahmi — sebelumnya cuma advisory); (2) Pola Calon KC-3
 * sudah ada DAN Formulir R "lolos try-out"-nya sudah DISETUJUI Pusat; (3) pola ini belum pernah diuji
 * KC-4 sebelumnya (satu pola, satu kali uji — gagal = gugur).
 * Uji di bagian UJIAN bersegel (hanya KC-4 yang boleh membaca), memakai mesin tambang yang SAMA dengan
 * Penambang Fakta KC-3 (tambangBadai, kc3Penambang.ts): kriteria K1-K7 (kc4Kepala.ts) DAN Auditor
 * Trade (kc4Auditor.ts) — LULUS hanya bila KEDUANYA lolos (gerbang terpisah, bukan digabung jadi satu).
 * HANYA MEMBACA map cabang lain + file MT5; tidak mengubah EA/skrip/.env; tidak mengirim order.
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

export function runKc4(opts: { readonly dataDir: string; readonly commonDir: string; readonly now: Date }): Kc4Run {
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

  const polaHasil = readLatestHasil(opts.dataDir, "KC-3", "POLA_CALON");
  const pola = polaHasil?.data as PolaCalon | null | undefined;
  if (pola === null || pola === undefined) throw new Kc4Error("Belum ada Pola Calon KC-3 untuk diuji.");

  const judulLolos = `Pola Calon KC-3 lolos try-out: ${pola.id}`;
  const disetujui = readBranch(opts.dataDir, "KC-3").some((x) => x.rec.judul === judulLolos && recommendationStatus(x.decisions) === "DISETUJUI");
  if (!disetujui) throw new Kc4Error(`Pola Calon "${pola.id}" belum disetujui Pusat (Formulir R "${judulLolos}" belum SETUJU).`);

  const sudahDiuji = readAllHasil(opts.dataDir, "KC-4", "VONIS_UJIAN").some((h) => (h.data as { polaId?: unknown } | null)?.polaId === pola.id);
  if (sudahDiuji) throw new Kc4Error(`Pola Calon "${pola.id}" sudah pernah diuji KC-4 — satu pola hanya diuji SEKALI (gagal = gugur, lulus = tidak diuji ulang).`);

  const m15 = bacaM15(opts.commonDir, simbolBroker);
  const ujianBySimbol = saringBySimbol(m15, split.ujianDari, split.sampai);
  const latihBySimbol = saringBySimbol(m15, split.dari, split.latihSampai);
  const ujian = tambangBadai(ujianBySimbol);
  const latih = tambangBadai(latihBySimbol);

  const k1k7 = ujiK1K7(ujian.trades, latih.trades, split.ujianDari, split.sampai);
  const auditor = auditTrade(ujian.trades);
  const vonis: VonisUjian = k1k7.lulus && !auditor.tolak ? "LULUS" : "GAGAL";
  const tanggal = opts.now.toISOString().slice(0, 10);
  saveHasil(opts.dataDir, "KC-4", "VONIS_UJIAN", { polaId: pola.id, broker, k1k7, auditor, vonis }, opts.now);
  const rec = saveRecommendation(opts.dataDir, "KC-4", formulirVonis(pola.id, broker, k1k7, auditor, vonis, tanggal), opts.now);

  return { broker, polaId: pola.id, k1k7, auditor, vonis, rec };
}
