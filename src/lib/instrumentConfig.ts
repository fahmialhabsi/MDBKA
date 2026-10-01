export type InstrumentCategory =
  | "forex"
  | "index"
  | "unknown";

export interface InstrumentProfile {
  symbol: string;
  category: InstrumentCategory;
  decimals: number;
  pipSize: number;
  spreadUnit: "pip" | "index points";
  /** Label satuan spread untuk UI, mis. "pip" atau "index points". */
  spreadLabel: string;
  /** Skala harga (10^decimals), mis. 100000 untuk 5 desimal. */
  priceScale: number;
  defaultPointValue: number;
  contractSize: number;
  defaultBuffer: number;
  minPrice: number;
  maxPrice: number;
  expectedPriceExample: string;
  brokerNote: string;
}

/**
 * Satu-satunya sumber daftar instrumen untuk dropdown simbol.
 * Jangan membuat daftar simbol berbeda di file lain; impor dari sini.
 */
export const SUPPORTED_SYMBOLS = [
  "GBPUSD",
  "US100",
  "CADJPY",
  "AUDCAD",
  "EURCAD",
  "EURUSD",
  "USDJPY",
  "USDCHF",
  "EURCHF",
  "AUDUSD"
] as const;

export type SupportedSymbol = (typeof SUPPORTED_SYMBOLS)[number];

export function isSupportedSymbol(value: string): value is SupportedSymbol {
  return (SUPPORTED_SYMBOLS as readonly string[]).includes(value);
}

const profiles: InstrumentProfile[] = [
  {
    symbol: "GBPUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "1.32480",
    brokerNote:
      "GBPUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "1.10000",
    brokerNote:
      "EURUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "AUDUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.3,
    maxPrice: 3,
    expectedPriceExample: "0.65120",
    brokerNote:
      "AUDUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "AUDCAD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "0.91234",
    brokerNote:
      "AUDCAD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURCAD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "1.47210",
    brokerNote:
      "EURCAD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "USDCHF",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "0.88520",
    brokerNote:
      "USDCHF biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURCHF",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "0.94210",
    brokerNote:
      "EURCHF biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "CADJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 50,
    maxPrice: 250,
    expectedPriceExample: "110.125",
    brokerNote:
      "CADJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "USDJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 50,
    maxPrice: 250,
    expectedPriceExample: "150.125",
    brokerNote:
      "USDJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "US100",
    category: "index",
    decimals: 2,
    pipSize: 1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 10,
    minPrice: 1000,
    maxPrice: 100000,
    expectedPriceExample: "30683.37",
    brokerNote:
      "US100 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "NAS100",
    category: "index",
    decimals: 2,
    pipSize: 1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 10,
    minPrice: 1000,
    maxPrice: 100000,
    expectedPriceExample: "30683.37",
    brokerNote:
      "NAS100 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  }
];

const fallbackProfile: InstrumentProfile = {
  symbol: "UNKNOWN",
  category: "unknown",
  decimals: 5,
  pipSize: 0.0001,
  spreadUnit: "pip",
  spreadLabel: "pip",
  priceScale: 100000,
  defaultPointValue: 1,
  contractSize: 1,
  defaultBuffer: 0,
  minPrice: 0,
  maxPrice: Number.MAX_SAFE_INTEGER,
  expectedPriceExample: "isi manual",
  brokerNote:
    "Instrumen belum dikenali. Isi parameter broker secara manual."
};

export function normalizeSymbol(symbol: string): string {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return "";

  // Ambil kode simbol di depan; buang suffix broker dan sisa label
  // seperti ".pro", ".cash", ",H1", " H1", "-ECN", " - Nasdaq".
  // Contoh: "GBPUSD.pro" -> "GBPUSD", "US100,H1" -> "US100".
  const withoutSuffix = raw.split(/[^A-Z0-9]/)[0] ?? raw;
  const value = withoutSuffix.trim();
  if (!value) return "";

  if (value === "USTEC" || value === "US100CASH" || value === "NASUSTEC") return "US100";
  if (value === "NASDAQ" || value === "NAS100CASH" || value === "USTEC100") return "NAS100";

  return value;
}

export function getInstrumentProfile(
  symbol: string
): InstrumentProfile {
  const normalized = normalizeSymbol(symbol);

  return (
    profiles.find(
      (profile) => profile.symbol === normalized
    ) ?? fallbackProfile
  );
}

/**
 * Alias kompatibilitas untuk kode lama App.tsx.
 */
export function getInstrumentPreset(
  symbol: string
): InstrumentProfile {
  return getInstrumentProfile(symbol);
}

export function getSpreadLabel(symbol: string): string {
  return getInstrumentProfile(symbol).spreadLabel;
}

export function getPriceScale(symbol: string): number {
  return getInstrumentProfile(symbol).priceScale;
}

export function formatInstrumentPrice(
  value: number,
  symbol: string
): string {
  const profile = getInstrumentProfile(symbol);

  if (!Number.isFinite(value)) return "-";

  return value.toLocaleString("en-US", {
    minimumFractionDigits: profile.decimals,
    maximumFractionDigits: profile.decimals
  });
}

export function formatSpread(
  bid: number,
  ask: number,
  symbol: string
): string {
  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    ask <= bid
  ) {
    return "-";
  }

  const profile = getInstrumentProfile(symbol);
  const spread = (ask - bid) / profile.pipSize;

  return spread.toFixed(
    profile.category === "forex" ? 1 : 2
  );
}
