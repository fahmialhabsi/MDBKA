// Bootstrap KHUSUS dev (tsx) untuk worker_threads kc3BahanWorker.ts — SENGAJA .mjs polos (bukan .ts,
// tidak dikompilasi tsc): worker_threads TIDAK mewarisi loader tsx lewat execArgv (dicoba & gagal
// nyata, "Unknown file extension .ts" -- execArgv tidak mendaftarkan hook ESM di dalam worker).
// Solusi resmi tsx untuk kasus ini: daftarkan loadernya sendiri dari DALAM worker lewat
// tsx/esm/api sebelum mengimpor file .ts yang sesungguhnya (lihat https://tsx.is/node-worker).
// Produksi/test TIDAK memakai file ini sama sekali (sudah dikompilasi tsc ke .js biasa).
import { register } from "tsx/esm/api";

register();
await import("./kc3BahanWorker.ts");
