/**
 * Tahap 4A — preset instrumen OrbiTraderBerjangka (isolated, DATA ONLY).
 *
 * - Satu-satunya sumber data spesifikasi OTB terverifikasi.
 * - BELUM di-wire ke applyBrokerPreset/validator/registry
 *   (wiring = Tahap 4B). Modul ini tidak mengubah perilaku runtime apa pun.
 * - Hanya simbol dengan data Specification terverifikasi yang terdaftar;
 *   simbol lain mengembalikan null (tanpa angka fiktif, tanpa salinan Finex).
 * - Simbol OTB dicocokkan EXACT (suffiks seperti _ORB signifikan);
 *   JANGAN dinormalisasi via normalizeSymbol (itu akan memangkas
 *   "GBPUSD_ORB" menjadi "GBPUSD" milik Finex).
 * - Bid/Ask transient (data pasar) SENGAJA tidak disimpan di preset.
 */

export type OtbSpreadMode = "floating" | "fixed";

export type OtbCalculationMode = "Forex" | "CFD" | "Futures";

export interface OtbCommission {
  readonly volumeMin: number;
  readonly volumeMax: number;
  readonly pricePerLot: number;
}

export interface OtbInstrumentProfile {
  readonly symbol: string;
  readonly digits: number;
  readonly contractSize: number;
  readonly spreadMode: OtbSpreadMode;
  /** Stops level sesuai satuan Specification (points). */
  readonly stopsLevel: number;
  /** Minimum OTB. Jangan paksa di bawah nilai ini saat wiring. */
  readonly minVolume: number;
  readonly maxVolume: number;
  readonly volumeStep: number;
  /** Diinferensi dari digits=5 (standar Forex); verifikasi ulang bila ragu. */
  readonly tickSize: number;
  /** null = TBD; hitung via calculateOtbTickValue (bukan hardcoded). */
  readonly tickValue: number | null;
  /** TERPISAH dari tick calculation. */
  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly hedgedMargin: number;
  readonly currencyProfit: string;
  readonly currencyMargin: string;
  readonly calculationMode: OtbCalculationMode;
  readonly commission: OtbCommission | null;
  /** Swap dalam persen sesuai Specification. */
  readonly swapLong: number | null;
  /** Swap dalam persen sesuai Specification. */
  readonly swapShort: number | null;
}

function freezeOtbProfile(
  profile: OtbInstrumentProfile
): OtbInstrumentProfile {
  if (profile.commission !== null) {
    Object.freeze(profile.commission);
  }
  return Object.freeze(profile);
}

/**
 * Preset OTB terverifikasi dari Specification (per 02 Okt 2026).
 * Kunci = nama simbol OTB persis (case-sensitive).
 */
export const OTB_PRESETS: Record<string, OtbInstrumentProfile> =
  Object.freeze({
    GBPUSD_ORB: freezeOtbProfile({
      symbol: "GBPUSD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: null,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "USD",
      currencyMargin: "USD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapLong: -2.25,
      swapShort: -0.75,
    }),
  });

/**
 * Mengambil preset OTB terverifikasi, atau null bila simbol belum
 * terverifikasi (termasuk nama simbol Finex — tanpa kontaminasi silang).
 */
export function getOtbInstrumentProfile(
  symbol: string
): OtbInstrumentProfile | null {
  return OTB_PRESETS[symbol] ?? null;
}

/**
 * Tick value turunan untuk mode Forex: tickSize * contractSize.
 * GBPUSD_ORB: 0.00001 * 100000 = 1.00 USD per tick per lot.
 * Murni (tidak membaca/menulis state); dipakai saat wiring Tahap 4B.
 */
export function calculateOtbTickValue(
  profile: OtbInstrumentProfile
): number {
  return profile.tickSize * profile.contractSize;
}
