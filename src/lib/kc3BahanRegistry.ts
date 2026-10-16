/**
 * KC-3 Penambang Fakta — daftar BAHAN aktif (Badai + M-1/P-1/F-1, 16 Okt 2026). Satu titik rujukan
 * dipakai BERSAMA oleh kc3Runner.ts (tambang di LATIH/TRY-OUT) dan kc4Runner.ts (uji ulang di UJIAN
 * bersegel dengan mesin yang SAMA, per jabatan KC-4 "memakai mesin tambang yang SAMA dengan Penambang
 * Fakta KC-3" — lihat branchOffice.ts). MURNI.
 */
import type { BrokerId } from "../types/broker";
import type { ExchangeRates } from "../services/fxRateService";
import type { Candle } from "../calculations/swingDetector";
import type { PolaCalon } from "./branchArchitecture";
import { BADAI_MIN_TRADE, BADAI_POLA_ID, polaBadai, tambangBadai } from "./kc3Penambang";
import { MANCING_POLA_ID, polaMancing, tambangMancing } from "./kc3BahanMancing";
import { PETANI_POLA_ID, polaPetani, tambangPetani } from "./kc3BahanPetani";
import { FAKTA_POLA_ID, polaFakta, tambangFakta } from "./kc3BahanFakta";
import type { HasilTambangBahan } from "./kc3BahanShared";

/** Minimum percobaan sebelum Penyaring Kebetulan menilai (selaras semua bahan, bukan hanya Badai). */
export const BAHAN_MIN_TRADE = BADAI_MIN_TRADE;

export interface BahanTambangOpts {
  readonly bySimbol: ReadonlyMap<string, Candle[]>;
  /** Spread/pointValue/komisi per simbol (satuan harga/USD) — Badai mengabaikan (biaya 0, bawaan lama). */
  readonly spread: ReadonlyMap<string, number>;
  readonly pointValueUsd: ReadonlyMap<string, number>;
  readonly komisiUsdPerLot: ReadonlyMap<string, number>;
  readonly brokerId: BrokerId;
  readonly fxRates: ExchangeRates | null;
}

export interface BahanDefinisi {
  readonly id: string;
  readonly nama: string;
  /** M15 (Badai) atau H1 (M-1/P-1/F-1) — menentukan file Common Files mana yang dibaca penjalan. */
  readonly timeframe: "M15" | "H1";
  /** MURNI, selalu sinkron — pemanggil (kc3Runner/kc4Runner) yang memutuskan jalan di thread utama atau worker (lihat beratDiThreadTerpisah). */
  readonly tambang: (opts: BahanTambangOpts) => HasilTambangBahan;
  readonly bungkus: (hasil: HasilTambangBahan) => PolaCalon;
  /**
   * true HANYA untuk F-1 (audit A-3, 16-17 Okt 2026): tambangFakta() memindai ulang runBacktest()
   * PENUH per simbol secara sinkron dan terbukti membekukan SELURUH backend >4,5 menit saat diuji
   * nyata (curl ke endpoint lain ikut timeout). Dengan flag ini, kc3Runner/kc4Runner menjalankan
   * bahan.tambang() di worker_threads terpisah (server/workers/kc3BahanWorker.ts) alih-alih
   * memanggilnya langsung di thread utama -- CPU berat pindah ke thread lain, event loop utama
   * (dan live quotes/equity/request lain) tetap responsif selama F-1 menambang.
   */
  readonly beratDiThreadTerpisah?: boolean;
}

export const DAFTAR_BAHAN: readonly BahanDefinisi[] = [
  {
    id: BADAI_POLA_ID,
    nama: "Badai (arah)",
    timeframe: "M15",
    tambang: (o) => tambangBadai(o.bySimbol),
    bungkus: polaBadai,
  },
  {
    id: MANCING_POLA_ID,
    nama: "M-1 Mancing",
    timeframe: "H1",
    tambang: (o) => tambangMancing(o.bySimbol, o.spread, o.pointValueUsd, o.komisiUsdPerLot),
    bungkus: polaMancing,
  },
  {
    id: PETANI_POLA_ID,
    nama: "P-1 Petani Kebun",
    timeframe: "H1",
    tambang: (o) => tambangPetani(o.bySimbol, o.spread, o.pointValueUsd, o.komisiUsdPerLot),
    bungkus: polaPetani,
  },
  {
    id: FAKTA_POLA_ID,
    nama: "F-1 Pencari Fakta",
    timeframe: "H1",
    tambang: (o) => tambangFakta(o.bySimbol, o.brokerId, o.fxRates, o.spread, o.pointValueUsd, o.komisiUsdPerLot),
    bungkus: polaFakta,
    // Diaktifkan lagi 17 Okt 2026 (audit A-3 lanjutan) setelah kc3Runner/kc4Runner dibuat menjalankan
    // bahan ini di worker_threads (lihat beratDiThreadTerpisah di BahanDefinisi di atas) -- bukan lagi
    // disinkron di thread utama. Verifikasi live: backend TETAP merespon endpoint lain selama F-1
    // menambang (lihat catatan verifikasi di commit yang menambahkan flag ini).
    beratDiThreadTerpisah: true,
  },
];

export function bahanById(id: string): BahanDefinisi | null {
  return DAFTAR_BAHAN.find((b) => b.id === id) ?? null;
}
