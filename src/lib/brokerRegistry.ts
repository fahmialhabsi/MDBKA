import {
  SUPPORTED_SYMBOLS,
  getInstrumentProfile,
} from "./instrumentConfig";
import type {
  BrokerContext,
  BrokerId,
  BrokerProfile,
} from "../types/broker";

/**
 * Tahap 2 — registry broker terisolasi (read-only, tanpa efek runtime).
 *
 * - Finex adalah broker default dan satu-satunya sumber preset aktif.
 * - Preset Finex TIDAK disalin: diturunkan dari instrumentConfig melalui
 *   adapter read-only (SUPPORTED_SYMBOLS + getInstrumentProfile) sehingga
 *   nilainya selalu identik dengan preset yang sudah ada.
 * - OrbiTraderBerjangka hanya terdaftar dengan koleksi instrumen kosong;
 *   tidak ada spread, digit, tick size, tick value, contract size,
 *   minimum lot, lot step, leverage, maupun margin fiktif.
 * - Tidak ada dropdown broker; tidak ada perubahan alur analisis.
 * - normalizeSymbol lama tidak diubah; helper di sini menyimpan nama
 *   simbol asli apa adanya.
 */

export const FINEX_BROKER_ID = "finex" as const;
export const ORBITRADER_BROKER_ID = "orbitraderberjangka" as const;

/** Broker default. Tetap "finex" selama Tahap 2. */
export const DEFAULT_BROKER_ID: BrokerId = FINEX_BROKER_ID;

export const ORBITRADER_VERIFICATION_NOTE =
  "Perlu verifikasi dari Specification OrbiTraderBerjangka.";

function buildFinexProfile(): BrokerProfile {
  return {
    id: FINEX_BROKER_ID,
    label: "Finex",
    instruments: SUPPORTED_SYMBOLS.map((symbol) =>
      getInstrumentProfile(symbol)
    ),
    note: "Broker default. Preset instrumen mengikuti instrumentConfig.",
  };
}

function buildOrbitraderProfile(): BrokerProfile {
  return {
    id: ORBITRADER_BROKER_ID,
    label: "OrbiTraderBerjangka",
    instruments: [],
    note: ORBITRADER_VERIFICATION_NOTE,
  };
}

export const MIFX_BROKER_ID = "mifx" as const;

/** M4b-1 (10 Okt 2026): MIFX — aturan simbol di mifxSpecs.ts (bukan preset Finex). */
function buildMifxProfile(): BrokerProfile {
  return {
    id: MIFX_BROKER_ID,
    label: "MIFX",
    instruments: [],
    note: "PT Monex Investindo Futures (demo 1003997005). Simbol akhiran .m; aturan dari Specification MT5 MIFX.",
  };
}

function freezeProfile(profile: BrokerProfile): BrokerProfile {
  Object.freeze(profile.instruments);
  return Object.freeze(profile);
}

/**
 * Daftar profil broker. Dibekukan (deep-freeze satu level) agar pemanggil
 * tidak dapat memutasi registry.
 */
export const BROKER_PROFILES: readonly BrokerProfile[] = Object.freeze([
  freezeProfile(buildFinexProfile()),
  freezeProfile(buildOrbitraderProfile()),
  freezeProfile(buildMifxProfile()),
]);

/** True bila value adalah id broker yang didukung. */
export function isSupportedBrokerId(value: string): value is BrokerId {
  return (
    value === FINEX_BROKER_ID || value === ORBITRADER_BROKER_ID || value === MIFX_BROKER_ID
  );
}

/**
 * Mengambil profil broker berdasarkan id.
 * Melempar Error untuk id yang tidak didukung (id invalid ditolak).
 */
export function getBrokerProfile(brokerId: string): BrokerProfile {
  const found = BROKER_PROFILES.find(
    (profile) => profile.id === brokerId
  );

  if (!found) {
    throw new Error(`Broker tidak dikenal: ${brokerId}`);
  }

  return found;
}

/**
 * Adapter preset Finex: delegasi read-only ke instrumentConfig.
 * Tidak membuat objek Finex kedua; nilai selalu identik dengan preset
 * yang sudah ada.
 */
export function getFinexInstrumentPreset(symbol: string) {
  return getInstrumentProfile(symbol);
}

/**
 * Membuat konteks broker minimal dengan broker default (Finex).
 * brokerSymbol menyimpan nama simbol asli tanpa normalisasi agar
 * perilaku parser OCR/CSV lama tidak berubah.
 */
export function createBrokerContext(
  brokerSymbol: string,
  instrumentFamily?: string
): BrokerContext {
  if (instrumentFamily === undefined) {
    return { brokerId: DEFAULT_BROKER_ID, brokerSymbol };
  }

  return {
    brokerId: DEFAULT_BROKER_ID,
    brokerSymbol,
    instrumentFamily,
  };
}

/**
 * Menguraikan simbol broker tanpa mengubah normalizeSymbol lama:
 * nama asli dipertahankan di brokerSymbol, keluarga instrumen
 * diteruskan apa adanya bila tersedia.
 */
export function resolveBrokerSymbol(
  brokerSymbol: string,
  instrumentFamily?: string
): Pick<BrokerContext, "brokerSymbol" | "instrumentFamily"> {
  if (instrumentFamily === undefined) {
    return { brokerSymbol };
  }

  return { brokerSymbol, instrumentFamily };
}

/** M4b-3: nama pendek broker untuk tombol/label (satu sumber). */
export const BROKER_SHORT_LABEL: Readonly<Record<BrokerId, string>> = Object.freeze({
  finex: "Finex",
  orbitraderberjangka: "OTB",
  mifx: "MIFX",
});

/** M4b-3: urutan broker di tombol halaman (History, Kalkulator, Golongan). */
export const BROKER_IDS: readonly BrokerId[] = Object.freeze(["finex", "orbitraderberjangka", "mifx"]);

/** Query `broker=` → BrokerId; tak dikenal/kosong → null. */
export function parseBrokerParam(value: string | null): BrokerId | null {
  return value !== null && isSupportedBrokerId(value) ? value : null;
}
