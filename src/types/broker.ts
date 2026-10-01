import type { InstrumentProfile } from "../lib/instrumentConfig";

/**
 * Tahap 2 — fondasi tipe broker terisolasi.
 *
 * Aturan tahap ini:
 * - Finex tetap broker default; tidak ada dropdown broker.
 * - Tidak mengubah UI, parser OCR/CSV, decision engine, rumus risiko,
 *   preset Finex, maupun hasil analisis Finex.
 * - Profil OrbiTraderBerjangka hanya terdaftar (belum aktif di runtime)
 *   tanpa angka preset fiktif.
 */

/** Identitas broker yang didukung. Finex adalah default. */
export type BrokerId = "finex" | "orbitraderberjangka";

/**
 * Preset instrumen per broker.
 * Alias read-only ke InstrumentProfile milik instrumentConfig agar tidak
 * ada duplikasi tipe dan tidak ada objek Finex kedua dengan nilai beda.
 */
export type BrokerInstrumentPreset = InstrumentProfile;

/** Profil statis satu broker di registry. Semua field read-only. */
export interface BrokerProfile {
  readonly id: BrokerId;
  readonly label: string;
  /**
   * Koleksi preset instrumen broker.
   * OrbiTraderBerjangka memakai koleksi kosong sampai spesifikasi
   * resmi diverifikasi (tanpa angka fiktif).
   */
  readonly instruments: readonly BrokerInstrumentPreset[];
  readonly note: string;
}

/**
 * Konteks broker minimal untuk satu simbol.
 * - brokerSymbol menyimpan nama simbol asli (tidak dinormalisasi).
 * - instrumentFamily opsional menyimpan keluarga instrumen bila tersedia.
 * Belum dipaksakan ke MarketData pada tahap ini.
 */
export interface BrokerContext {
  readonly brokerId: BrokerId;
  readonly brokerSymbol: string;
  readonly instrumentFamily?: string;
}
