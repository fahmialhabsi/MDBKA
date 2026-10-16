import { join } from "node:path";
import type { Recommendation } from "../../src/lib/branchOffice";
import type { LampCard } from "../../src/lib/greenLamps";
import {
  formulirLampu2,
  susunRangkaianDemo,
  type DemoAkunInput,
  type DemoDecision,
  type RangkaianDemo,
} from "../../src/lib/kc4PengawasDemo";
import { cardsForAccount, collectAccountEvaluations, entryDecisions, makeCandlesOf, parseAccountLabels } from "../routes/evaluationRoutes";
import { readBranch, readLatestHasil, saveHasil, saveRecommendation } from "./branchStore";
import { Kc4Error } from "./kc4Runner";

/**
 * KC-4 Pengawas Demo (17 Okt 2026) — serah-terima hasil trade akun demo ke Kantor Cabang (lampu 2).
 * Membaca HASIL yang sudah dicatat tim lama (History MT5 + catatan entry + kartu pola), bukan
 * menghitung ulang: status lampu 2 dari lampRows() (greenLamps.ts). Menyimpan map RANGKAIAN_DEMO
 * (rekap + lampu 2 per golongan) dan mengirim Formulir R ke Pusat bila lampu 2 sudah punya vonis
 * (HIJAU/MERAH) dengan bukti yang berbeda dari laporan sebelumnya. Tidak mengirim order, tidak mengubah
 * Buku Aturan.
 */
export interface Kc4DemoRun {
  readonly rangkaian: RangkaianDemo;
  readonly formulir: readonly Recommendation[];
}

/** Inti (testable): simpan map + kirim Formulir R — masukan sudah terkumpul. */
export function simpanPengawasDemo(opts: {
  readonly dataDir: string;
  readonly now: Date;
  readonly broker: string;
  readonly akun: readonly DemoAkunInput[];
  readonly keputusan: ReadonlyMap<string, DemoDecision>;
  readonly lampCards: readonly LampCard[];
}): Kc4DemoRun {
  const rangkaian = susunRangkaianDemo({ broker: opts.broker, akun: opts.akun, keputusan: opts.keputusan, lampCards: opts.lampCards });
  saveHasil(opts.dataDir, "KC-4", "RANGKAIAN_DEMO", rangkaian, opts.now);
  const tanggal = opts.now.toISOString().slice(0, 10);
  const formulir: Recommendation[] = [];
  for (const baris of rangkaian.lampu2) {
    const form = formulirLampu2(opts.broker, baris, tanggal);
    if (form === null) continue;
    // Bukti identik sudah pernah dilaporkan (judul + angka lampu sama) -> jangan kirim dobel, apa pun status keputusannya.
    const sudah = readBranch(opts.dataDir, "KC-4").some((x) => x.rec.judul === form.judul && x.rec.fakta[0]?.teks === form.fakta[0]?.teks);
    if (!sudah) formulir.push(saveRecommendation(opts.dataDir, "KC-4", form, opts.now));
  }
  return { rangkaian, formulir };
}

/** Penjalan penuh: broker terpilih KC-1 -> kumpulkan akun demo broker itu dari History MT5 -> simpan + Formulir R. */
export function runKc4Demo(opts: {
  readonly dataDir: string;
  readonly commonDir: string;
  readonly now: Date;
  readonly labels?: Record<string, string>;
}): Kc4DemoRun {
  const pilihan = readLatestHasil(opts.dataDir, "KC-1", "PILIHAN_BROKER");
  const pilihanData = pilihan?.data as { broker?: unknown } | null | undefined;
  const broker = typeof pilihanData?.broker === "string" ? pilihanData.broker : null;
  if (broker === null) throw new Kc4Error("Belum ada broker terpilih dari KC-1 (map PILIHAN_BROKER disetujui Pusat).");

  const tradesDir = join(opts.dataDir, "trades");
  const labels = opts.labels ?? parseAccountLabels(process.env?.["ACCOUNT_LABELS"]);
  const evaluasi = collectAccountEvaluations(opts.commonDir, tradesDir, labels).filter((a) => a.broker === broker);
  const candlesOf = makeCandlesOf(opts.commonDir);
  const akun: DemoAkunInput[] = evaluasi.map((a) => ({ login: a.login, label: a.label, mataUang: a.currency, trades: a.evaluation.trades }));
  const lampCards = evaluasi.flatMap((a) => cardsForAccount(a, opts.dataDir, candlesOf).lampCards);
  return simpanPengawasDemo({ dataDir: opts.dataDir, now: opts.now, broker, akun, keputusan: entryDecisions(opts.dataDir, broker as Parameters<typeof entryDecisions>[1]), lampCards });
}
