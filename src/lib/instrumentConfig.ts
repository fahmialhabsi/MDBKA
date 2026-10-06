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
// Tahap 6I (06 Okt 2026): 82 simbol dari bulk export
// SymbolSpecs_Finex_1791247268.csv (10 awal dipertahankan di depan).
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
  "AUDUSD",
  "AUDCHF",
  "AUDJPY",
  "AUDNZD",
  "CHFJPY",
  "EURAUD",
  "EURGBP",
  "EURJPY",
  "EURNZD",
  "GBPAUD",
  "GBPCAD",
  "GBPCHF",
  "GBPJPY",
  "GBPNZD",
  "NZDCAD",
  "NZDCHF",
  "NZDJPY",
  "NZDUSD",
  "USDCAD",
  "GBXUSD",
  "USDEUR",
  "USDGBP",
  "USDHKD",
  "XAGUSD",
  "XAUUSD",
  "DE30",
  "HK50",
  "JP225",
  "UK100",
  "US30",
  "US500",
  "XTIUSD",
  "#168",
  "#388",
  "#700",
  "#763",
  "#AA",
  "#AAPL",
  "#ADBE",
  "#ADS",
  "#AIG",
  "#ALV",
  "#AMGN",
  "#AXP",
  "#BA",
  "#BIDU",
  "#BLK",
  "#BMW",
  "#BP",
  "#CAT",
  "#CME",
  "#GE",
  "#GOOGL",
  "#GS",
  "#GSK",
  "#HD",
  "#HSBA",
  "#IBM",
  "#JNJ",
  "#JPM",
  "#MA",
  "#MAR",
  "#MCD",
  "#META",
  "#MMM",
  "#MSFT",
  "#NKE",
  "#NVDA",
  "#ORCL",
  "#RL",
  "#SAP",
  "#VOD",
  "#VOW",
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
  },
 // ===== Tahap 6I (06 Okt 2026): profil dari bulk export MT5 =====
  // Aturan: decimals = Digits CSV; pipSize = 10^-(d-1) (5->0.0001,
  // 3->0.01); pointValue/contractSize = contract CSV; buffer = 5 tick;
  // pita min/max = [bid*0.5, ask*2] (tangkap salah-skala 10x lipat);
  // GBXUSD dicatat pence (GBX), bukan USD.
  {
    symbol: "#168",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 19,
    maxPrice: 79,
    expectedPriceExample: "39.37",
    brokerNote:
      "#168 adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#388",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 180,
    maxPrice: 760,
    expectedPriceExample: "376.61",
    brokerNote:
      "#388 adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#700",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 210,
    maxPrice: 850,
    expectedPriceExample: "422.43",
    brokerNote:
      "#700 adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#763",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 10,
    maxPrice: 44,
    expectedPriceExample: "21.61",
    brokerNote:
      "#763 adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#AA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 21,
    maxPrice: 88,
    expectedPriceExample: "43.73",
    brokerNote:
      "#AA adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#AAPL",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 160,
    maxPrice: 670,
    expectedPriceExample: "333.63",
    brokerNote:
      "#AAPL adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#ADBE",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 480,
    expectedPriceExample: "237.46",
    brokerNote:
      "#ADBE adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#ADS",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 71,
    maxPrice: 290,
    expectedPriceExample: "142.21",
    brokerNote:
      "#ADS adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#AIG",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 37,
    maxPrice: 160,
    expectedPriceExample: "75.30",
    brokerNote:
      "#AIG adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#ALV",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 200,
    maxPrice: 840,
    expectedPriceExample: "418.73",
    brokerNote:
      "#ALV adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#AMGN",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 190,
    maxPrice: 800,
    expectedPriceExample: "400.00",
    brokerNote:
      "#AMGN adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#AXP",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 150,
    maxPrice: 610,
    expectedPriceExample: "303.20",
    brokerNote:
      "#AXP adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#BA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 96,
    maxPrice: 390,
    expectedPriceExample: "193.41",
    brokerNote:
      "#BA adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#BIDU",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 43,
    maxPrice: 180,
    expectedPriceExample: "86.66",
    brokerNote:
      "#BIDU adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#BLK",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 520,
    maxPrice: 2200,
    expectedPriceExample: "1058.82",
    brokerNote:
      "#BLK adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#BMW",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 27,
    maxPrice: 110,
    expectedPriceExample: "54.23",
    brokerNote:
      "#BMW adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#BP",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 280,
    maxPrice: 1200,
    expectedPriceExample: "563.11",
    brokerNote:
      "#BP adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#CAT",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 420,
    maxPrice: 1700,
    expectedPriceExample: "849.55",
    brokerNote:
      "#CAT adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#CME",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 130,
    maxPrice: 540,
    expectedPriceExample: "266.41",
    brokerNote:
      "#CME adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#GE",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 150,
    maxPrice: 620,
    expectedPriceExample: "307.96",
    brokerNote:
      "#GE adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#GOOGL",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 170,
    maxPrice: 700,
    expectedPriceExample: "345.36",
    brokerNote:
      "#GOOGL adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#GS",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 440,
    maxPrice: 1800,
    expectedPriceExample: "896.51",
    brokerNote:
      "#GS adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#GSK",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 870,
    maxPrice: 3600,
    expectedPriceExample: "1759.01",
    brokerNote:
      "#GSK adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#HD",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 140,
    maxPrice: 570,
    expectedPriceExample: "281.32",
    brokerNote:
      "#HD adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#HSBA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 720,
    maxPrice: 3000,
    expectedPriceExample: "1456.67",
    brokerNote:
      "#HSBA adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#IBM",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 450,
    expectedPriceExample: "222.73",
    brokerNote:
      "#IBM adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#JNJ",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 120,
    maxPrice: 510,
    expectedPriceExample: "253.79",
    brokerNote:
      "#JNJ adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#JPM",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 160,
    maxPrice: 670,
    expectedPriceExample: "332.39",
    brokerNote:
      "#JPM adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#MA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 280,
    maxPrice: 1200,
    expectedPriceExample: "562.14",
    brokerNote:
      "#MA adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#MAR",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 170,
    maxPrice: 720,
    expectedPriceExample: "355.83",
    brokerNote:
      "#MAR adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#MCD",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 470,
    expectedPriceExample: "230.96",
    brokerNote:
      "#MCD adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#META",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 370,
    maxPrice: 1500,
    expectedPriceExample: "745.23",
    brokerNote:
      "#META adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#MMM",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 80,
    maxPrice: 330,
    expectedPriceExample: "161.58",
    brokerNote:
      "#MMM adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#MSFT",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 260,
    maxPrice: 1100,
    expectedPriceExample: "525.38",
    brokerNote:
      "#MSFT adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#NKE",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 16,
    maxPrice: 67,
    expectedPriceExample: "33.42",
    brokerNote:
      "#NKE adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#NVDA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 480,
    expectedPriceExample: "236.52",
    brokerNote:
      "#NVDA adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#ORCL",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 71,
    maxPrice: 290,
    expectedPriceExample: "143.52",
    brokerNote:
      "#ORCL adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#RL",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 180,
    maxPrice: 740,
    expectedPriceExample: "365.77",
    brokerNote:
      "#RL adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#SAP",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 92,
    maxPrice: 380,
    expectedPriceExample: "185.35",
    brokerNote:
      "#SAP adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#VOD",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 63,
    maxPrice: 260,
    expectedPriceExample: "127.53",
    brokerNote:
      "#VOD adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "#VOW",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 34,
    maxPrice: 140,
    expectedPriceExample: "68.66",
    brokerNote:
      "#VOW adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "AAPL",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 160,
    maxPrice: 670,
    expectedPriceExample: "333.68",
    brokerNote:
      "AAPL adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "AIG",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 37,
    maxPrice: 160,
    expectedPriceExample: "75.26",
    brokerNote:
      "AIG adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "AMAZON",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 120,
    maxPrice: 510,
    expectedPriceExample: "252.03",
    brokerNote:
      "AMAZON adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "AMZN",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 120,
    maxPrice: 510,
    expectedPriceExample: "252.03",
    brokerNote:
      "AMZN adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "APPLE",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 160,
    maxPrice: 670,
    expectedPriceExample: "333.68",
    brokerNote:
      "APPLE adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "AUDCHF",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.28,
    maxPrice: 1.2,
    expectedPriceExample: "0.57936",
    brokerNote:
      "AUDCHF biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "AUDJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 55,
    maxPrice: 230,
    expectedPriceExample: "110.158",
    brokerNote:
      "AUDJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "AUDNZD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.62,
    maxPrice: 2.5,
    expectedPriceExample: "1.24523",
    brokerNote:
      "AUDNZD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "AXP",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 150,
    maxPrice: 610,
    expectedPriceExample: "303.22",
    brokerNote:
      "AXP adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "BA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 96,
    maxPrice: 390,
    expectedPriceExample: "193.40",
    brokerNote:
      "BA adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "BABA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 54,
    maxPrice: 230,
    expectedPriceExample: "110.15",
    brokerNote:
      "BABA adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "BAC",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 27,
    maxPrice: 110,
    expectedPriceExample: "54.21",
    brokerNote:
      "BAC adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "BOA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 27,
    maxPrice: 110,
    expectedPriceExample: "54.21",
    brokerNote:
      "BOA adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "CHFJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 95,
    maxPrice: 390,
    expectedPriceExample: "190.141",
    brokerNote:
      "CHFJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "CITI",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 64,
    maxPrice: 260,
    expectedPriceExample: "128.69",
    brokerNote:
      "CITI adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "CLU",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1000,
    contractSize: 1000,
    defaultBuffer: 0.05,
    minPrice: 45,
    maxPrice: 190,
    expectedPriceExample: "90.73",
    brokerNote:
      "CLU berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "CSCO",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 55,
    maxPrice: 230,
    expectedPriceExample: "111.94",
    brokerNote:
      "CSCO adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "CVX",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 100,
    maxPrice: 420,
    expectedPriceExample: "206.52",
    brokerNote:
      "CVX adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "DE30",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 25,
    contractSize: 25,
    defaultBuffer: 0.05,
    minPrice: 12000,
    maxPrice: 51000,
    expectedPriceExample: "25268.45",
    brokerNote:
      "DE30 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "DISNEY",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 51,
    maxPrice: 210,
    expectedPriceExample: "102.49",
    brokerNote:
      "DISNEY adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "EBAY",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 53,
    maxPrice: 220,
    expectedPriceExample: "107.22",
    brokerNote:
      "EBAY adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "EURAUD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.8,
    maxPrice: 3.3,
    expectedPriceExample: "1.60851",
    brokerNote:
      "EURAUD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURGBP",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.42,
    maxPrice: 1.7,
    expectedPriceExample: "0.84816",
    brokerNote:
      "EURGBP biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 88,
    maxPrice: 360,
    expectedPriceExample: "177.186",
    brokerNote:
      "EURJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURNZD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 1,
    maxPrice: 4.1,
    expectedPriceExample: "2.00297",
    brokerNote:
      "EURNZD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "FB",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 370,
    maxPrice: 1500,
    expectedPriceExample: "745.51",
    brokerNote:
      "FB adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "GBPAUD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.94,
    maxPrice: 3.8,
    expectedPriceExample: "1.89649",
    brokerNote:
      "GBPAUD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "GBPCAD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.94,
    maxPrice: 3.8,
    expectedPriceExample: "1.88287",
    brokerNote:
      "GBPCAD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "GBPCHF",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.54,
    maxPrice: 2.2,
    expectedPriceExample: "1.09873",
    brokerNote:
      "GBPCHF biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "GBPJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 100,
    maxPrice: 420,
    expectedPriceExample: "208.910",
    brokerNote:
      "GBPJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "GBPNZD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 1.1,
    maxPrice: 4.8,
    expectedPriceExample: "2.36153",
    brokerNote:
      "GBPNZD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "GBXUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.0066,
    maxPrice: 0.027,
    expectedPriceExample: "0.01322",
    brokerNote:
      "GBXUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "GE",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 150,
    maxPrice: 620,
    expectedPriceExample: "307.87",
    brokerNote:
      "GE adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "GOOG",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 170,
    maxPrice: 700,
    expectedPriceExample: "346.13",
    brokerNote:
      "GOOG adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "GS",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 440,
    maxPrice: 1800,
    expectedPriceExample: "896.51",
    brokerNote:
      "GS adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "HK50",
    category: "index",
    decimals: 0,
    pipSize: 10,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 1,
    defaultPointValue: 5,
    contractSize: 5,
    defaultBuffer: 5,
    minPrice: 12000,
    maxPrice: 49000,
    expectedPriceExample: "24253",
    brokerNote:
      "HK50 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "HPQ",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 15,
    maxPrice: 63,
    expectedPriceExample: "31.23",
    brokerNote:
      "HPQ adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "IBM",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 450,
    expectedPriceExample: "222.92",
    brokerNote:
      "IBM adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "INTC",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 58,
    maxPrice: 240,
    expectedPriceExample: "116.99",
    brokerNote:
      "INTC adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "JNJ",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 120,
    maxPrice: 510,
    expectedPriceExample: "254.05",
    brokerNote:
      "JNJ adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "JP225",
    category: "index",
    decimals: 0,
    pipSize: 10,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 1,
    defaultPointValue: 5,
    contractSize: 5,
    defaultBuffer: 5,
    minPrice: 34000,
    maxPrice: 140000,
    expectedPriceExample: "69888",
    brokerNote:
      "JP225 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "JPM",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 160,
    maxPrice: 670,
    expectedPriceExample: "332.33",
    brokerNote:
      "JPM adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "KO",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 43,
    maxPrice: 180,
    expectedPriceExample: "86.23",
    brokerNote:
      "KO adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "MA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 280,
    maxPrice: 1200,
    expectedPriceExample: "562.37",
    brokerNote:
      "MA adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "MCD",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 470,
    expectedPriceExample: "231.06",
    brokerNote:
      "MCD adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "META",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 0.05,
    minPrice: 370,
    maxPrice: 1500,
    expectedPriceExample: "745.51",
    brokerNote:
      "META adalah saham (1 lot = 1 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "MSFT",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 260,
    maxPrice: 1100,
    expectedPriceExample: "525.72",
    brokerNote:
      "MSFT adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "NVDA",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 110,
    maxPrice: 480,
    expectedPriceExample: "236.55",
    brokerNote:
      "NVDA adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "NZDCAD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.39,
    maxPrice: 1.6,
    expectedPriceExample: "0.79728",
    brokerNote:
      "NZDCAD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "NZDCHF",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.23,
    maxPrice: 0.94,
    expectedPriceExample: "0.46528",
    brokerNote:
      "NZDCHF biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "NZDJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 44,
    maxPrice: 180,
    expectedPriceExample: "88.470",
    brokerNote:
      "NZDJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "NZDUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.27,
    maxPrice: 1.2,
    expectedPriceExample: "0.55980",
    brokerNote:
      "NZDUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "ORCL",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 71,
    maxPrice: 290,
    expectedPriceExample: "143.58",
    brokerNote:
      "ORCL adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "PFE",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 13,
    maxPrice: 55,
    expectedPriceExample: "27.37",
    brokerNote:
      "PFE adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "PG",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 72,
    maxPrice: 300,
    expectedPriceExample: "145.53",
    brokerNote:
      "PG adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "SBUX",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 47,
    maxPrice: 190,
    expectedPriceExample: "94.23",
    brokerNote:
      "SBUX adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "T",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 12,
    maxPrice: 49,
    expectedPriceExample: "24.06",
    brokerNote:
      "T adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "UK100",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 10,
    contractSize: 10,
    defaultBuffer: 0.05,
    minPrice: 5200,
    maxPrice: 22000,
    expectedPriceExample: "10502.79",
    brokerNote:
      "UK100 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "US30",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 5,
    contractSize: 5,
    defaultBuffer: 0.05,
    minPrice: 25000,
    maxPrice: 110000,
    expectedPriceExample: "51137.79",
    brokerNote:
      "US30 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "US500",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 50,
    contractSize: 50,
    defaultBuffer: 0.05,
    minPrice: 3800,
    maxPrice: 16000,
    expectedPriceExample: "7757.21",
    brokerNote:
      "US500 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "USDCAD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.71,
    maxPrice: 2.9,
    expectedPriceExample: "1.42444",
    brokerNote:
      "USDCAD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "USDEUR",
    category: "forex",
    decimals: 8,
    pipSize: 0.0000001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000000,
    defaultPointValue: 1000,
    contractSize: 1000,
    defaultBuffer: 0.00000005,
    minPrice: 0.44,
    maxPrice: 1.8,
    expectedPriceExample: "0.89190153",
    brokerNote:
      "USDEUR biasanya menggunakan contract size 1000. Verifikasi kepada broker."
  },
  {
    symbol: "USDGBP",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.37,
    maxPrice: 1.6,
    expectedPriceExample: "0.75660",
    brokerNote:
      "USDGBP biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "USDHKD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100000,
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 3.9,
    maxPrice: 16,
    expectedPriceExample: "7.84870",
    brokerNote:
      "USDHKD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "V",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 180,
    maxPrice: 740,
    expectedPriceExample: "366.21",
    brokerNote:
      "V adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "WMT",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 52,
    maxPrice: 210,
    expectedPriceExample: "104.79",
    brokerNote:
      "WMT adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "XAGUSD",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 1000,
    defaultPointValue: 5000,
    contractSize: 5000,
    defaultBuffer: 0.005,
    minPrice: 30,
    maxPrice: 130,
    expectedPriceExample: "61.194",
    brokerNote:
      "XAGUSD biasanya menggunakan contract size 5000. Verifikasi kepada broker."
  },
  {
    symbol: "XAUUSD",
    category: "forex",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "pip",
    spreadLabel: "pip",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 2000,
    maxPrice: 8300,
    expectedPriceExample: "4138.31",
    brokerNote:
      "XAUUSD biasanya menggunakan contract size 100. Verifikasi kepada broker."
  },
  {
    symbol: "XOM",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 100,
    contractSize: 100,
    defaultBuffer: 0.05,
    minPrice: 82,
    maxPrice: 330,
    expectedPriceExample: "164.07",
    brokerNote:
      "XOM adalah saham (1 lot = 100 lembar). Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "XTIUSD",
    category: "index",
    decimals: 2,
    pipSize: 0.1,
    spreadUnit: "index points",
    spreadLabel: "index points",
    priceScale: 100,
    defaultPointValue: 1000,
    contractSize: 1000,
    defaultBuffer: 0.05,
    minPrice: 44,
    maxPrice: 180,
    expectedPriceExample: "89.87",
    brokerNote:
      "XTIUSD berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },

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
  // Tahap 6I: cocokkan nama persis dulu (simbol bertitik seperti
  // "GOOG.US" dan bertanda seperti "#AAPL" tidak boleh dinormalisasi).
  const raw = symbol.trim().toUpperCase();
  const exact = profiles.find((profile) => profile.symbol === raw);
  if (exact !== undefined) return exact;

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
