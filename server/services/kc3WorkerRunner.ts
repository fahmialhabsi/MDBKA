/**
 * Jalankan bahan.tambang() milik satu bahan KC-3 di worker_threads terpisah — dipakai HANYA untuk
 * bahan beratDiThreadTerpisah (kc3BahanRegistry.ts; saat ini F-1 Pencari Fakta). Audit A-3 lanjutan
 * (17 Okt 2026): F-1 terbukti membekukan SELURUH event loop backend >4,5 menit bila dipanggil
 * langsung di thread utama (lihat catatan di kc3BahanRegistry.ts). Worker di sini memindahkan CPU
 * berat itu ke thread lain -- thread utama (dan request lain: live quotes/equity, endpoint lain)
 * tetap responsif selama menunggu.
 *
 * Path worker disesuaikan otomatis dev (tsx) vs produksi/test (sudah dikompilasi tsc ke .js,
 * dijalankan node polos, tanpa dependency tsx sama sekali di produksi).
 *
 * Dev (tsx) menunjuk ke kc3BahanWorkerEntry.mjs (BUKAN kc3BahanWorker.ts langsung): dicoba dulu
 * lewat execArgv ["--import","tsx/esm"] seperti dokumentasi https://tsx.is/node-worker, tapi
 * TERBUKTI GAGAL nyata saat verifikasi live ("Unknown file extension '.ts'" -- execArgv worker
 * TIDAK benar-benar mendaftarkan hook ESM tsx di dalam worker-nya sendiri, walau tidak dilarang
 * worker_threads). Perbaikan yang terbukti jalan (diverifikasi langsung): bootstrap .mjs polos yang
 * MENDAFTARKAN loader dari DALAM worker lewat tsx/esm/api.register() sebelum meng-import file .ts
 * sesungguhnya -- lihat kc3BahanWorkerEntry.mjs.
 *
 * TIDAK pakai import.meta.url (proyek ini mengompilasi server/** dengan "module": "CommonJS" --
 * tsconfig.server.json & tsconfig.test.json -- yang menolak sintaks import.meta sama sekali saat
 * kompilasi, TS1343) dan TIDAK pakai __dirname/__filename langsung (package.json "type":"module"
 * membuat tsx TIDAK mem-polyfill keduanya untuk modul yang di-import -- hanya undefined, dicoba &
 * terbukti gagal nyata saat verifikasi live sebelum fix ini). __dirname AMAN dipakai HANYA di
 * cabang CommonJS terkompilasi (native, bukan polyfill) lewat typeof-guard; cabang dev (tsx) pakai
 * process.cwd() -- pola yang SUDAH dipakai kc3Runner.ts/kc4Runner.ts untuk faktaFile default, dan
 * selalu root proyek untuk semua skrip npm proyek ini (dev/test/start dijalankan dari root).
 */
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import type { BahanDefinisi, BahanTambangOpts } from "../../src/lib/kc3BahanRegistry";
import type { HasilTambangBahan } from "../../src/lib/kc3BahanShared";

const SUDAH_DIKOMPILASI = typeof __dirname !== "undefined";
const WORKER_PATH = SUDAH_DIKOMPILASI
  ? join(__dirname, "..", "workers", "kc3BahanWorker.js")
  : join(process.cwd(), "server", "workers", "kc3BahanWorkerEntry.mjs");

function tambangDiThread(bahanId: string, opts: BahanTambangOpts): Promise<HasilTambangBahan> {
  return new Promise((resolve, reject) => {
    let selesai = false;
    const worker = new Worker(WORKER_PATH, { workerData: { bahanId, opts } });
    worker.once("message", (hasil: HasilTambangBahan) => {
      selesai = true;
      resolve(hasil);
      void worker.terminate();
    });
    worker.once("error", (err) => {
      if (selesai) return;
      selesai = true;
      reject(err);
    });
    worker.once("exit", (code) => {
      if (selesai) return;
      selesai = true;
      reject(new Error(`Worker bahan "${bahanId}" keluar (kode ${code}) sebelum mengirim hasil.`));
    });
  });
}

/** Jalankan tambang satu bahan — di worker_threads bila beratDiThreadTerpisah, langsung di thread utama bila tidak. SELALU async (uniform untuk pemanggil). */
export async function jalankanTambang(bahan: BahanDefinisi, opts: BahanTambangOpts): Promise<HasilTambangBahan> {
  if (bahan.beratDiThreadTerpisah === true) return tambangDiThread(bahan.id, opts);
  return bahan.tambang(opts);
}
