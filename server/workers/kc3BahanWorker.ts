/**
 * Worker generik untuk bahan KC-3 yang ditandai beratDiThreadTerpisah (kc3BahanRegistry.ts) — saat
 * ini hanya F-1 Pencari Fakta. Dijalankan SEKALI per panggilan (bukan pool/long-lived): terima
 * { bahanId, opts } lewat workerData, panggil bahan.tambang(opts) milik bahanId itu (dicari ulang
 * dari kc3BahanRegistry.ts yang SAMA, bukan salinan logika), postMessage hasilnya, lalu keluar
 * sendiri begitu tidak ada listener lagi (audit A-3 lanjutan, 17 Okt 2026).
 *
 * Dipicu oleh server/services/kc3WorkerRunner.ts — JANGAN di-import langsung dari thread utama
 * (jalan di dalam worker_threads, bukan modul biasa).
 */
import { parentPort, workerData } from "node:worker_threads";
import { bahanById, type BahanTambangOpts } from "../../src/lib/kc3BahanRegistry";

interface Kc3BahanWorkerInput {
  readonly bahanId: string;
  readonly opts: BahanTambangOpts;
}

function jalankan(): void {
  if (parentPort === null) throw new Error("kc3BahanWorker: harus dijalankan sebagai worker_threads, bukan modul biasa.");
  const { bahanId, opts } = workerData as Kc3BahanWorkerInput;
  const bahan = bahanById(bahanId);
  if (bahan === null) throw new Error(`kc3BahanWorker: bahan "${bahanId}" tidak terdaftar di kc3BahanRegistry.ts.`);
  const hasil = bahan.tambang(opts);
  parentPort.postMessage(hasil);
}

jalankan();
