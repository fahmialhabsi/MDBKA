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

export type OtbSwapType = "flat" | "percentage";

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
  readonly tickValue: number | null;  /** TERPISAH dari tick calculation. */
  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly hedgedMargin: number;
  readonly currencyProfit: string;
  readonly currencyMargin: string;
  /** Base currency simbol (terverifikasi dari Specification). */
  readonly contractCurrency: string;
  readonly calculationMode: OtbCalculationMode;
  readonly commission: OtbCommission | null;
  /** Tahap 5D-EXT1: jenis kalkulasi swap. "flat" = unit
   * profit-currency/lot/hari (3 verified); "percentage" = % per hari
   * dari nosional (contractSize × currentPrice), unit contract-base
   * currency (10 simbol baru). Fallback "flat" bila null/undefined. */
  readonly swapType: OtbSwapType | null;
  /** Nilai spec. Flat: unit profit-currency per lot per hari (per MT5
   * Specification, dikonfirmasi Tahap 5C-Step-2). Percentage: % per hari
   * (negatif = biaya, jangan dikali -1 lagi). Konversi FX menyusul
   * Tahap 5E. */
  readonly swapLong: number | null;
  /** Sama dengan swapLong (unit + sumber sama). */
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
 * Preset OTB terverifikasi dari Specification (per 02 Okt 2026),
 * cross-check ekspor CSV terminal OTB 03 Okt 2026 (Tahap 6E).
 *
 * Catatan data:
 * - tickValue tersimpan dalam PROFIT currency (nilainya sama dengan
 *   calculateOtbTickValue; cross-check di test). Konversi ke USD untuk
 *   pair non-USD-quote (AUDCAD, EURCHF) butuh rate — TBD tahap lanjut.
 *   (Kolom Tick_Value CSV memakai konvensi deposit-USD, mis. AUDCAD 0.70;
 *   bukan konflik, hanya konvensi berbeda.)
 * - Field AUDCAD_ORB/EURCHF_ORB terkonfirmasi CSV Tahap 6E (kolom baru
 *   03 Okt 2026): Stops_Level=20, Volume_Step=0.10, MaxVolume=10,
 *   margin 100000/100000/50000, Forex, profit=quote, margin=USD,
 *   komisi 33.00. spreadMode floating = default kelas (tidak ada di
 *   ekspor CSV, sama seperti 11 simbol lain).
 * - Komisi 33/lot dipertahankan (keputusan 6E); kolom Commission=0.00
 *   pada CSV dianggap tidak berlaku untuk akun ini.
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
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "USD",
      currencyMargin: "USD",
      contractCurrency: "GBP",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "flat",
      swapLong: -2.25,
      swapShort: -0.75,
    }),
    AUDCAD_ORB: freezeOtbProfile({
      symbol: "AUDCAD_ORB",
      digits: 5,
      contractSize: 100000,
      // CSV 6E: floating (default kelas; tidak ada di ekspor).
      spreadMode: "floating",
      // CSV 6E: Stops_Level=20 terkonfirmasi.
      stopsLevel: 20,
      minVolume: 0.1,
      // CSV 6E: maxVolume=10 terkonfirmasi.
      maxVolume: 10,
      // CSV 6E: Volume_Step=0.10 terkonfirmasi.
      volumeStep: 0.1,
      tickSize: 0.00001,
      // Nilai spec (unit profit currency, CAD); sama dengan kalkulator.
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "CAD",
      currencyMargin: "USD",
      contractCurrency: "AUD",
      calculationMode: "Forex",
      // CSV 6E: Commission 33.00 (0.01-1000 lot) terkonfirmasi.
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "flat",
      swapLong: -0.75,
      swapShort: -2.25,
    }),
    EURCHF_ORB: freezeOtbProfile({
      symbol: "EURCHF_ORB",
      digits: 5,
      contractSize: 100000,
      // CSV 6E: floating (default kelas; tidak ada di ekspor).
      spreadMode: "floating",
      // CSV 6E: Stops_Level=20 terkonfirmasi.
      stopsLevel: 20,
      minVolume: 0.1,
      // CSV 6E: maxVolume=10 terkonfirmasi.
      maxVolume: 10,
      // CSV 6E: Volume_Step=0.10 terkonfirmasi.
      volumeStep: 0.1,
      tickSize: 0.00001,
      // Nilai spec (unit profit currency, CHF); sama dengan kalkulator.
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "CHF",
      currencyMargin: "USD",
      contractCurrency: "EUR",
      calculationMode: "Forex",
      // CSV 6E: Commission 33.00 (0.01-1000 lot) terkonfirmasi.
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "flat",
      swapLong: -1.75,
      swapShort: -1.25,
    }),
    AUDCHF_ORB: freezeOtbProfile({
      symbol: "AUDCHF_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "CHF",
      currencyMargin: "USD",
      contractCurrency: "AUD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.5,
      swapShort: -1.5,
    }),
    AUDJPY_ORB: freezeOtbProfile({
      symbol: "AUDJPY_ORB",
      digits: 3,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.001,
      tickValue: 100,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "JPY",
      currencyMargin: "USD",
      contractCurrency: "AUD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.25,
      swapShort: -1.75,
    }),
    AUDNZD_ORB: freezeOtbProfile({
      symbol: "AUDNZD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "NZD",
      currencyMargin: "USD",
      contractCurrency: "AUD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.25,
      swapShort: -1.75,
    }),
    AUDUSD_ORB: freezeOtbProfile({
      symbol: "AUDUSD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "USD",
      currencyMargin: "USD",
      contractCurrency: "AUD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.5,
      swapShort: -1.5,
    }),
    CADJPY_ORB: freezeOtbProfile({
      symbol: "CADJPY_ORB",
      digits: 3,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.001,
      tickValue: 100,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "JPY",
      currencyMargin: "USD",
      contractCurrency: "CAD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.25,
      swapShort: -1.75,
    }),
    CHFJPY_ORB: freezeOtbProfile({
      symbol: "CHFJPY_ORB",
      digits: 3,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.001,
      tickValue: 100,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "JPY",
      currencyMargin: "USD",
      contractCurrency: "CHF",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.75,
      swapShort: -1.25,
    }),
    EURAUD_ORB: freezeOtbProfile({
      symbol: "EURAUD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "AUD",
      currencyMargin: "USD",
      contractCurrency: "EUR",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.5,
      swapShort: -1.5,
    }),
    EURCAD_ORB: freezeOtbProfile({
      symbol: "EURCAD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "CAD",
      currencyMargin: "USD",
      contractCurrency: "EUR",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.25,
      swapShort: -1.75,
    }),
    GBPAUD_ORB: freezeOtbProfile({
      symbol: "GBPAUD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "AUD",
      currencyMargin: "USD",
      contractCurrency: "GBP",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -0.75,
      swapShort: -2.25,
    }),
    USDCAD_ORB: freezeOtbProfile({
      symbol: "USDCAD_ORB",
      digits: 5,
      contractSize: 100000,
      spreadMode: "floating",
      stopsLevel: 20,
      minVolume: 0.1,
      maxVolume: 10,
      volumeStep: 0.1,
      tickSize: 0.00001,
      tickValue: 1,
      initialMargin: 100000,
      maintenanceMargin: 100000,
      hedgedMargin: 50000,
      currencyProfit: "CAD",
      currencyMargin: "USD",
      contractCurrency: "USD",
      calculationMode: "Forex",
      commission: {
        volumeMin: 0.01,
        volumeMax: 1000,
        pricePerLot: 33,
      },
      swapType: "percentage",
      swapLong: -1.5,
      swapShort: -1.5,
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
