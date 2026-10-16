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
  readonly tambang: (opts: BahanTambangOpts) => HasilTambangBahan;
  readonly bungkus: (hasil: HasilTambangBahan) => PolaCalon;
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
  // F-1 Pencari Fakta SENGAJA belum diaktifkan (audit A-3, 16 Okt 2026): terverifikasi di browser
  // dengan data nyata (81 simbol broker finex, ~763 hari) kalau sinyalSkorDariCandles() memindai ulang
  // runBacktest() PENUH per simbol secara sinkron -- backend sempat tidak merespon APA PUN (termasuk
  // live quotes/equity, dicek lewat curl) selama >4,5 menit untuk LATIH saja, belum TRY-OUT, dan masih
  // berjalan saat diputuskan dihentikan. Kode F-1 sudah benar & lolos test (805/806) dengan data kecil,
  // tapi BELUM aman dipakai sampai tambang() dijalankan di luar thread utama (worker_threads) atau
  // dijadwalkan non-blocking -- bukan sekadar "pelan", tapi membekukan SELURUH backend. Lihat
  // kc3BahanFakta.ts (cacheSinyal sudah menolong run ULANG, tidak menolong run PERTAMA).
  // Aktifkan lagi dengan menambahkan entri F-1 (lihat git history commit sebelum ini) setelah diperbaiki.
];

export function bahanById(id: string): BahanDefinisi | null {
  return DAFTAR_BAHAN.find((b) => b.id === id) ?? null;
}
