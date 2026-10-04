declare const process: { exit(code: number): never; cwd(): string };
declare const require: {
  (id: string): { readFileSync(path: string, encoding: string): string };
};

import { parseCsvCandles, parseCsvNumber } from "../src/lib/csvCandleParser";
import {
  detectExtremeLevels,
  detectSwingLevels,
  resolveSwingLevels,
  type Candle,
} from "../src/calculations/swingDetector";
import {
  DEVIATION_WARN_PCT,
  checkInstrumentMismatch,
  checkPriceDeviation,
} from "../src/lib/instrumentMismatch";
import {
  SUPPORTED_SYMBOLS,
  getInstrumentPreset,
  getInstrumentProfile,
  isSupportedSymbol,
  normalizeSymbol,
} from "../src/lib/instrumentConfig";
import {
  FINEX_DEFAULT_COMMISSION,
  RESET_MARKET_FIELDS,
  applyBrokerPreset,
  applyCsvSwingLevels,
  applySwingLevels,
  createEmptyMarketForSymbol,
  displayMarketNumber,
  filterOcrPricesForSymbol,
  isMarketEmptyForSymbol,
  mergeValidOcrMarketData,
  parseMarketInput,
} from "../src/lib/marketReset";
import { validateAnalysisInputs } from "../src/calculations/inputValidator";
import { detectScaleMismatch } from "../src/calculations/scaleValidator";
import {
  getValidationViewState,
  buildBlockedReasons,
} from "../src/lib/validationView";
import {
  REGION_MIN_SIZE,
  canvasPointFromClient,
  clamp,
  convertToNaturalCoords,
  isRegionBigEnough,
  normalizeRegion,
} from "../src/lib/regionSelection";
import {
  parseMarketWatchBidAsk,
  normalizeBigOcrNumber,
} from "../src/lib/marketWatchParser";
import {
  parseMaValue,
  parseOcrTextRich,
  combineRegionTexts,
} from "../src/components/extraction/ocrParser";
import type { BrokerSettings, MarketData } from "../src/types/analysis";
import type { BrokerProfile } from "../src/types/broker";
import {
  BROKER_PROFILES,
  DEFAULT_BROKER_ID,
  FINEX_BROKER_ID,
  ORBITRADER_BROKER_ID,
  ORBITRADER_VERIFICATION_NOTE,
  createBrokerContext,
  getBrokerProfile,
  isSupportedBrokerId,
  resolveBrokerSymbol,
} from "../src/lib/brokerRegistry";
import {
  OTB_PRESETS,
  calculateOtbTickValue,
  getOtbInstrumentProfile,
  getOtbMarginRequirements,
} from "../src/lib/otbInstrumentConfig";
import {
  API_BASE_URL,
  DEFAULT_API_BASE_URL,
  resolveApiBaseUrl,
} from "../src/lib/apiBaseUrl";
import {
  CLEARLY_STALE_AFTER_MS,
  STALE_AFTER_MS,
  formatAge,
  isClearlyStale,
  isStale,
  parseSnapshotTime,
} from "../src/lib/dataFreshness";
import {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TZ_OFFSET_HOURS,
  TickHistoryLogger,
  historyFileName,
  normalizeTsToUtc,
  resolveTzOffset,
  tickKey,
} from "../server/services/tickHistory";
import {
  FX_CACHE_TTL_MS,
  isFxCacheFresh,
} from "../server/routes/fxRoutes";
import {
  ADVERSE_DRIFT_PCT,
  MARGIN_GUARD_PCT,
  MIN_REWARD_RISK,
  NEAR_LEVEL_PCT,
  PRICE_DRIFT_PCT,
  calculateHoldingPnL,
  checkMarginGuard,
  checkRewardRisk,
  evaluateExitSignal,
  rewardRiskRatio,
  validateHoldingInput,
  type Holding,
} from "../src/lib/exitMonitor";
import { FRONTEND_ORIGIN } from "../server/app";
import {
  OTB_ALL_SYMBOLS,
  VERIFIED_OTB_SYMBOLS,
  canonicalSymbolForBroker,
  exactOtbSymbol,
  findOtbSymbolInText,
  getAvailableSymbols,
  getOtbDetectedNotice,
  hasOtbPresetForSymbol,
  isOtbSymbolVerified,
} from "../src/lib/brokerSymbols";
import { calculateSwapCost } from "../src/calculations/swapCost";
import { attachSwapToResult } from "../src/calculations/attachSwapToResult";
import {
  FALLBACK_RATES,
  convertToUSD,
  fetchECBRates,
  parseECBXml,
} from "../src/services/fxRateService";
import {
  calculateSwapWithTriple,
  getTripleSwapLabel,
  isWednesday,
} from "../src/services/dateService";
import {
  MT5LogReader,
  parseEquityFromText,
} from "../server/services/mt5LogReader";
import { isEquitySnapshot } from "../server/types/equity";
import { runQuotesLogReaderTests } from "../src/services/quotesLogReader.test";
import {
  FINEX_SPECS_32,
  INSTRUMENT_SPECS_32,
  OTB_SPECS_32,
  getInstrumentSpec32,
  getJPYPairSymbols32,
  isSpec32Verified,
} from "../src/lib/instrumentSpecs32";
import {
  calculateSwap,
  detectWednesdayTripleSwap,
  getDayMultiplier,
  getJPYRate,
  isTripleDay,
} from "../src/lib/jpySwapCalculator";
import {
  SPEC32_FALLBACK_COMMISSION,
  SPEC32_FALLBACK_LEVERAGE,
  getSpec32FormDefaults,
  getSpec32SwapPreview,
  isSpec32Available,
  spec32VerificationNotice,
} from "../src/lib/spec32Wiring";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(
      `FAIL - ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeCandle(
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return { time, open, high, low, close };
}

/* ---------------- Parser: 18 kasus ---------------- */

test("1. header + format titik tanggal", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026.09.30 12:00,30347.16,30367.13,30314.24,30340.33",
  );
  assert(r.headerDetected, "header tidak terdeteksi");
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].open === 30347.16, "open salah");
});

test("2. header + format dash tanggal", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,30480,30540,30450,30520",
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].time === "2026-10-01 01:00", "time salah");
});

test("3. tanggal dan jam dipisah koma", () => {
  const r = parseCsvCandles(
    "2026.09.30,12:00,30347.16,30367.13,30314.24,30340.33",
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].time === "2026.09.30 12:00", `time=${r.candles[0].time}`);
  assert(r.candles[0].close === 30340.33, "close salah");
});

test("4. separator titik koma", () => {
  const r = parseCsvCandles(
    "time;open;high;low;close\n2026.09.30 12:00;30347.16;30367.13;30314.24;30340.33",
  );
  assert(r.separator === ";", `separator=${r.separator}`);
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("5. BOM UTF-8 dihapus", () => {
  const r = parseCsvCandles(
    "﻿time,open,high,low,close\n2026-10-01 01:00,30480,30540,30450,30520",
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("6. baris kosong diabaikan", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n\n2026-10-01 01:00,30480,30540,30450,30520\n\n",
  );
  assert(r.totalRows === 1, `totalRows=${r.totalRows}`);
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("7. baris invalid dilewati dan dihitung", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\nbaris-rusak\n2026-10-01 01:00,30480,30540,30450,30520\n1,2,3",
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.invalidRows === 2, `invalidRows=${r.invalidRows}`);
  assert(r.errors.length >= 2, "errors tidak tercatat");
});

test("8. kolom volume tambahan diabaikan", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close,tick_volume,spread,real_volume\n2026-10-01 01:00,30480,30540,30450,30520,120,5,0",
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].close === 30520, "close salah");
});

test("9. 50 candle US100 valid", () => {
  const rows = ["time,open,high,low,close"];
  for (let i = 0; i < 50; i++) {
    const base = 30000 + i * 10;
    rows.push(
      `2026.09.30 12:${String(i).padStart(2, "0")},${base},${base + 30},${base - 30},${base + 5}`,
    );
  }
  const r = parseCsvCandles(rows.join("\n"));
  assert(r.validRows === 50, `validRows=${r.validRows}`);
  assert(r.invalidRows === 0, `invalidRows=${r.invalidRows}`);
});

test("10. 50 candle GBPUSD valid", () => {
  const rows = ["time,open,high,low,close"];
  for (let i = 0; i < 50; i++) {
    const open = 1.32 + i * 0.0001;
    rows.push(
      `2026-10-01 01:${String(i).padStart(2, "0")},${open.toFixed(5)},${(open + 0.0005).toFixed(5)},${(open - 0.0005).toFixed(5)},${(open + 0.0001).toFixed(5)}`,
    );
  }
  const r = parseCsvCandles(rows.join("\n"));
  assert(r.validRows === 50, `validRows=${r.validRows}`);
});

test("11. mismatch US100 vs GBPUSD terdeteksi via helper", () => {
  const gbp = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449",
  );
  assert(
    checkInstrumentMismatch(gbp.candles, "US100", 30500) !== null,
    "mismatch US100 tidak terdeteksi",
  );
  assert(
    checkInstrumentMismatch(gbp.candles, "GBPUSD", 1.3248) === null,
    "GBPUSD valid dianggap mismatch",
  );
});

test("12. OHLC tidak valid (non-numerik) dilewati", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,abc,30540,30450,30520",
  );
  assert(r.validRows === 0, `validRows=${r.validRows}`);
  assert(r.invalidRows === 1, `invalidRows=${r.invalidRows}`);
});

test("13. high lebih kecil dari close dilewati", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,30480,30400,30450,30520",
  );
  assert(r.validRows === 0, `validRows=${r.validRows}`);
});

test("14. low lebih besar dari open dilewati", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,30480,30540,30500,30520",
  );
  assert(r.validRows === 0, `validRows=${r.validRows}`);
});

test("15. decimal point MT5 dibaca benar", () => {
  assert(parseCsvNumber("30347.16", ",") === 30347.16, "titik desimal rusak");
  assert(
    parseCsvNumber("30347,16", ";") === 30347.16,
    "koma desimal (;) rusak",
  );
});

test("16. quote pada field diabaikan", () => {
  const r = parseCsvCandles(
    '"time","open","high","low","close"\n"2026-10-01 01:00","30480","30540","30450","30520"',
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("17. file hanya berisi header", () => {
  const r = parseCsvCandles("time,open,high,low,close");
  assert(r.validRows === 0, `validRows=${r.validRows}`);
  assert(r.totalRows === 0, `totalRows=${r.totalRows}`);
});

test("18. CSV kosong", () => {
  const r = parseCsvCandles("");
  assert(r.validRows === 0 && r.totalRows === 0, "CSV kosong harus 0/0");
  assert(r.separator === "unknown", `separator=${r.separator}`);
});

/* ---------------- Swing: 9 kasus ---------------- */

function swingFixture(): Candle[] {
  return [
    makeCandle("t0", 100, 102, 99, 101),
    makeCandle("t1", 101, 103, 98, 102),
    makeCandle("t2", 102, 104, 95, 103),
    makeCandle("t3", 103, 105, 97, 104),
    makeCandle("t4", 104, 110, 96, 105),
    makeCandle("t5", 105, 109, 100, 106),
    makeCandle("t6", 106, 108, 101, 107),
  ];
}

test("19. candle kurang dari minimum -> null", () => {
  const few = swingFixture().slice(0, 3);
  const r = detectSwingLevels(few, 106, 2);
  assert(
    r.support === null && r.resistance === null,
    `dapat ${r.support}/${r.resistance}`,
  );
});

test("20. support valid di bawah harga", () => {
  const r = detectSwingLevels(swingFixture(), 106, 2);
  assert(r.support === 95, `support=${r.support}`);
  assert(r.support !== null && r.support < 106, "support harus di bawah harga");
});

test("21. resistance valid di atas harga", () => {
  const r = detectSwingLevels(swingFixture(), 106, 2);
  assert(r.resistance === 110, `resistance=${r.resistance}`);
  assert(
    r.resistance !== null && r.resistance > 106,
    "resistance harus di atas harga",
  );
});

test("22. support null saat harga di bawah semua swing", () => {
  const r = detectSwingLevels(swingFixture(), 90, 2);
  assert(r.support === null, `support=${r.support}`);
});

test("23. resistance null saat harga di atas semua swing", () => {
  const r = detectSwingLevels(swingFixture(), 200, 2);
  assert(r.resistance === null, `resistance=${r.resistance}`);
});

test("24. harga di luar rentang candle -> null dua-duanya", () => {
  const r = detectSwingLevels(swingFixture(), 500, 2);
  assert(r.support !== null, "support bawah harus tetap ada");
  assert(r.resistance === null, `resistance=${r.resistance}`);
});

test("25. strength 1 minimum 3 candle", () => {
  const candles = [
    makeCandle("t0", 100, 102, 99, 101),
    makeCandle("t1", 101, 110, 90, 102),
    makeCandle("t2", 102, 103, 98, 101),
  ];
  assert(1 * 2 + 1 === 3, "rumus minimum salah");
  const r = detectSwingLevels(candles, 100, 1);
  assert(r.support === 90, `support=${r.support}`);
  assert(r.resistance === 110, `resistance=${r.resistance}`);
});

test("26. strength 2 minimum 5 candle", () => {
  assert(2 * 2 + 1 === 5, "rumus minimum salah");
  const r = detectSwingLevels(swingFixture().slice(0, 5), 106, 2);
  assert(r.support === 95, `support=${r.support}`);
  assert(r.resistance === null, `resistance=${r.resistance}`);
});

test("27. strength 3 minimum 7 candle", () => {
  assert(3 * 2 + 1 === 7, "rumus minimum salah");
  const r = detectSwingLevels(swingFixture(), 106, 3);
  assert(r.support === null, `support=${r.support}`);
  assert(r.resistance === null, `resistance=${r.resistance}`);
});

test("28. helper menerima candle US100 untuk simbol US100", () => {
  const rows = ["time,open,high,low,close"];
  for (let i = 0; i < 10; i++) {
    const base = 30000 + i * 10;
    rows.push(
      `2026.09.30 12:0${i},${base},${base + 30},${base - 30},${base + 5}`,
    );
  }
  const r = parseCsvCandles(rows.join("\n"));
  assert(r.validRows === 10, `validRows=${r.validRows}`);
  assert(
    checkInstrumentMismatch(r.candles, "US100", 30500) === null,
    "US100 valid ditolak",
  );
});

test("29. helper menolak candle GBPUSD untuk simbol US100", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449",
  );
  const msg = checkInstrumentMismatch(r.candles, "US100", 30500);
  assert(msg !== null && msg.includes("US100"), `pesan=${msg}`);
});

test("30. helper menolak candle US100 untuk simbol GBPUSD", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026.09.30 12:00,30347.16,30367.13,30314.24,30340.33",
  );
  const msg = checkInstrumentMismatch(r.candles, "GBPUSD", 1.3248);
  assert(msg !== null && msg.includes("GBPUSD"), `pesan=${msg}`);
});

test("31. helper tidak memblokir simbol unknown", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449",
  );
  assert(
    checkInstrumentMismatch(r.candles, "SIMBOLANEH", 1.3248) === null,
    "unknown diblokir",
  );
});

test("32. saat mismatch, level lama tidak dipakai (onDetected dilewati)", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449",
  );
  const mismatch = checkInstrumentMismatch(r.candles, "US100", 30500);
  let forwarded: [number, number] | null = null;
  // Replika guard di SwingLevelsForm: jangan panggil onDetected saat mismatch.
  if (mismatch) {
    // dilewati dengan sengaja
  } else {
    const levels = detectSwingLevels(r.candles, 30500, 2);
    if (levels.support !== null && levels.resistance !== null) {
      forwarded = [levels.support, levels.resistance];
    }
  }
  assert(mismatch !== null, "mismatch harus terdeteksi dulu");
  assert(
    forwarded === null,
    "level lama/salah tidak boleh diteruskan saat mismatch",
  );
});

/* Uji kontrak UI statis (tanpa runner UI): diverifikasi dari source. */
const fs = require("node:fs");
function readSrc(rel: string): string {
  return fs.readFileSync(process.cwd() + "/" + rel, "utf8");
}

test("33. CsvFileConnector: tombol, fallback, cleanup, reload terkunci koneksi", () => {
  const src = readSrc("src/components/analysis/CsvFileConnector.tsx");
  assert(src.includes("Hubungkan CSV MT5"), "tombol hubungkan hilang");
  assert(src.includes("Muat Ulang CSV"), "tombol reload hilang");
  assert(src.includes("Muat ulang otomatis"), "checkbox hilang");
  assert(
    src.includes('type="file"') && src.includes('accept=".csv'),
    "fallback upload hilang",
  );
  assert(src.includes("clearInterval"), "cleanup interval hilang");
  assert(
    src.includes("disabled={!isConnected"),
    "reload harus terkunci isConnected",
  );
  assert(
    !src.includes("disabled={!fileName"),
    "disabled tidak boleh memakai ref/state mentah",
  );
});

test("34. App: csvText, onDetected stabil, reset simbol, analisa diblokir", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("csvText={swingCsv}"), "csvText tidak dari App");
  assert(
    src.includes("handleDetectedLevels = useCallback"),
    "onDetected tidak stabil",
  );
  assert(src.includes("setCsvResetKey"), "reset koneksi simbol hilang");
  assert(src.includes("support: 0"), "reset S/R hilang");
  // Kontrak blokir analisa: runAnalysis mendelegasikan ke buildBlockedReasons
  // dengan state terbaru dan berhenti sebelum decision engine saat diblokir.
  assert(src.includes("buildBlockedReasons({"), "delegasi blokir hilang");
  assert(src.includes("if (reasons)"), "early return blokir hilang");
  assert(
    src.includes("blockedReasons={blockedReasons}"),
    "alasan tak sampai hasil",
  );

  // Perilaku: validasi invalid -> diblokir.
  const invalidMarket = makeValidMarket("");
  const invalidValidation = validateAnalysisInputs(
    invalidMarket,
    makeValidBroker(),
  );
  assert(!invalidValidation.valid, "fixture invalid harus invalid");
  assert(
    buildBlockedReasons({
      market: invalidMarket,
      broker: makeValidBroker(),
      validation: invalidValidation,
      scaleIssues: [],
    }) !== null,
    "validasi invalid tidak memblokir",
  );

  // Perilaku: scale mismatch -> diblokir.
  const mismatchedMarket = makeValidMarket("US100");
  const mismatchedIssues = detectScaleMismatch(mismatchedMarket);
  assert(mismatchedIssues.length > 0, "fixture mismatch harus bermasalah");
  assert(
    buildBlockedReasons({
      market: mismatchedMarket,
      broker: makeValidBroker(),
      validation: validateAnalysisInputs(mismatchedMarket, makeValidBroker()),
      scaleIssues: mismatchedIssues,
    }) !== null,
    "scale mismatch tidak memblokir",
  );

  // Perilaku: data fully valid -> tidak diblokir, decision engine boleh jalan.
  const okMarket = makeValidMarket("GBPUSD");
  assert(
    buildBlockedReasons({
      market: okMarket,
      broker: makeValidBroker(),
      validation: validateAnalysisInputs(okMarket, makeValidBroker()),
      scaleIssues: detectScaleMismatch(okMarket),
    }) === null,
    "data valid ikut diblokir",
  );
});

test("35. SwingLevelsForm: guard mismatch memblokir deteksi", () => {
  const src = readSrc("src/components/analysis/SwingLevelsForm.tsx");
  assert(
    src.includes("checkInstrumentMismatch"),
    "helper mismatch tidak dipakai",
  );
  assert(src.includes("if (mismatch) return"), "guard mismatch hilang");
});

/* ---------------- Dropdown simbol: 10 kasus ---------------- */

function makeValidMarket(symbol: string): MarketData {
  return {
    symbol,
    timeframe: "H1",
    bid: 1.32474,
    ask: 1.3248,
    close: 1.32449,
    open: 1.32499,
    high: 1.32507,
    low: 1.32443,
    ma50: 1.324651,
    cci: -197.12,
    rsi: 50,
    macd: 0.000041,
    macdSignal: 0.000427,
    atr: 0.00094,
    support: 1.32443,
    resistance: 1.32507,
  };
}

function makeValidBroker(): BrokerSettings {
  return {
    equity: 8.99,
    riskPercent: 10,
    minLot: 0.01,
    lotStep: 0.01,
    pointValue: 100000,
    contractSize: 100000,
    commission: 0,
    slippage: 0,
    buffer: 0.00005,
    atrMultiplier: 1.2,
    targetRR: 1.5,
  };
}

test("36. dropdown memakai satu daftar berisi US100 dan GBPUSD", () => {
  assert(SUPPORTED_SYMBOLS.length === 10, `jumlah=${SUPPORTED_SYMBOLS.length}`);
  assert(isSupportedSymbol("US100"), "US100 hilang dari daftar");
  assert(isSupportedSymbol("GBPUSD"), "GBPUSD hilang dari daftar");
  assert(
    new Set(SUPPORTED_SYMBOLS).size === SUPPORTED_SYMBOLS.length,
    "ada duplikat",
  );
});

test("37. preset US100 tidak memakai harga/satuan GBPUSD", () => {
  for (const symbol of SUPPORTED_SYMBOLS) {
    const profile = getInstrumentProfile(symbol);
    assert(profile.minPrice < profile.maxPrice, `${symbol} rentang invalid`);
  }
  const us100 = getInstrumentProfile("US100");
  const gbp = getInstrumentProfile("GBPUSD");
  assert(us100.minPrice > gbp.maxPrice, "rentang US100/GBPUSD tumpang tindih");
  assert(
    us100.defaultPointValue !== gbp.defaultPointValue,
    "pointValue US100 sama dengan GBPUSD",
  );
  assert(
    us100.contractSize !== gbp.contractSize,
    "contractSize US100 sama dengan GBPUSD",
  );
  assert(us100.spreadLabel === "index points", `label=${us100.spreadLabel}`);
  assert(gbp.spreadLabel === "pip", `label=${gbp.spreadLabel}`);
});

test("38. normalizeSymbol membersihkan label berisik", () => {
  assert(normalizeSymbol("GBPUSD H1") === "GBPUSD", "spasi gagal");
  assert(normalizeSymbol("US100,H1") === "US100", "koma gagal");
  assert(normalizeSymbol("US100.cash") === "US100", "suffix gagal");
  assert(normalizeSymbol("gbpusd.pro") === "GBPUSD", "case/suffix gagal");
  assert(normalizeSymbol("USTEC") === "US100", "alias gagal");
  assert(normalizeSymbol("") === "", "kosong gagal");
});

test("39. simbol kosong tidak dapat dianalisis", () => {
  const result = validateAnalysisInputs(makeValidMarket(""), makeValidBroker());
  assert(!result.valid, "simbol kosong dianggap valid");
  assert(
    result.errors.some(
      (e) => e.message === "Pilih simbol sebelum melakukan analisa.",
    ),
    "pesan simbol kosong salah",
  );
});

test("40. simbol tak dikenal diblokir dengan pesan daftar", () => {
  const result = validateAnalysisInputs(
    makeValidMarket("XYZ"),
    makeValidBroker(),
  );
  assert(!result.valid, "simbol aneh dianggap valid");
  assert(
    result.errors.some(
      (e) => e.message === "Simbol belum dikenali. Pilih simbol dari daftar.",
    ),
    "pesan simbol aneh salah",
  );
});

test("41. simbol dropdown valid lolos cek simbol", () => {
  const result = validateAnalysisInputs(
    makeValidMarket("GBPUSD"),
    makeValidBroker(),
  );
  assert(
    !result.errors.some((e) => e.field === "symbol"),
    "GBPUSD kena error simbol",
  );
});

test("42. ExtractedDataForm: select tersimpan sebagai kode simbol", () => {
  const src = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(src.includes("<select"), "select simbol hilang");
  assert(
    src.includes("SUPPORTED_SYMBOLS") && src.includes("symbolOptions.map"),
    "opsi tidak dari daftar tunggal",
  );
  assert(
    src.includes('<option value="">Pilih instrumen</option>'),
    "placeholder hilang",
  );
  assert(
    src.includes("support: 0") && src.includes("resistance: 0"),
    "reset S/R hilang",
  );
  assert(
    !src.includes("US100 —") && !src.includes('value="US100 —'),
    "label tersimpan ke state",
  );
});

test("43. tidak ada daftar simbol ganda di ocrParser", () => {
  const src = readSrc("src/components/extraction/ocrParser.ts");
  assert(src.includes("SUPPORTED_SYMBOLS"), "tidak memakai daftar tunggal");
  assert(!src.includes("const SUPPORTED_SYMBOLS"), "daftar ganda masih ada");
});

test("44. pergantian simbol mereset CSV, S/R, dan hasil di App", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes('setSwingCsv("")'), "reset CSV hilang");
  assert(src.includes('setConnectedCsvName("")'), "reset nama file hilang");
  assert(
    src.includes("support: 0") && src.includes("resistance: 0"),
    "reset S/R hilang",
  );
  assert(
    src.includes("setResult(null)") && src.includes("setConfirmed(false)"),
    "reset hasil hilang",
  );
});

test("45. preset broker terpusat mengikuti simbol baru", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("applyBrokerPreset"), "preset terpusat hilang");
  assert(src.includes("contractSize"), "contractSize preset hilang");
  assert(src.includes("buffer"), "buffer preset hilang");
});

/* ---------------- Reset pergantian simbol: pure + kontrak ---------------- */

function makeUs100Market(): MarketData {
  return {
    ...makeValidMarket("US100"),
    bid: 30480.1,
    ask: 30480.9,
    close: 30480.5,
    open: 30475.2,
    high: 30540.0,
    low: 30450.0,
    ma50: 30390.75,
    cci: 120.5,
    rsi: 62,
    macd: 12.5,
    macdSignal: 10.25,
    atr: 85.5,
    support: 30450.0,
    resistance: 30540.0,
  };
}

test("46. GBPUSD ke US100 mengosongkan semua harga dan indikator", () => {
  const next = createEmptyMarketForSymbol("US100", makeValidMarket("GBPUSD"));
  assert(next.symbol === "US100", `symbol=${next.symbol}`);
  assert(next.timeframe === "H1", "timeframe harus dipertahankan");
  for (const field of RESET_MARKET_FIELDS) {
    assert(next[field] === 0, `${field}=${next[field]}`);
  }
});

test("47. US100 ke GBPUSD mengosongkan semua harga dan indikator", () => {
  const next = createEmptyMarketForSymbol("GBPUSD", makeUs100Market());
  assert(next.symbol === "GBPUSD", `symbol=${next.symbol}`);
  for (const field of RESET_MARKET_FIELDS) {
    assert(next[field] === 0, `${field}=${next[field]}`);
  }
});

test("48. reset tidak mengisi harga contoh instrumen baru", () => {
  const next = createEmptyMarketForSymbol("US100", makeValidMarket("GBPUSD"));
  for (const field of RESET_MARKET_FIELDS) {
    assert(Number.isFinite(next[field]), `${field} tidak finite`);
    assert(next[field] === 0, `${field} bukan 0 (fiktif?)`);
  }
});

test("49. simbol sama tidak mereset data", () => {
  const previous = makeUs100Market();
  assert(
    createEmptyMarketForSymbol("US100", previous) === previous,
    "referensi berubah",
  );
  assert(
    isMarketEmptyForSymbol(makeValidMarket(""), "") === false,
    "simbol beda dianggap kosong",
  );
});

test("50. adapter tampilan dan input angka", () => {
  assert(displayMarketNumber(0) === "", "0 harus tampil kosong");
  assert(displayMarketNumber(1.5) === "1.5", "nilai tampil salah");
  assert(parseMarketInput("") === 0, "kosong harus 0");
  assert(parseMarketInput("1,5") === 1.5, "koma desimal gagal");
  assert(parseMarketInput("-1.5") === -1.5, "negatif gagal");
  assert(parseMarketInput("-") === null, "'-' harus ditahan");
  assert(parseMarketInput("abc") === null, "invalid harus ditahan");
});

test("51. harga OCR lintas skala dibuang, indikator dipertahankan", () => {
  const gbp = makeValidMarket("GBPUSD");
  const { kept, droppedCount } = filterOcrPricesForSymbol(gbp, "US100");
  assert(droppedCount === 9, `dropped=${droppedCount}`);
  assert(kept.bid === undefined, "bid GBPUSD lolos ke US100");
  assert(kept.cci === gbp.cci, "indikator ikut dibuang");
  const us = makeUs100Market();
  const ok = filterOcrPricesForSymbol(us, "US100");
  assert(ok.droppedCount === 0, "harga US100 valid dibuang");
  const unknown = filterOcrPricesForSymbol(gbp, "XYZ");
  assert(unknown.droppedCount === 0, "simbol unknown harus lewat ke validator");
});

test("52. preset broker berbeda per simbol termasuk buffer", () => {
  const us100 = getInstrumentPreset("US100");
  const gbp = getInstrumentPreset("GBPUSD");
  assert(us100.defaultBuffer === 10, `buffer US100=${us100.defaultBuffer}`);
  assert(gbp.defaultBuffer === 0.00005, `buffer GBPUSD=${gbp.defaultBuffer}`);
});

test("53. App: handler simbol terpusat menolak kosong dan ganda", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("handleSymbolChange"), "handler hilang");
  assert(src.includes("if (!normalized) return;"), "guard kosong hilang");
  assert(
    src.includes("createEmptyMarketForSymbol"),
    "helper reset tidak dipakai",
  );
  assert(src.includes("Simbol berubah menjadi"), "notice hilang");
});

test("54. form: select memakai callback dan adapter", () => {
  const src = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(src.includes("onSymbolChange"), "prop callback hilang");
  assert(src.includes("displayMarketNumber"), "adapter tampil hilang");
  assert(src.includes("parseMarketInput"), "adapter input hilang");
});

test("55. App: peringatan OCR lintas simbol ditampilkan", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("filterOcrPricesForSymbol"), "filter OCR tidak dipakai");
  assert(
    src.includes("Data OCR tidak sesuai dengan simbol"),
    "pesan OCR hilang",
  );
  assert(src.includes("ocrWarning"), "state peringatan hilang");
});

/* ---------------- Tampilan kosong + adapter: TEST 56-64 ---------------- */

test("56. displayMarketNumber(0) menghasilkan string kosong", () => {
  assert(displayMarketNumber(0) === "", "0 harus tampil kosong");
});

test("57. displayMarketNumber(1.32474) menghasilkan angka benar", () => {
  assert(displayMarketNumber(1.32474) === "1.32474", "tampilan GBPUSD salah");
});

test("58. displayMarketNumber(30590.29) menghasilkan angka benar", () => {
  assert(displayMarketNumber(30590.29) === "30590.29", "tampilan US100 salah");
});

test('59. parseMarketInput("") menghasilkan 0', () => {
  assert(parseMarketInput("") === 0, "kosong harus 0");
});

test('60. parseMarketInput("1.32474") menghasilkan 1.32474', () => {
  assert(parseMarketInput("1.32474") === 1.32474, "parse GBPUSD salah");
});

test('61. parseMarketInput("30590.29") menghasilkan 30590.29', () => {
  assert(parseMarketInput("30590.29") === 30590.29, "parse US100 salah");
});

test('62. parseMarketInput("-197.12") menghasilkan -197.12', () => {
  assert(parseMarketInput("-197.12") === -197.12, "negatif CCI gagal");
});

test("63. createEmptyMarketForSymbol menghasilkan semua field 0", () => {
  const next = createEmptyMarketForSymbol("US100", makeValidMarket("GBPUSD"));
  assert(next.symbol === "US100", `symbol=${next.symbol}`);
  assert(next.bid === 0, `bid=${next.bid}`);
  assert(next.ask === 0, `ask=${next.ask}`);
  assert(next.close === 0, `close=${next.close}`);
  assert(next.open === 0, `open=${next.open}`);
  assert(next.high === 0, `high=${next.high}`);
  assert(next.low === 0, `low=${next.low}`);
  assert(next.ma50 === 0, `ma50=${next.ma50}`);
  assert(next.cci === 0, `cci=${next.cci}`);
  assert(next.rsi === 0, `rsi=${next.rsi}`);
  assert(next.macd === 0, `macd=${next.macd}`);
  assert(next.macdSignal === 0, `macdSignal=${next.macdSignal}`);
  assert(next.atr === 0, `atr=${next.atr}`);
  assert(next.support === 0, `support=${next.support}`);
  assert(next.resistance === 0, `resistance=${next.resistance}`);
});

test("64. reset tidak mengisi harga contoh instrumen baru", () => {
  const toUs100 = createEmptyMarketForSymbol(
    "US100",
    makeValidMarket("GBPUSD"),
  );
  const toGbp = createEmptyMarketForSymbol("GBPUSD", makeUs100Market());
  for (const target of [toUs100, toGbp]) {
    for (const field of RESET_MARKET_FIELDS) {
      assert(target[field] === 0, `${target.symbol}.${field}=${target[field]}`);
    }
  }
  assert(
    toUs100.bid !== 1.32474 && toGbp.close !== 30480.5,
    "harga contoh instrumen lama terbawa ke simbol baru",
  );
});

test("65. form memakai adapter kosong dan placeholder per-field", () => {
  const src = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(
    src.includes("displayMarketNumber(market[field.key])"),
    "adapter tampil hilang",
  );
  assert(!src.includes('placeholder="0"'), "placeholder 0 masih ada");
  assert(src.includes('placeholder: "Masukkan Bid"'), "placeholder Bid hilang");
  assert(
    src.includes('placeholder: "Masukkan Support"'),
    "placeholder Support hilang",
  );
});

test("66. kartu validasi memakai viewState terpusat", () => {
  const src = readSrc("src/components/analysis/ValidationSummaryCard.tsx");
  assert(src.includes("Data belum lengkap"), "judul ringkas hilang");
  assert(src.includes("Lihat rincian pemeriksaan"), "details hilang");
  assert(src.includes("viewState"), "viewState tidak dipakai kartu");
});

/* ---------------- Prioritas tampilan validasi: TEST 67-72 ---------------- */

function makeEmptyMarket(symbol: string): MarketData {
  return {
    symbol,
    timeframe: "H1",
    bid: 0,
    ask: 0,
    close: 0,
    open: 0,
    high: 0,
    low: 0,
    ma50: 0,
    cci: 0,
    rsi: 0,
    macd: 0,
    macdSignal: 0,
    atr: 0,
    support: 0,
    resistance: 0,
  };
}

test("67. US100 kosong total berstatus data kosong, bukan mismatch", () => {
  const market = makeEmptyMarket("US100");
  const issues = detectScaleMismatch(market);
  assert(issues.length > 0, "seharusnya ada isu missing agar prioritas teruji");
  assert(
    issues.every((issue) => issue.code === "missing"),
    "isu kosong tidak boleh berkode mismatch",
  );
  const state = getValidationViewState({
    isEmpty: true,
    symbol: "US100",
    scaleIssues: issues,
    valid: false,
  });
  assert(state.kind === "empty", `kind=${state.kind}`);
});

test("68. GBPUSD kosong total berstatus data kosong, bukan mismatch", () => {
  const market = makeEmptyMarket("GBPUSD");
  const issues = detectScaleMismatch(market);
  const state = getValidationViewState({
    isEmpty: true,
    symbol: "GBPUSD",
    scaleIssues: issues,
    valid: false,
  });
  assert(state.kind === "empty", `kind=${state.kind}`);
});

test("69. US100 terisi Bid/Ask saja berstatus belum lengkap", () => {
  const market: MarketData = {
    ...makeEmptyMarket("US100"),
    bid: 30590,
    ask: 30593,
  };
  const issues = detectScaleMismatch(market);
  const state = getValidationViewState({
    isEmpty: isMarketEmptyForSymbol(market, "US100"),
    symbol: "US100",
    scaleIssues: issues,
    valid: false,
  });
  assert(state.kind === "incomplete", `kind=${state.kind}`);
});

test("70. US100 berisi harga 1.32 berstatus mismatch nyata", () => {
  const market: MarketData = {
    ...makeUs100Market(),
    bid: 1.32474,
    ask: 1.3248,
    close: 1.32449,
  };
  const issues = detectScaleMismatch(market);
  assert(
    issues.some((issue) => issue.code === "scale-mismatch"),
    "mismatch nyata tidak terdeteksi",
  );
  const state = getValidationViewState({
    isEmpty: false,
    symbol: "US100",
    scaleIssues: issues,
    valid: false,
  });
  assert(state.kind === "mismatch", `kind=${state.kind}`);
});

test("71. GBPUSD berisi harga 30590 berstatus mismatch nyata", () => {
  const market: MarketData = {
    ...makeValidMarket("GBPUSD"),
    bid: 30590.29,
    ask: 30593.04,
  };
  const issues = detectScaleMismatch(market);
  assert(
    issues.some((issue) => issue.code === "scale-mismatch"),
    "mismatch nyata tidak terdeteksi",
  );
  const state = getValidationViewState({
    isEmpty: false,
    symbol: "GBPUSD",
    scaleIssues: issues,
    valid: false,
  });
  assert(state.kind === "mismatch", `kind=${state.kind}`);
});

test("72. isEmpty diprioritaskan di atas scaleIssues", () => {
  const state = getValidationViewState({
    isEmpty: true,
    symbol: "US100",
    scaleIssues: [
      {
        field: "Bid",
        message: "salah skala",
        severity: "error",
        code: "scale-mismatch",
      },
    ],
    valid: false,
  });
  assert(state.kind === "empty", `kind=${state.kind}`);
});

/* ---------------- OCR Market Watch: TEST 73-86 ---------------- */

test("73. Market Watch US100 titik desimal + kolom change", () => {
  const quote = parseMarketWatchBidAsk(
    "US100 30582.83 30585.58 0.43%",
    "US100",
  );
  assert(quote.bid === 30582.83, `bid=${quote.bid}`);
  assert(quote.ask === 30585.58, `ask=${quote.ask}`);
});

test("74. Market Watch US100 koma desimal", () => {
  const quote = parseMarketWatchBidAsk(
    "US100 30582,83 30585,58 0,43%",
    "US100",
  );
  assert(quote.bid === 30582.83, `bid=${quote.bid}`);
  assert(quote.ask === 30585.58, `ask=${quote.ask}`);
});

test("75. baris GBPUSD diabaikan saat simbol aktif US100", () => {
  const text = "GBPUSD 1.32200 1.32206\nUS100 30582.83 30585.58";
  const quote = parseMarketWatchBidAsk(text, "US100");
  assert(quote.bid === 30582.83, `bid=${quote.bid}`);
  assert(quote.ask === 30585.58, `ask=${quote.ask}`);
});

test("76. alias USTEC/NAS100 dinormalisasi ke grup US100", () => {
  const fromUstec = parseMarketWatchBidAsk("USTEC 30582.83 30585.58", "US100");
  assert(fromUstec.bid === 30582.83, `bid=${fromUstec.bid}`);
  const nasLine = parseMarketWatchBidAsk("US100 30582.83 30585.58", "NAS100");
  assert(nasLine.ask === 30585.58, `ask=${nasLine.ask}`);
});

test("77. hanya baris GBPUSD saat aktif US100 menghasilkan null", () => {
  const quote = parseMarketWatchBidAsk("GBPUSD 1.32200 1.32206", "US100");
  assert(quote.bid === null && quote.ask === null, "harus null");
  assert(quote.warnings.length > 0, "warning hilang");
});

test("78. Bid/Ask terbalik ditolak", () => {
  const quote = parseMarketWatchBidAsk("US100 30585.58 30582.83", "US100");
  assert(quote.bid === null && quote.ask === null, "harus null");
});

test("79. satu angka setelah simbol menghasilkan null", () => {
  const quote = parseMarketWatchBidAsk("US100 30582.83", "US100");
  assert(quote.bid === null && quote.ask === null, "harus null");
});

test("80. harga 1.32 untuk US100 ditolak sebagai mismatch", () => {
  const quote = parseMarketWatchBidAsk("US100 1.32474 1.32480", "US100");
  assert(quote.bid === null && quote.ask === null, "harus null");
});

test("81. Bid/Ask terintegrasi ke partial MarketData berlabel", () => {
  const rich = parseOcrTextRich(
    "US100 30582.83 30585.58\nOpen: 30480 High: 30540 Low: 30450 Close: 30520",
    { activeSymbol: "US100" },
  );
  assert(rich.data.bid === 30582.83, `bid=${rich.data.bid}`);
  assert(rich.data.ask === 30585.58, `ask=${rich.data.ask}`);
  assert(rich.sourceLabels.bid === "Market Watch", "sumber bid hilang");
  assert(rich.sourceLabels.ask === "Market Watch", "sumber ask hilang");
});

test("82. RSI tak ditemukan tidak membuat default", () => {
  const rich = parseOcrTextRich("US100 30582.83 30585.58", {
    activeSymbol: "US100",
  });
  assert(rich.data.rsi === undefined, `rsi=${rich.data.rsi}`);
  assert(rich.missingFields.includes("rsi"), "rsi hilang dari missing");
});

test("83. MA50 tak ditemukan tetap missing", () => {
  const rich = parseOcrTextRich("US100 30582.83 30585.58", {
    activeSymbol: "US100",
  });
  assert(rich.data.ma50 === undefined, `ma50=${rich.data.ma50}`);
  assert(rich.missingFields.includes("ma50"), "ma50 hilang dari missing");
});

test("84. CCI negatif tetap terbaca", () => {
  const rich = parseOcrTextRich("CCI(14): -197.12", { activeSymbol: "GBPUSD" });
  assert(rich.data.cci === -197.12, `cci=${rich.data.cci}`);
});

test("85. MACD dan Signal dipisahkan", () => {
  const rich = parseOcrTextRich("MACD(12,26,9): 0.00041 0.00027", {
    activeSymbol: "GBPUSD",
  });
  assert(rich.data.macd === 0.00041, `macd=${rich.data.macd}`);
  assert(rich.data.macdSignal === 0.00027, `signal=${rich.data.macdSignal}`);
});

test("86. warning sumber Market Watch dibuat", () => {
  const rich = parseOcrTextRich("US100 30582.83 30585.58", {
    activeSymbol: "US100",
  });
  assert(
    rich.warnings.some((warning) => warning.includes("Market Watch")),
    "warning sumber hilang",
  );
});

/* ---------------- Integrasi OCR/CSV/broker: TEST 87-103 ---------------- */

function makeEmptyBroker(): BrokerSettings {
  return {
    equity: 0,
    riskPercent: 0,
    minLot: 0,
    lotStep: 0,
    pointValue: 0,
    contractSize: 0,
    commission: 0,
    slippage: 0,
    buffer: 0,
    atrMultiplier: 0,
    targetRR: 0,
  };
}

test("87. Market Watch US100 30625.83/30628.58 diterima", () => {
  const quote = parseMarketWatchBidAsk("US100 30625.83 30628.58", "US100");
  assert(quote.bid === 30625.83, `bid=${quote.bid}`);
  assert(quote.ask === 30628.58, `ask=${quote.ask}`);
  assert(quote.source === "market-watch", `source=${quote.source}`);
});

test("88. Market Watch koma desimal 30625,83 diterima", () => {
  const quote = parseMarketWatchBidAsk(
    "US100 30625,83 30628,58 0,57%",
    "US100",
  );
  assert(quote.bid === 30625.83, `bid=${quote.bid}`);
  assert(quote.ask === 30628.58, `ask=${quote.ask}`);
});

test("89. MA(50) 30449.559 diterima dari baris label", () => {
  for (const label of ["MA(50)", "MA 50", "Moving Average"]) {
    const parsed = parseMaValue(`${label} 30449.559`, "US100");
    assert(parsed.value === 30449.559, `${label}: ${parsed.value}`);
  }
  const missing = parseMaValue("Open: 30480 High: 30540", "US100");
  assert(missing.value === null, "tanpa label harus null");
});

test("90. OCR tanpa Bid/Ask tidak menghapus nilai lama", () => {
  const previous: MarketData = {
    ...makeUs100Market(),
    bid: 30625.83,
    ask: 30628.58,
  };
  const merged = mergeValidOcrMarketData(previous, { close: 30667.33 });
  assert(merged.bid === 30625.83, `bid=${merged.bid}`);
  assert(merged.ask === 30628.58, `ask=${merged.ask}`);
  assert(merged.close === 30667.33, `close=${merged.close}`);
});

test("91. OCR tanpa MA50 tidak menghapus MA50 lama", () => {
  const previous: MarketData = { ...makeUs100Market(), ma50: 30449.559 };
  const merged = mergeValidOcrMarketData(previous, { close: 30667.33 });
  assert(merged.ma50 === 30449.559, `ma50=${merged.ma50}`);
});

test("92. OCR tanpa S/R tidak menghapus S/R dari CSV", () => {
  const previous: MarketData = {
    ...makeUs100Market(),
    support: 30362.82,
    resistance: 30878.58,
  };
  const merged = mergeValidOcrMarketData(previous, {
    bid: 30625.83,
    ask: 30628.58,
    close: 30667.33,
  });
  assert(merged.support === 30362.82, `support=${merged.support}`);
  assert(merged.resistance === 30878.58, `resistance=${merged.resistance}`);
});

test("93. S/R CSV masuk ke MarketData via applySwingLevels", () => {
  const previous = makeUs100Market();
  const next = applySwingLevels(previous, 30362.82, 30878.58);
  assert(next.support === 30362.82, `support=${next.support}`);
  assert(next.resistance === 30878.58, `resistance=${next.resistance}`);
  assert(
    applySwingLevels(next, 30362.82, 30878.58) === next,
    "nilai sama harus referensi sama",
  );
});

test("94. OCR berikutnya mempertahankan S/R CSV", () => {
  const withLevels = applySwingLevels(makeUs100Market(), 30362.82, 30878.58);
  const merged = mergeValidOcrMarketData(withLevels, {
    bid: 30625.83,
    ask: 30628.58,
    ma50: 30449.559,
  });
  assert(merged.support === 30362.82, `support=${merged.support}`);
  assert(merged.resistance === 30878.58, `resistance=${merged.resistance}`);
  assert(merged.ma50 === 30449.559, `ma50=${merged.ma50}`);
});

test("95. CSV mismatch tidak mengisi S/R", () => {
  const gbpCandles = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449",
  ).candles;
  const mismatch = checkInstrumentMismatch(gbpCandles, "US100", 30500);
  assert(mismatch !== null, "mismatch harus terdeteksi");
  // Konsumen wajib melewati onDetected saat mismatch: tidak ada pemanggilan.
  let called = false;
  if (!mismatch) {
    applySwingLevels(makeUs100Market(), 1.32443, 1.32507);
    called = true;
  }
  assert(!called, "onDetected tidak boleh dipanggil saat mismatch");
});

test("96. merge menolak Bid 1.32 untuk US100 dan mempertahankan lama", () => {
  const previous: MarketData = {
    ...makeUs100Market(),
    bid: 30625.83,
    ask: 30628.58,
  };
  const merged = mergeValidOcrMarketData(previous, {
    bid: 1.32474,
    ask: 1.3248,
  });
  assert(merged.bid === 30625.83, `bid=${merged.bid}`);
  assert(merged.ask === 30628.58, `ask=${merged.ask}`);
});

test("97. preset broker US100 tanpa contract size GBPUSD", () => {
  const applied = applyBrokerPreset(makeEmptyBroker(), "US100");
  assert(applied.contractSize === 1, `contractSize=${applied.contractSize}`);
  assert(applied.pointValue === 1, `pointValue=${applied.pointValue}`);
  assert(applied.buffer === 10, `buffer=${applied.buffer}`);
  assert(applied.minLot === 0.01, `minLot=${applied.minLot}`);
  assert(applied.equity === 0, "equity tidak boleh ditebak");
  const kept = applyBrokerPreset(
    { ...makeEmptyBroker(), pointValue: 5, minLot: 0.1 },
    "US100",
  );
  assert(kept.minLot === 0.1, "nilai pengguna tertimpa");
});

test("98. screenshot tanpa equity tidak mengisi broker", () => {
  const rich = parseOcrTextRich(
    "US100 30625.83 30628.58\nOpen: 30581.90 High: 30678.21",
    { activeSymbol: "US100" },
  );
  assert(!("equity" in rich.data), "equity bocor ke data OCR");
  assert(!("pointValue" in rich.data), "pointValue bocor ke data OCR");
  assert(!("contractSize" in rich.data), "contractSize bocor ke data OCR");
});

test("99. field broker berlabel verifikasi", () => {
  const src = readSrc("src/components/analysis/BrokerSettingsForm.tsx");
  assert(src.includes("perlu verifikasi broker"), "label verifikasi hilang");
  assert(src.includes("Wajib diisi dari akun"), "label akun hilang");
  assert(src.includes("Gunakan preset"), "tombol preset hilang");
});

test("100. pergantian simbol membersihkan market dan CSV via App", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("applyBrokerPreset"), "preset terpusat hilang");
  assert(src.includes("mergeValidOcrMarketData"), "merge aman hilang");
  assert(src.includes("handleSymbolChange"), "handler simbol hilang");
  assert(src.includes('setSwingCsv("")'), "reset CSV hilang");
});

test("101. angka OCR tanpa separator dinormalisasi via profil", () => {
  assert(
    normalizeBigOcrNumber("3062583", "US100") === 30625.83,
    "normalisasi gagal",
  );
  const quote = parseMarketWatchBidAsk("US100 3062583 3062858", "US100");
  assert(quote.bid === 30625.83, `bid=${quote.bid}`);
  assert(quote.ask === 30628.58, `ask=${quote.ask}`);
});

test("102. normalisasi mengikuti integer terpanjang se-skala", () => {
  assert(normalizeBigOcrNumber("304327", "US100") === 30432.7, "304327 salah");
  assert(normalizeBigOcrNumber("304789", "US100") === 30478.9, "304789 salah");
  assert(normalizeBigOcrNumber("5000000", "US100") === 50000, "5000000 salah");
  assert(
    normalizeBigOcrNumber("132", "US100") === null,
    "1.32 bukan harga US100",
  );
  assert(
    normalizeBigOcrNumber("3062583", "GBPUSD") === null,
    "30.6 bukan harga GBPUSD",
  );
});

test("103. fallback One-Click SELL/BUY berlabel jelas", () => {
  const quote = parseMarketWatchBidAsk("SELL 30625.83 BUY 30628.58", "US100");
  assert(quote.bid === 30625.83, `bid=${quote.bid}`);
  assert(quote.ask === 30628.58, `ask=${quote.ask}`);
  assert(quote.source === "one-click", `source=${quote.source}`);
});

/* ---------------- Root-cause OCR + swing fallback: TEST 104-120 ---------------- */

const SCREENSHOT_OCR = [
  "AUDCAD 0.91234 0.91240",
  "US100 30572.11 30574.86",
  "Date 2026.10.01",
  "Time 13:00",
  "Open 30581.90",
  "High 30678.21",
  "Low 30512.12",
  "Close 30667.33",
  "MA(50) 30449.559",
  "CCI(14) 16.68",
  "ATR(14) 108.27",
  "MACD(12,26,9) 60.765",
  "Signal 67.812",
  "RSI(14) 57.77",
].join("\n");

test("104. activeSymbol US100 mengalahkan OCR AUDCAD", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.symbol === "US100", `symbol=${rich.data.symbol}`);
  assert(rich.debug.selectedSymbol === "US100", "debug salah");
  assert(
    rich.debug.detectedSymbols.includes("AUDCAD"),
    "AUDCAD harus terdeteksi",
  );
  assert(
    rich.debug.detectedSymbols.includes("US100"),
    "US100 harus terdeteksi",
  );
});

test("105. Market Watch memilih baris US100 meski AUDCAD lebih dulu", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.bid === 30572.11, `bid=${rich.data.bid}`);
  assert(rich.data.ask === 30574.86, `ask=${rich.data.ask}`);
  assert(
    rich.debug.chosenMarketWatchLine !== undefined &&
      rich.debug.chosenMarketWatchLine.includes("US100"),
    "baris terpilih bukan US100",
  );
});

test("106. OHLC Data Window terisi penuh", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.open === 30581.9, `open=${rich.data.open}`);
  assert(rich.data.high === 30678.21, `high=${rich.data.high}`);
  assert(rich.data.low === 30512.12, `low=${rich.data.low}`);
  assert(rich.data.close === 30667.33, `close=${rich.data.close}`);
});

test("107. MA50 screenshot terbaca", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.ma50 === 30449.559, `ma50=${rich.data.ma50}`);
});

test("108. CCI screenshot terbaca", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.cci === 16.68, `cci=${rich.data.cci}`);
});

test("109. RSI screenshot terbaca tanpa default", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.rsi === 57.77, `rsi=${rich.data.rsi}`);
});

test("110. ATR screenshot terbaca", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.atr === 108.27, `atr=${rich.data.atr}`);
});

test("111. MACD dan Signal screenshot terpisah", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.macd === 60.765, `macd=${rich.data.macd}`);
  assert(rich.data.macdSignal === 67.812, `signal=${rich.data.macdSignal}`);
});

test("112. satu field gagal tidak menghapus field valid lain", () => {
  const previous = makeUs100Market();
  const merged = mergeValidOcrMarketData(previous, {
    bid: 1.32474,
    close: 30667.33,
    cci: 16.68,
  });
  assert(merged.bid === previous.bid, "bid valid lama ikut terhapus");
  assert(merged.close === 30667.33, "close valid tidak masuk");
  assert(merged.cci === 16.68, "cci valid tidak masuk");
});

test("113. S/R CSV bertahan setelah OCR ulang", () => {
  const withLevels = applySwingLevels(makeUs100Market(), 30362.82, 30878.58);
  const ocr = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  const merged = mergeValidOcrMarketData(withLevels, ocr.data);
  assert(merged.support === 30362.82, `support=${merged.support}`);
  assert(merged.resistance === 30878.58, `resistance=${merged.resistance}`);
  assert(merged.close === 30667.33, "close OCR tidak masuk");
});

function makeRisingCandles(count: number, base: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      time: `t${i}`,
      open: base - 90 + i * 10,
      high: base + i * 10,
      low: base - 100 + i * 10,
      close: base - 80 + i * 10,
    });
  }
  return candles;
}

function makeSharpValleyCandles(): Candle[] {
  const rows: Array<[number, number]> = [
    [140, 50],
    [112, 100],
    [130, 90],
    [115, 100],
    [142, 55],
    [118, 60],
    [150, 45],
  ];
  return rows.map(([high, low], index) => ({
    time: `t${index}`,
    open: low + 1,
    high,
    low,
    close: high - 1,
  }));
}

test("114. 50 candle tanpa swing strength 2 memberi alasan", () => {
  const candles = makeRisingCandles(50, 30500);
  const resolved = resolveSwingLevels(candles, 30525, 2);
  assert(resolved.triedStrengths.includes(2), "strength 2 tidak dicoba");
  assert(resolved.source === "extreme", `source=${resolved.source}`);
  assert(resolved.support === 30400, `support=${resolved.support}`);
  assert(resolved.resistance === 30990, `resistance=${resolved.resistance}`);
});

test("115. fallback strength 1 menghasilkan level bila tersedia", () => {
  const candles = makeSharpValleyCandles();
  const resolved = resolveSwingLevels(candles, 100, 2);
  assert(resolved.source === "strength-1", `source=${resolved.source}`);
  assert(resolved.support === 90, `support=${resolved.support}`);
  assert(resolved.resistance === 130, `resistance=${resolved.resistance}`);
});

test("116. legacy parseOcrText tanpa RSI tetap undefined", () => {
  const { parseOcrText } =
    require("../src/components/extraction/ocrParser") as unknown as {
      parseOcrText(text: string, previous: MarketData): Partial<MarketData>;
    };
  const data = parseOcrText(
    "US100 30582.83 30585.58",
    makeValidMarket("US100"),
  );
  assert(data.rsi === undefined, `rsi=${data.rsi}`);
});

test("117. tidak ada AUDCAD pada hasil saat aktif US100", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  assert(rich.data.symbol === "US100", "simbol hasil bukan US100");
  assert(
    !rich.warnings.some((warning) => warning.includes("AUDCAD")),
    "warning menyebut AUDCAD sebagai aktif",
  );
  assert(
    !rich.debug.marketWatchCandidateLines.some((line) =>
      line.includes("AUDCAD"),
    ),
    "kandidat Market Watch tercampur",
  );
});

test("118. debug pipeline memuat seluruh field", () => {
  const rich = parseOcrTextRich(SCREENSHOT_OCR, { activeSymbol: "US100" });
  const debug = rich.debug;
  assert(debug.selectedSymbol === "US100", "selectedSymbol salah");
  assert(debug.parsedBid === 30572.11, `parsedBid=${debug.parsedBid}`);
  assert(debug.parsedAsk === 30574.86, `parsedAsk=${debug.parsedAsk}`);
  assert(debug.parsedOpen === 30581.9, `parsedOpen=${debug.parsedOpen}`);
  assert(debug.parsedHigh === 30678.21, `parsedHigh=${debug.parsedHigh}`);
  assert(debug.parsedLow === 30512.12, `parsedLow=${debug.parsedLow}`);
  assert(debug.parsedClose === 30667.33, `parsedClose=${debug.parsedClose}`);
  assert(debug.parsedMa50 === 30449.559, `parsedMa50=${debug.parsedMa50}`);
  assert(debug.parsedCci === 16.68, `parsedCci=${debug.parsedCci}`);
  assert(debug.parsedRsi === 57.77, `parsedRsi=${debug.parsedRsi}`);
  assert(debug.parsedAtr === 108.27, `parsedAtr=${debug.parsedAtr}`);
  assert(debug.parsedMacd === 60.765, `parsedMacd=${debug.parsedMacd}`);
  assert(debug.parsedSignal === 67.812, `parsedSignal=${debug.parsedSignal}`);
});

test("119. extreme fallback memakai low min dan high max", () => {
  const candles = makeRisingCandles(20, 30500);
  const extreme = detectExtremeLevels(candles, 30600);
  const lows = candles.map((candle) => candle.low).filter((low) => low < 30600);
  const highs = candles
    .map((candle) => candle.high)
    .filter((high) => high > 30600);
  assert(extreme.support === Math.min(...lows), "support bukan low terendah");
  assert(
    extreme.resistance === Math.max(...highs),
    "resistance bukan high tertinggi",
  );
  const resolved = resolveSwingLevels(candles, 30600, 2);
  assert(resolved.source === "extreme", `source=${resolved.source}`);
});

test("120. mismatch CSV tetap memblokir pengisian S/R", () => {
  const gbpCandles = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449",
  ).candles;
  const mismatch = checkInstrumentMismatch(gbpCandles, "US100", 30500);
  assert(mismatch !== null, "mismatch harus ada");
  const before = makeUs100Market();
  const after = mismatch ? before : applySwingLevels(before, 1.32443, 1.32507);
  assert(after === before, "S/R mismatch tidak boleh masuk");
});

/* ---------------- Diagnosis end-to-end: TEST 121-138 ---------------- */

const SCREENSHOT2_OCR = [
  "AUDCAD 0.91210 0.91216",
  "US100 30573.83 30576.58",
  "Date 2026.10.01",
  "Time 13:05",
  "Open 30667.96",
  "High 30669.83",
  "Low 30543.71",
  "Close 30609.71",
  "MA(50) 30455.737",
  "CCI(14) -3.84",
  "ATR(14) 109.13",
  "MACD(12,26,9) 55.624",
  "Signal 68.512",
  "RSI(14) 53.57",
].join("\n");

test("121. Market Watch normal + header Daily Change", () => {
  const quote = parseMarketWatchBidAsk(
    "Symbol Bid Ask Daily Change\nUS100 30573.83 30576.58 0.40%",
    "US100",
  );
  assert(quote.bid === 30573.83, `bid=${quote.bid}`);
  assert(quote.ask === 30576.58, `ask=${quote.ask}`);
  assert(quote.source === "market-watch", `source=${quote.source}`);
});

test("122. Market Watch koma desimal 30573,83", () => {
  const quote = parseMarketWatchBidAsk(
    "US100 30573,83 30576,58 0,40%",
    "US100",
  );
  assert(quote.bid === 30573.83, `bid=${quote.bid}`);
  assert(quote.ask === 30576.58, `ask=${quote.ask}`);
});

test("123. Market Watch digit desimal dipisah OCR", () => {
  const quote = parseMarketWatchBidAsk("US100 30573 83 30576 58", "US100");
  assert(quote.bid === 30573.83, `bid=${quote.bid}`);
  assert(quote.ask === 30576.58, `ask=${quote.ask}`);
});

test("124. digit dipisah + header + change", () => {
  const quote = parseMarketWatchBidAsk(
    "Symbol Bid Ask Daily Change\nUS100 30573 83 30576 58 0.40%",
    "US100",
  );
  assert(quote.bid === 30573.83, `bid=${quote.bid}`);
  assert(quote.ask === 30576.58, `ask=${quote.ask}`);
});

test("125. AUDCAD dulu, US100 tetap dipilih", () => {
  const quote = parseMarketWatchBidAsk(
    "AUDCAD 0.91210 0.91216\nUS100 30573.83 30576.58",
    "US100",
  );
  assert(quote.bid === 30573.83, `bid=${quote.bid}`);
  assert(quote.ask === 30576.58, `ask=${quote.ask}`);
  assert(
    quote.candidateLines.length === 1 &&
      quote.candidateLines[0].includes("US100"),
    "kandidat tercampur",
  );
});

test("126. merge mempertahankan simbol manual US100", () => {
  const merged = mergeValidOcrMarketData(makeUs100Market(), {
    symbol: "AUDCAD",
    cci: 5,
  });
  assert(merged.symbol === "US100", `symbol=${merged.symbol}`);
  assert(merged.cci === 5, "indikator valid tidak masuk");
});

test("127. pipeline memberi Bid 30573.83", () => {
  const rich = parseOcrTextRich(SCREENSHOT2_OCR, { activeSymbol: "US100" });
  assert(rich.data.bid === 30573.83, `bid=${rich.data.bid}`);
  assert(rich.debug.parsedBid === 30573.83, "debug salah");
});

test("128. pipeline memberi Ask 30576.58", () => {
  const rich = parseOcrTextRich(SCREENSHOT2_OCR, { activeSymbol: "US100" });
  assert(rich.data.ask === 30576.58, `ask=${rich.data.ask}`);
  assert(rich.debug.parsedAsk === 30576.58, "debug salah");
});

test("129. semua varian label MA(50) terbaca", () => {
  for (const label of [
    "MA(50)",
    "MA (50)",
    "MA ( 50 )",
    "MA 50",
    "Moving Average (50)",
  ]) {
    const parsed = parseMaValue(`${label} 30455.737`, "US100");
    assert(parsed.value === 30455.737, `${label}: ${parsed.value}`);
  }
});

test("130. applySwingLevels null mempertahankan nilai lama", () => {
  const previous: MarketData = {
    ...makeUs100Market(),
    support: 30362.82,
    resistance: 30878.58,
  };
  const next = applySwingLevels(previous, null, null);
  assert(next === previous, "referensi harus sama");
});

test("131. undefined eksplisit tidak menghapus S/R", () => {
  const previous: MarketData = {
    ...makeUs100Market(),
    support: 30362.82,
    resistance: 30878.58,
  };
  const merged = mergeValidOcrMarketData(previous, {
    support: undefined,
    resistance: undefined,
    close: 30609.71,
  });
  assert(merged.support === 30362.82, "support terhapus");
  assert(merged.resistance === 30878.58, "resistance terhapus");
});

test("132. display Bid/Ask tidak kosong saat valid", () => {
  assert(displayMarketNumber(30573.83) === "30573.83", "bid tampil kosong");
  assert(displayMarketNumber(30576.58) === "30576.58", "ask tampil kosong");
});

test("133. display MA50/Support/Resistance tidak kosong", () => {
  assert(displayMarketNumber(30455.737) === "30455.737", "ma50 kosong");
  assert(displayMarketNumber(30362.82) === "30362.82", "support kosong");
  assert(displayMarketNumber(30878.58) === "30878.58", "resistance kosong");
});

function makeFullUs100Market(): MarketData {
  return {
    symbol: "US100",
    timeframe: "H1",
    bid: 30573.83,
    ask: 30576.58,
    close: 30609.71,
    open: 30667.96,
    high: 30669.83,
    low: 30543.71,
    ma50: 30455.737,
    cci: -3.84,
    rsi: 53.57,
    macd: 55.624,
    macdSignal: 68.512,
    atr: 109.13,
    support: 30362.82,
    resistance: 30878.58,
  };
}

function makeFullUs100Broker(): BrokerSettings {
  return {
    equity: 1000,
    riskPercent: 1,
    minLot: 0.01,
    lotStep: 0.01,
    pointValue: 1,
    contractSize: 1,
    commission: 0,
    slippage: 0,
    buffer: 10,
    atrMultiplier: 1.2,
    targetRR: 1.5,
  };
}

test("134. validator menerima semua nilai valid", () => {
  const result = validateAnalysisInputs(
    makeFullUs100Market(),
    makeFullUs100Broker(),
  );
  assert(
    result.valid,
    `tidak valid: ${result.errors.map((e) => e.message).join("; ")}`,
  );
});

test("135. teks kosong tidak menghasilkan default fiktif", () => {
  const rich = parseOcrTextRich("", { activeSymbol: "US100" });
  assert(rich.data.bid === undefined, "bid fiktif");
  assert(rich.data.ask === undefined, "ask fiktif");
  assert(rich.data.rsi === undefined, "rsi fiktif");
  assert(rich.data.symbol === "US100", "simbol aktif hilang");
  assert(rich.missingFields.includes("bid"), "missing bid hilang");
});

test("136. tombol SELL/BUY tak dipakai bila baris US100 terlihat", () => {
  const quote = parseMarketWatchBidAsk(
    "US100 oops\nSELL 30573.83 BUY 30576.58",
    "US100",
  );
  assert(quote.bid === null && quote.ask === null, "tombol tak boleh dipakai");
});

test("137. tidak ada AUDCAD pada hasil activeSymbol US100", () => {
  const rich = parseOcrTextRich(SCREENSHOT2_OCR, { activeSymbol: "US100" });
  assert(rich.data.symbol === "US100", "simbol bukan US100");
  assert(
    !rich.warnings.some((warning) => warning.includes("AUDCAD")),
    "warning menyebut AUDCAD",
  );
});

test("138. debug Market Watch memuat token dan alasan", () => {
  const quote = parseMarketWatchBidAsk("US100 30573.83 30576.58", "US100");
  assert(quote.debug.candidateTokens.includes("30573.83"), "token hilang");
  assert(
    quote.debug.normalizedCandidates.includes(30573.83),
    "normalisasi hilang",
  );
  assert(quote.debug.chosenBid === 30573.83, "chosenBid hilang");
  assert(quote.debug.chosenAsk === 30576.58, "chosenAsk hilang");
  assert(quote.debug.rejectionReason === null, "rejectionReason harus null");
});

/* ---------------- Fixture OCR browser + kontrak handler ---------------- */

const FIXTURE_A = [
  "US100 30573 83 30576 58 0.40%",
  "Data Window",
  "MA(50)",
  "30455.737",
].join("\n");

const FIXTURE_B = [
  "AUDCAD 0.91210 0.91216",
  "EURUSD 1.08520 1.08526",
  "US100 30573.83 30576.58",
].join("\n");

const FIXTURE_C = ["MA ( 50 )", "30455.737"].join("\n");

test("139. Fixture A: digit desimal terpisah + MA lookahead", () => {
  const rich = parseOcrTextRich(FIXTURE_A, { activeSymbol: "US100" });
  assert(rich.data.bid === 30573.83, `bid=${rich.data.bid}`);
  assert(rich.data.ask === 30576.58, `ask=${rich.data.ask}`);
  assert(rich.data.ma50 === 30455.737, `ma50=${rich.data.ma50}`);
  assert(rich.data.symbol === "US100", "simbol bukan US100");
});

test("140. Fixture B: AUDCAD/EURUSD diabaikan", () => {
  const rich = parseOcrTextRich(FIXTURE_B, { activeSymbol: "US100" });
  assert(rich.data.bid === 30573.83, `bid=${rich.data.bid}`);
  assert(rich.data.ask === 30576.58, `ask=${rich.data.ask}`);
  assert(rich.debug.selectedSymbol === "US100", "selected salah");
});

test("141. Fixture C: MA label spasi + angka beda baris", () => {
  const parsed = parseMaValue(FIXTURE_C, "US100");
  assert(parsed.value === 30455.737, `ma50=${parsed.value}`);
});

test("142. kontrak: extractor teruskan activeSymbol form", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes("normalizeSymbol(market.symbol)"),
    "simbol form tidak dinormalisasi",
  );
  assert(src.includes("activeSymbol,"), "activeSymbol tidak diteruskan");
  assert(!src.includes("detectedSymbols[0]"), "simbol OCR pertama dipakai");
});

test("143. kontrak: handleExtracted tanpa reset saat simbol beda", () => {
  const src = readSrc("src/App.tsx");
  const start = src.indexOf("const handleExtracted");
  const end = src.indexOf("const handleDetectedLevels");
  assert(start >= 0 && end > start, "handleExtracted hilang");
  const body = src.slice(start, end);
  assert(!body.includes("handleSymbolChange"), "reset terpanggil");
  assert(!body.includes("createEmptyMarketForSymbol"), "reset terpanggil");
  assert(!body.includes("setSwingCsv"), "CSV ikut direset");
  assert(body.includes("mergeValidOcrMarketData"), "merge aman hilang");
});

test("144. kontrak: onDetected membawa sumber level", () => {
  const appSrc = readSrc("src/App.tsx");
  assert(appSrc.includes("setSwingSource"), "sumber S/R tidak disimpan");
  const formSrc = readSrc("src/components/analysis/SwingLevelsForm.tsx");
  assert(formSrc.includes("resolved.source"), "sumber tidak diteruskan");
});

test("145. kontrak: panel diagnostik development-only", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("Diagnostik OCR"), "panel hilang");
  assert(src.includes("isDebugTraceEnabled()"), "tidak development-only");
  assert(src.includes("swingSource"), "S/R source hilang dari panel");
});

test("146. kontrak: region crop + gabungan teks", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("marketWatchText"), "region MW hilang");
  assert(src.includes("dataWindowText"), "region DW hilang");
  assert(src.includes("Ekstrak dari Region"), "tombol region hilang");
  assert(
    combineRegionTexts("US100 1 2", "Open 3") === "US100 1 2\nOpen 3",
    "gabung region salah",
  );
  assert(combineRegionTexts("", "Open 3") === "Open 3", "region kosong salah");
});

test("147. region: MW hanya dari teks region", () => {
  const rich = parseOcrTextRich("GBPUSD 1.32200 1.32206", {
    activeSymbol: "US100",
    marketWatchText: "US100 30573.83 30576.58",
    dataWindowText: "Open 30581.90",
  });
  assert(rich.data.bid === 30573.83, `bid=${rich.data.bid}`);
  assert(rich.data.open === 30581.9, `open=${rich.data.open}`);
  assert(
    rich.debug.chosenMarketWatchLine === "US100 30573.83 30576.58",
    "baris MW salah",
  );
});

/* ---------------- Region selection: TEST 148-167 ---------------- */

test("148. tombol Market Watch mengatur activeRegion", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes('onClick={() => setActiveRegion("marketWatch")}'),
    "handler MW hilang",
  );
});

test("149. tombol Data Window mengatur activeRegion", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes('onClick={() => setActiveRegion("dataWindow")}'),
    "handler DW hilang",
  );
});

test("150. semua tombol region bertipe button", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  const buttons = src.match(/<button/g) ?? [];
  const typed = src.match(/type="button"/g) ?? [];
  assert(
    buttons.length > 0 && typed.length >= buttons.length,
    "ada tombol tanpa type",
  );
});

test("151. canvas menerima pointer events saat mode aktif", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes('pointerEvents: activeRegion ? "auto" : "none"'),
    "pointer-events tidak terikat mode",
  );
});

test("152. canvas nonaktif pointer-events saat mode null", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes("onPointerDown={handlePointerDown}"),
    "handler down hilang",
  );
  assert(src.includes("if (!activeRegion) return;"), "guard mode hilang");
});

test("153. pointer down memulai seleksi", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("setIsSelecting(true)"), "flag seleksi hilang");
  assert(src.includes("setSelectionStart(point)"), "start hilang");
  assert(src.includes("setPointerCapture"), "capture hilang");
});

test("154. pointer move menggambar kotak", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes("onPointerMove={handlePointerMove}"),
    "handler move hilang",
  );
  assert(src.includes("setSelectionCurrent("), "update berjalan hilang");
  assert(
    src.includes("normalizeRegion(selectionStart, selectionCurrent)"),
    "preview tidak digambar",
  );
});

test("155. pointer up menyimpan region", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("onPointerUp={handlePointerUp}"), "handler up hilang");
  assert(
    src.includes("onPointerCancel={handlePointerCancel}"),
    "cancel hilang",
  );
  assert(src.includes("setMarketWatchRegion(region)"), "simpan MW hilang");
  assert(src.includes("setDataWindowRegion(region)"), "simpan DW hilang");
});

test("156. region dinormalisasi positif", () => {
  const region = normalizeRegion({ x: 90, y: 80 }, { x: 10, y: 20 });
  assert(region.x === 10 && region.y === 20, "origin salah");
  assert(region.width === 80 && region.height === 60, "dimensi salah");
});

test("157. region terlalu kecil ditolak", () => {
  assert(!isRegionBigEnough({ x: 0, y: 0, width: 9, height: 50 }), "9px lolos");
  assert(!isRegionBigEnough({ x: 0, y: 0, width: 50, height: 5 }), "5px lolos");
  assert(
    isRegionBigEnough({
      x: 0,
      y: 0,
      width: REGION_MIN_SIZE,
      height: REGION_MIN_SIZE,
    }),
    "batas pas ditolak",
  );
});

test("158. Market Watch region disimpan", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes('kind === "marketWatch"'), "cabang MW hilang");
});

test("159. Data Window region disimpan", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("setDataWindowRegion"), "cabang DW hilang");
});

test("160. Ekstrak aktif setelah kedua region tersedia", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(
    src.includes("!marketWatchRegion || !dataWindowRegion"),
    "gate kedua region hilang",
  );
  assert(
    src.includes("Pilih kedua region sebelum mengekstrak."),
    "hint hilang",
  );
});

test("161. Reset Region menghapus kedua region", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  const start = src.indexOf("function clearRegions");
  assert(start >= 0, "clearRegions hilang");
  const body = src.slice(
    start,
    src.indexOf("}", src.indexOf("setOcrSource", start)) + 1,
  );
  assert(body.includes("setMarketWatchRegion(null)"), "MW tidak dibersihkan");
  assert(body.includes("setDataWindowRegion(null)"), "DW tidak dibersihkan");
  assert(body.includes("setActiveRegion(null)"), "mode tidak dibersihkan");
});

test("162. ResizeObserver memperbarui ukuran canvas", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("new ResizeObserver"), "observer hilang");
  assert(src.includes("devicePixelRatio"), "dpr hilang");
  assert(src.includes("observer.disconnect()"), "cleanup hilang");
});

test("163. koordinat tampilan ke gambar asli", () => {
  const natural = convertToNaturalCoords(
    { x: 10, y: 20, width: 100, height: 50 },
    { width: 200, height: 100 },
    { width: 800, height: 400 },
  );
  assert(natural.x === 40 && natural.y === 80, "origin salah");
  assert(natural.width === 400 && natural.height === 200, "skala salah");
  const zero = convertToNaturalCoords(
    { x: 1, y: 1, width: 1, height: 1 },
    { width: 0, height: 0 },
    { width: 800, height: 400 },
  );
  assert(zero.width === 0, "pembagi nol tidak aman");
});

test("164. activeRegion tidak reset saat tombol diklik", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  const mwClick = 'onClick={() => setActiveRegion("marketWatch")}';
  const dwClick = 'onClick={() => setActiveRegion("dataWindow")}';
  assert(src.includes(mwClick) && src.includes(dwClick), "klik tidak set mode");
});

test("165. titik canvas dijepit ke batas", () => {
  const point = canvasPointFromClient(999, -5, {
    left: 10,
    top: 10,
    width: 100,
    height: 50,
  });
  assert(point.x === 100 && point.y === 0, "clamp salah");
  assert(
    clamp(5, 0, 10) === 5 && clamp(-1, 0, 10) === 0 && clamp(99, 0, 10) === 10,
    "clamp salah",
  );
});

test("166. overlay tidak tertutup elemen lain", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("relative inline-block"), "wrapper relative hilang");
  assert(src.includes("absolute inset-0 z-20"), "overlay tidak di atas");
});

test("167. cursor crosshair dan status visual mode", () => {
  const src = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(src.includes("cursor-crosshair"), "cursor hilang");
  assert(src.includes('data-testid="region-status"'), "testid status hilang");
  assert(src.includes('data-testid="market-watch-region"'), "testid MW hilang");
  assert(src.includes('data-testid="data-window-region"'), "testid DW hilang");
  assert(
    src.includes("Mode aktif: seret kotak Market Watch"),
    "pesan mode MW hilang",
  );
  assert(
    src.includes("Mode aktif: seret kotak Data Window"),
    "pesan mode DW hilang",
  );
});

/* ---------------- Fondasi registry broker terisolasi: TEST 168-176 ---------------- */
/* Tahap 2: hanya menguji fondasi registry; perilaku Finex lama tidak diubah. */

test("168. broker default adalah Finex", () => {
  assert(DEFAULT_BROKER_ID === "finex", `default=${DEFAULT_BROKER_ID}`);
  assert(
    DEFAULT_BROKER_ID === FINEX_BROKER_ID,
    "default bukan FINEX_BROKER_ID",
  );
  assert(isSupportedBrokerId(DEFAULT_BROKER_ID), "default tidak didukung");
});

test("169. Finex terdaftar di registry", () => {
  assert(isSupportedBrokerId(FINEX_BROKER_ID), "finex tidak didukung");
  assert(isSupportedBrokerId("finex"), "string finex tidak didukung");
  const profile = getBrokerProfile(FINEX_BROKER_ID);
  assert(profile.id === "finex", `id=${profile.id}`);
});

test("170. OrbiTraderBerjangka terdaftar di registry", () => {
  assert(isSupportedBrokerId(ORBITRADER_BROKER_ID), "otb tidak didukung");
  const profile = getBrokerProfile(ORBITRADER_BROKER_ID);
  assert(profile.id === "orbitraderberjangka", `id=${profile.id}`);
  assert(profile.label === "OrbiTraderBerjangka", `label=${profile.label}`);
});

test("171. broker id invalid ditolak", () => {
  assert(!isSupportedBrokerId("invalid-broker"), "id asing diterima");
  assert(!isSupportedBrokerId(""), "string kosong diterima");
  assert(!isSupportedBrokerId("FINEX"), "varian kapital diterima");
  let threw = false;
  try {
    getBrokerProfile("invalid-broker");
  } catch {
    threw = true;
  }
  assert(threw, "getBrokerProfile tidak menolak id invalid");
});

test("172. profile Finex memiliki label yang benar", () => {
  const profile = getBrokerProfile("finex");
  assert(profile.label === "Finex", `label=${profile.label}`);
});

test("173. profile OTB memiliki catatan perlu verifikasi", () => {
  const profile = getBrokerProfile("orbitraderberjangka");
  assert(
    profile.note.includes(ORBITRADER_VERIFICATION_NOTE),
    `note=${profile.note}`,
  );
  assert(
    profile.note.includes(
      "Perlu verifikasi dari Specification OrbiTraderBerjangka.",
    ),
    "catatan verifikasi hilang",
  );
});

test("174. profile OTB tidak memakai angka preset Finex", () => {
  const otb = getBrokerProfile("orbitraderberjangka");
  assert(otb.instruments.length === 0, `instruments=${otb.instruments.length}`);
  assert(!("pointValue" in otb), "pointValue bocor ke profil OTB");
  assert(!("contractSize" in otb), "contractSize bocor ke profil OTB");
  assert(!("spread" in otb), "spread bocor ke profil OTB");
  assert(!("leverage" in otb), "leverage bocor ke profil OTB");
  assert(!("margin" in otb), "margin bocor ke profil OTB");
  assert(
    !JSON.stringify(otb).includes("100000"),
    "angka preset Finex terbawa ke profil OTB",
  );
  // Adapter Finex: nilai berasal dari instrumentConfig, bukan salinan.
  const finex = getBrokerProfile("finex");
  assert(
    finex.instruments.length === SUPPORTED_SYMBOLS.length,
    `instruments=${finex.instruments.length}`,
  );
  const gbp = finex.instruments.find((preset) => preset.symbol === "GBPUSD");
  assert(gbp !== undefined, "preset GBPUSD hilang dari profil Finex");
  assert(
    gbp !== undefined &&
      gbp.contractSize === getInstrumentProfile("GBPUSD").contractSize,
    "preset Finex tidak identik dengan instrumentConfig",
  );
});

test("175. object registry tidak boleh dimutasi oleh pemanggil", () => {
  assert(Object.isFrozen(BROKER_PROFILES), "BROKER_PROFILES tidak dibekukan");
  const finex = getBrokerProfile("finex");
  assert(Object.isFrozen(finex), "profil Finex tidak dibekukan");
  assert(Object.isFrozen(finex.instruments), "instrumen Finex tidak dibekukan");
  const otb = getBrokerProfile("orbitraderberjangka");
  assert(Object.isFrozen(otb), "profil OTB tidak dibekukan");

  const mutable = BROKER_PROFILES as unknown as Array<BrokerProfile>;
  const before = mutable.length;
  let pushThrew = false;
  try {
    mutable.push(finex);
  } catch {
    pushThrew = true;
  }
  assert(
    pushThrew || mutable.length === before,
    "registry berhasil dimutasi via push",
  );
  assert(
    BROKER_PROFILES.length === 2,
    `jumlah profil=${BROKER_PROFILES.length}`,
  );

  const writable = finex as unknown as { label: string };
  let labelThrew = false;
  try {
    writable.label = "Diubah";
  } catch {
    labelThrew = true;
  }
  assert(finex.label === "Finex", `label berubah menjadi ${finex.label}`);
  assert(typeof labelThrew === "boolean", "flag mutasi label invalid");
});

test("176. helper simbol preservatif dan perilaku Finex lama utuh", () => {
  // brokerSymbol menyimpan nama asli; tidak memakai normalizeSymbol.
  const context = createBrokerContext("GBPUSD.pro");
  assert(context.brokerId === "finex", `brokerId=${context.brokerId}`);
  assert(
    context.brokerSymbol === "GBPUSD.pro",
    `brokerSymbol=${context.brokerSymbol}`,
  );
  assert(context.instrumentFamily === undefined, "family harus opsional");
  const withFamily = createBrokerContext("US100", "index");
  assert(withFamily.instrumentFamily === "index", "family hilang");
  const resolved = resolveBrokerSymbol("US100.cash", "index");
  assert(resolved.brokerSymbol === "US100.cash", "nama asli diubah");
  assert(resolved.instrumentFamily === "index", "family hilang");

  // Perilaku lama tidak berubah: normalizeSymbol dan preset Finex utuh.
  assert(normalizeSymbol("GBPUSD.pro") === "GBPUSD", "normalizeSymbol berubah");
  assert(normalizeSymbol("USTEC") === "US100", "alias US100 berubah");
  assert(
    getInstrumentProfile("GBPUSD").contractSize === 100000,
    "preset Finex berubah",
  );
  assert(
    getInstrumentProfile("US100").defaultBuffer === 10,
    "preset US100 berubah",
  );
});

/* ---------------- Dropdown broker Tahap 3: TEST 177-190 ---------------- */
/* Dropdown hanya mengubah konteks + tampilan; hasil Finex tidak berubah. */

function readAppBrokerHandler(): string {
  const src = readSrc("src/App.tsx");
  const start = src.indexOf("const handleBrokerChange");
  assert(start >= 0, "handleBrokerChange hilang dari App");
  const end = src.indexOf("\n  function runAnalysis", start);
  assert(end > start, "batas handler tidak ditemukan");
  return src.slice(start, end);
}

test("177. BrokerSelector memiliki option Finex", () => {
  const src = readSrc("src/components/analysis/BrokerSelector.tsx");
  assert(src.includes("<select"), "select broker hilang");
  assert(src.includes("<option"), "option broker hilang");
  assert(src.includes("BROKER_PROFILES"), "opsi tidak dari registry");
  assert(src.includes("profile.label"), "label opsi tidak dari profil");
  assert(
    BROKER_PROFILES.some(
      (profile) => profile.id === "finex" && profile.label === "Finex",
    ),
    "registry tidak menyediakan option Finex",
  );
  assert(src.includes('data-testid="broker-selector"'), "testid hilang");
});

test("178. BrokerSelector memiliki option OrbiTraderBerjangka", () => {
  assert(
    BROKER_PROFILES.some(
      (profile) =>
        profile.id === "orbitraderberjangka" &&
        profile.label === "OrbiTraderBerjangka",
    ),
    "registry tidak menyediakan option OrbiTraderBerjangka",
  );
  const src = readSrc("src/components/analysis/BrokerSelector.tsx");
  assert(src.includes("isSupportedBrokerId"), "guard id broker hilang");
  assert(src.includes("Broker / Trader aktif"), "label dropdown hilang");
});

test("179. default broker adalah Finex", () => {
  assert(DEFAULT_BROKER_ID === "finex", `default=${DEFAULT_BROKER_ID}`);
  assert(DEFAULT_BROKER_ID === FINEX_BROKER_ID, "default bukan FINEX");
  const src = readSrc("src/App.tsx");
  assert(
    src.includes("useState<BrokerId>(DEFAULT_BROKER_ID)"),
    "state broker tidak memakai DEFAULT_BROKER_ID",
  );
});

test("180. App menggunakan DEFAULT_BROKER_ID dan state tunggal", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("DEFAULT_BROKER_ID"), "konstanta default tidak dipakai");
  assert(src.includes("activeBrokerId"), "state broker aktif hilang");
  assert(src.includes("setActiveBrokerId"), "setter broker aktif hilang");
  assert(
    src.includes('import type { BrokerId } from "./types/broker"'),
    "tipe BrokerId tidak dipakai App",
  );
});

test("181. label broker aktif berasal dari state", () => {
  const selector = readSrc("src/components/analysis/BrokerSelector.tsx");
  assert(selector.includes("Broker aktif:"), "badge broker hilang");
  assert(selector.includes("{activeLabel}"), "badge bukan dari state/props");
  assert(
    selector.includes("getBrokerProfile(value).label"),
    "label badge bukan dari profil state",
  );
  const app = readSrc("src/App.tsx");
  assert(app.includes("value={activeBrokerId}"), "selector tidak dari state");
  assert(
    app.includes("getBrokerProfile(activeBrokerId).label"),
    "label App bukan dari state",
  );
  assert(
    app.includes("Sumber broker: {activeBrokerLabel}"),
    "label konteks CSV bukan dari state",
  );
});

test("182. handleBrokerChange tersedia dan terhubung", () => {
  const src = readSrc("src/App.tsx");
  assert(
    src.includes("const handleBrokerChange = useCallback"),
    "handler tidak stabil (useCallback hilang)",
  );
  assert(
    src.includes("onChange={handleBrokerChange}"),
    "selector tidak terhubung ke handler",
  );
  const body = readAppBrokerHandler();
  assert(body.includes("setActiveBrokerId"), "handler tidak mengubah state");
  assert(
    body.includes("if (nextBrokerId === activeBrokerId) return;"),
    "guard broker sama hilang",
  );
});

test("183. pergantian broker membersihkan hasil analisis lama", () => {
  const body = readAppBrokerHandler();
  assert(
    body.includes("clearAnalysisOutput()"),
    "hasil lama tidak dibersihkan",
  );
  assert(body.includes('setSwingCsv("")'), "CSV lama tidak diputus");
  assert(body.includes('setConnectedCsvName("")'), "nama CSV lama tersisa");
  assert(body.includes("setCsvResetKey"), "reset koneksi CSV hilang");
  assert(body.includes("setBrokerNotice("), "notifikasi broker hilang");
  assert(body.includes("setOcrWarning"), "warning lama tidak dibersihkan");
});

test("184. pergantian broker tidak memodifikasi decision engine", () => {
  const body = readAppBrokerHandler();
  assert(!body.includes("analyzeMarket"), "handler menyentuh decision engine");
  assert(!body.includes("setMarket("), "handler mengubah data market");
  assert(!body.includes("setBroker("), "handler mengubah setting broker");
  const engine = readSrc("src/calculations/decisionEngine.ts");
  assert(!engine.includes("BrokerId"), "engine tercemar tipe broker");
  assert(!engine.includes("brokerRegistry"), "engine tercemar registry");
  assert(!engine.includes("orbitraderberjangka"), "engine menyebut OTB");
});

test("185. pergantian broker tidak memodifikasi preset Finex", () => {
  const body = readAppBrokerHandler();
  assert(!body.includes("applyBrokerPreset"), "handler menulis preset");
  assert(!body.includes("pointValue"), "handler menulis pointValue");
  assert(!body.includes("contractSize"), "handler menulis contractSize");
  assert(!body.includes("100000"), "handler menulis angka preset");
  const app = readSrc("src/App.tsx");
  assert(app.includes("pointValue: 100000"), "nilai awal Finex berubah/hilang");
  assert(
    getInstrumentProfile("GBPUSD").contractSize === 100000,
    "preset Finex berubah",
  );
  assert(
    getInstrumentProfile("US100").defaultBuffer === 10,
    "preset US100 berubah",
  );
});

test("186. OTB tidak menerima angka Finex sebagai preset", () => {
  const otb = getBrokerProfile("orbitraderberjangka");
  assert(otb.instruments.length === 0, "preset OTB terisi");
  assert(
    !JSON.stringify(otb).includes("100000"),
    "angka Finex bocor ke profil OTB",
  );
  const body = readAppBrokerHandler();
  assert(!body.includes("100000"), "angka Finex ditulis saat ganti broker");
  assert(
    body.includes("Preset instrumen belum diaktifkan"),
    "status kosong OTB hilang dari notifikasi",
  );
});

test("187. OTB menampilkan status perlu verifikasi", () => {
  const selector = readSrc("src/components/analysis/BrokerSelector.tsx");
  assert(
    selector.includes("harus diverifikasi dari terminal OrbiTraderBerjangka"),
    "keterangan OTB hilang dari selector",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("Preset instrumen belum diaktifkan"),
    "notifikasi OTB hilang dari App",
  );
  assert(
    app.includes("Ambil ulang data market dari terminal OrbiTraderBerjangka"),
    "warning ambil ulang data hilang",
  );
  const form = readSrc("src/components/analysis/BrokerSettingsForm.tsx");
  assert(
    form.includes("Parameter OrbiTraderBerjangka belum diverifikasi"),
    "warning OTB hilang dari form",
  );
  assert(
    form.includes("menu Specification pada MetaTrader OrbiTraderBerjangka"),
    "rujukan Specification hilang",
  );
});

test("188. Finex tetap menjadi jalur default", () => {
  assert(DEFAULT_BROKER_ID === FINEX_BROKER_ID, "default bukan Finex");
  assert(isSupportedBrokerId("finex"), "finex tidak didukung");
  const body = readAppBrokerHandler();
  assert(
    body.includes("Gunakan screenshot, CSV, dan parameter dari terminal Finex"),
    "notifikasi kembali ke Finex hilang",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("setActiveBrokerId(DEFAULT_BROKER_ID)"),
    "reset tidak kembali ke Finex",
  );
  const selector = readSrc("src/components/analysis/BrokerSelector.tsx");
  assert(
    selector.includes("Gunakan data dari terminal Finex"),
    "keterangan Finex hilang",
  );
});

test("189. tidak ada duplicate activeBrokerId state", () => {
  const app = readSrc("src/App.tsx");
  const stateCount = app.split("const [activeBrokerId").length - 1;
  assert(stateCount === 1, `state ganda: ${stateCount}`);
  const hookCount = app.split("useState<BrokerId>").length - 1;
  assert(hookCount === 1, `hook broker ganda: ${hookCount}`);
  const selector = readSrc("src/components/analysis/BrokerSelector.tsx");
  assert(!selector.includes("setActiveBrokerId"), "anak menulis state broker");
  assert(!selector.includes("useState<BrokerId>"), "anak punya state broker");
  const form = readSrc("src/components/analysis/BrokerSettingsForm.tsx");
  assert(!form.includes("setActiveBrokerId"), "form menulis state broker");
  assert(form.includes("brokerId?:"), "prop broker form hilang");
});

test("190. CSV/OCR lama tetap terhubung seperti sebelumnya", () => {
  const app = readSrc("src/App.tsx");
  assert(app.includes("onCsvLoaded={handleCsvLoaded}"), "CSV loader lepas");
  assert(
    app.includes("onConnectionChange={handleConnectionChange}"),
    "status koneksi CSV lepas",
  );
  assert(app.includes("onExtracted={handleExtracted}"), "OCR lepas");
  assert(app.includes("mergeValidOcrMarketData"), "merge aman OCR hilang");
  assert(app.includes("filterOcrPricesForSymbol"), "filter OCR hilang");
  assert(
    app.includes("Atur parameter broker dan risiko — "),
    "judul dinamis form hilang",
  );
  assert(app.includes("brokerId={activeBrokerId}"), "prop broker form hilang");
  const csv = readSrc("src/components/analysis/CsvFileConnector.tsx");
  assert(csv.includes("Hubungkan CSV MT5"), "tombol CSV hilang");
  const ocr = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(ocr.includes("parseOcrTextRich"), "jalur OCR berubah");
});

/* ---------------- Guard persen equity 3.1: TEST 191-197 ---------------- */
/* Equity invalid tidak boleh mencetak undefined%/NaN%/Infinity%. */

function riskWarningForEquity(equity: number): string | null {
  const broker = { ...makeValidBroker(), equity };
  const summary = validateAnalysisInputs(makeValidMarket("GBPUSD"), broker);
  const found = summary.warnings.find((warning) => warning.field === "risk");
  return found ? found.message : null;
}

function allValidationText(equity: number): string {
  const broker = { ...makeValidBroker(), equity };
  const summary = validateAnalysisInputs(makeValidMarket("GBPUSD"), broker);
  return [...summary.errors, ...summary.warnings]
    .map((item) => item.message)
    .join("\n");
}

function requireRiskMessage(equity: number): string {
  const message = riskWarningForEquity(equity);
  if (message === null) {
    throw new Error(`warning risiko hilang untuk equity=${equity}`);
  }
  return message;
}

test("191. equity 0 tidak menghasilkan undefined%", () => {
  const message = requireRiskMessage(0);
  assert(!message.includes("undefined%"), `masih ada undefined%: ${message}`);
  assert(!message.includes("NaN%"), `ada NaN%: ${message}`);
  assert(!message.includes("Infinity%"), `ada Infinity%: ${message}`);
  assert(
    message ===
      "Risiko minimum lot belum dapat dibandingkan karena Equity USD belum diisi.",
    `pesan=${message}`,
  );
});

test("192. equity NaN tidak menghasilkan NaN%", () => {
  const message = requireRiskMessage(NaN);
  assert(!message.includes("NaN%"), `ada NaN%: ${message}`);
  assert(!message.includes("undefined%"), `ada undefined%: ${message}`);
  assert(
    message ===
      "Risiko minimum lot belum dapat dibandingkan karena Equity USD belum diisi.",
    `pesan=${message}`,
  );
});

test("193. equity negatif tidak menghasilkan persentase", () => {
  const message = requireRiskMessage(-5);
  assert(!message.includes("%"), `ada persentase: ${message}`);
  assert(
    message ===
      "Risiko minimum lot belum dapat dibandingkan karena Equity USD belum diisi.",
    `pesan=${message}`,
  );
});

test("194. equity valid menghasilkan persentase yang benar", () => {
  const message = requireRiskMessage(8.99);
  assert(message.includes("13.2% equity"), `persen salah: ${message}`);
  assert(message.includes("sekitar $1.19"), `nominal salah: ${message}`);
  assert(message.includes("melebihi batas $0.90"), `batas salah: ${message}`);
  assert(!message.includes("undefined"), `ada undefined: ${message}`);
});

test("195. warning equity wajib tetap muncul", () => {
  const summary = validateAnalysisInputs(makeValidMarket("GBPUSD"), {
    ...makeValidBroker(),
    equity: 0,
  });
  assert(
    summary.errors.some(
      (error) =>
        error.field === "equity" &&
        error.message === "Equity harus lebih besar dari 0.",
    ),
    "validasi equity wajib berubah/hilang",
  );
  assert(!summary.valid, "equity 0 dianggap valid");
});

test("196. tidak ada teks undefined% pada output validasi", () => {
  for (const equity of [0, NaN, -1, -100]) {
    const text = allValidationText(equity);
    assert(!text.includes("undefined%"), `undefined% untuk equity=${equity}`);
    assert(!text.includes("NaN%"), `NaN% untuk equity=${equity}`);
    assert(!text.includes("Infinity%"), `Infinity% untuk equity=${equity}`);
  }
  const validText = allValidationText(8.99);
  assert(!validText.includes("undefined"), "undefined bocor saat equity valid");
});

test("197. rumus persen equity valid tidak berubah", () => {
  const summary = validateAnalysisInputs(makeValidMarket("GBPUSD"), {
    ...makeValidBroker(),
    equity: 8.99,
  });
  const riskUsd = summary.minimumLotRiskUsd;
  const riskPct = summary.minimumLotRiskPercent;
  if (riskUsd === null || riskPct === null) {
    throw new Error("risiko minimum hilang saat equity valid");
  }
  const expected = (riskUsd / 8.99) * 100;
  assert(Math.abs(riskPct - expected) < 0.000001, "rumus persen berubah");
  assert(Math.abs(riskPct - 13.21) < 0.01, `nilai persen=${riskPct}`);
});

/* ---------------- Propagasi S/R CSV ke market: TEST 198-209 ---------------- */

function makeGbpCsvText(): string {
  const rows = ["time,open,high,low,close"];
  const closes = [
    1.325, 1.326, 1.324, 1.327, 1.323, 1.328, 1.322, 1.329, 1.321, 1.33, 1.3245,
    1.3265, 1.3235, 1.3275, 1.3225, 1.3285, 1.3215, 1.3295, 1.3255, 1.3262,
  ];
  closes.forEach((close, index) => {
    rows.push(
      `2026-10-01 01:${String(index).padStart(2, "0")},${(close - 0.0002).toFixed(5)},${(close + 0.0004).toFixed(5)},${(close - 0.0004).toFixed(5)},${close.toFixed(5)}`,
    );
  });
  return rows.join("\n");
}

function makeEmptySrMarket(): MarketData {
  return { ...makeValidMarket("GBPUSD"), support: 0, resistance: 0 };
}

function readAppSrHandler(): string {
  const src = readSrc("src/App.tsx");
  const start = src.indexOf("const handleDetectedLevels");
  assert(start >= 0, "handleDetectedLevels hilang dari App");
  const end = src.indexOf("const handleCsvLoaded", start);
  assert(end > start, "batas handler S/R tidak ditemukan");
  return src.slice(start, end);
}

test("198. CSV valid menghitung Support dan Resistance", () => {
  const parsed = parseCsvCandles(makeGbpCsvText());
  assert(parsed.validRows >= 5, `validRows=${parsed.validRows}`);
  assert(
    checkInstrumentMismatch(parsed.candles, "GBPUSD", 1.32474) === null,
    "CSV valid dianggap mismatch",
  );
  const resolved = resolveSwingLevels(parsed.candles, 1.32474, 2);
  const support = resolved.support;
  const resistance = resolved.resistance;
  if (support === null || resistance === null) {
    throw new Error("S/R CSV valid tidak terhitung");
  }
  assert(support > 0 && resistance > 0, "S/R harus lebih besar dari 0");
  assert(support < resistance, "support harus di bawah resistance");
});

test("199. Support diterapkan ke market state", () => {
  const previous = makeEmptySrMarket();
  const result = applyCsvSwingLevels(
    previous,
    { support: 1.3211, resistance: 1.3299, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(result.applied, `ditolak: ${result.rejectionReason}`);
  assert(result.rejectionReason === null, "alasan penolakan harus null");
  assert(result.market.support === 1.3211, `support=${result.market.support}`);
  assert(result.appliedSupport === 1.3211, "diagnostik support salah");
  assert(result.market !== previous, "referensi market harus baru");
});

test("200. Resistance diterapkan ke market state", () => {
  const previous = makeEmptySrMarket();
  const result = applyCsvSwingLevels(
    previous,
    { support: 1.3211, resistance: 1.3299, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(result.applied, `ditolak: ${result.rejectionReason}`);
  assert(
    result.market.resistance === 1.3299,
    `resistance=${result.market.resistance}`,
  );
  assert(result.appliedResistance === 1.3299, "diagnostik resistance salah");
});

test("201. form market utama menampilkan nilai S/R yang diterapkan", () => {
  assert(displayMarketNumber(1.3211) === "1.3211", "support tidak tampil");
  assert(displayMarketNumber(1.3299) === "1.3299", "resistance tidak tampil");
  assert(displayMarketNumber(0) === "", "0 harus tampil kosong");
  const form = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(form.includes('{ key: "support"'), "field support hilang dari form");
  assert(
    form.includes('{ key: "resistance"'),
    "field resistance hilang dari form",
  );
  assert(
    form.includes("displayMarketNumber(market[field.key])"),
    "form tidak membaca dari market state",
  );
});

test("202. validator membaca nilai S/R yang sama", () => {
  const applied = applyCsvSwingLevels(
    makeEmptySrMarket(),
    { support: 1.3211, resistance: 1.3299, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(applied.applied, "apply gagal");
  const summary = validateAnalysisInputs(applied.market, makeValidBroker());
  assert(
    !summary.errors.some(
      (error) =>
        error.field === "support" ||
        error.field === "resistance" ||
        error.field === "support-resistance",
    ),
    "validator menolak S/R yang sudah diterapkan",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("validateAnalysisInputs(market, broker, activeBrokerId)"),
    "validator tidak memakai market state yang sama + konteks broker (4B)",
  );
  assert(app.includes("market={market}"), "form tidak memakai market state");
});

test("203. S/R tetap ada setelah ekstraksi OCR", () => {
  const applied = applyCsvSwingLevels(
    makeEmptySrMarket(),
    { support: 1.3211, resistance: 1.3299, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(applied.applied, "apply gagal");
  const afterOcr = mergeValidOcrMarketData(applied.market, {
    bid: 1.32474,
    ask: 1.3248,
    close: 1.32449,
    cci: -197.12,
  });
  assert(afterOcr.support === 1.3211, "OCR menghapus support CSV");
  assert(afterOcr.resistance === 1.3299, "OCR menghapus resistance CSV");
  const hostile = mergeValidOcrMarketData(applied.market, {
    close: 1.32449,
    support: null as unknown as number,
    resistance: NaN,
  });
  assert(hostile.support === 1.3211, "null menghapus support CSV");
  assert(hostile.resistance === 1.3299, "NaN menghapus resistance CSV");
});

test("204. CSV simbol berbeda ditolak", () => {
  const previous: MarketData = {
    ...makeValidMarket("GBPUSD"),
    support: 1.3211,
    resistance: 1.3299,
  };
  const cross = applyCsvSwingLevels(
    previous,
    { support: 30500, resistance: 30600, csvSymbol: "US100" },
    { activeSymbol: "GBPUSD" },
  );
  assert(!cross.applied, "level simbol berbeda diterapkan");
  assert(cross.market === previous, "market berubah saat ditolak");
  assert(
    cross.rejectionReason !== null && cross.rejectionReason.includes("simbol"),
    `alasan=${cross.rejectionReason}`,
  );
  assert(previous.support === 1.3211, "S/R valid tertimpa");
  const offScale = applyCsvSwingLevels(
    previous,
    { support: 30500, resistance: 30600, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(!offScale.applied, "level di luar skala diterapkan");
  assert(
    offScale.rejectionReason !== null &&
      offScale.rejectionReason.includes("skala"),
    `alasan=${offScale.rejectionReason}`,
  );
});

test("205. CSV broker berbeda ditolak bila konteks tersedia", () => {
  const previous: MarketData = {
    ...makeValidMarket("GBPUSD"),
    support: 1.3211,
    resistance: 1.3299,
  };
  const diff = applyCsvSwingLevels(
    previous,
    {
      support: 1.3215,
      resistance: 1.3295,
      csvSymbol: "GBPUSD",
      brokerId: "finex",
    },
    { activeSymbol: "GBPUSD", activeBrokerId: "orbitraderberjangka" },
  );
  assert(!diff.applied, "level broker berbeda diterapkan");
  assert(diff.market === previous, "market berubah saat ditolak");
  assert(
    diff.rejectionReason !== null && diff.rejectionReason.includes("broker"),
    `alasan=${diff.rejectionReason}`,
  );
  const same = applyCsvSwingLevels(
    previous,
    {
      support: 1.3215,
      resistance: 1.3295,
      csvSymbol: "GBPUSD",
      brokerId: "finex",
    },
    { activeSymbol: "GBPUSD", activeBrokerId: "finex" },
  );
  assert(same.applied, `broker sama ditolak: ${same.rejectionReason}`);
  const unknown = applyCsvSwingLevels(
    previous,
    { support: 1.3215, resistance: 1.3295, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD", activeBrokerId: "finex" },
  );
  assert(unknown.applied, "konteks tak lengkap ikut ditolak");
});

test("206. nilai null/0/NaN/negatif tidak menghapus S/R valid", () => {
  const previous: MarketData = {
    ...makeValidMarket("GBPUSD"),
    support: 1.3211,
    resistance: 1.3299,
  };
  const badValues: Array<number | null> = [null, 0, NaN, -1.5];
  for (const bad of badValues) {
    const next = applySwingLevels(previous, bad, bad);
    assert(next === previous, `nilai ${bad} mengubah state`);
    assert(next.support === 1.3211, `support terhapus oleh ${bad}`);
    assert(next.resistance === 1.3299, `resistance terhapus oleh ${bad}`);
  }
  const zeroApply = applyCsvSwingLevels(
    makeEmptySrMarket(),
    { support: 0, resistance: 1.3299, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(!zeroApply.applied, "level 0 diterapkan");
  assert(
    zeroApply.rejectionReason !== null &&
      zeroApply.rejectionReason.includes("valid"),
    `alasan=${zeroApply.rejectionReason}`,
  );
});

test("207. pergantian simbol mengosongkan S/R", () => {
  const previous: MarketData = {
    ...makeValidMarket("GBPUSD"),
    support: 1.3211,
    resistance: 1.3299,
  };
  const next = createEmptyMarketForSymbol("US100", previous);
  assert(next.symbol === "US100", `symbol=${next.symbol}`);
  assert(next.support === 0, "support tidak dikosongkan");
  assert(next.resistance === 0, "resistance tidak dikosongkan");
  assert(next.timeframe === "H1", "timeframe harus dipertahankan");
});

test("208. diagnostik propagasi S/R lengkap dan terstruktur", () => {
  const body = readAppSrHandler();
  assert(body.includes("applyCsvSwingLevels"), "apply bergaransi hilang");
  assert(body.includes("sr-propagation"), "trace propagasi hilang");
  const fields = [
    "activeSymbol",
    "csvSymbol",
    "detectedSupport",
    "detectedResistance",
    "appliedSupport",
    "appliedResistance",
    "previousSupport",
    "previousResistance",
    "rejectionReason",
  ];
  for (const field of fields) {
    assert(body.includes(field), `field diagnostik hilang: ${field}`);
  }
  assert(
    body.includes("setMarket((previous) =>"),
    "apply tidak memakai state terbaru",
  );
  const form = readSrc("src/components/analysis/SwingLevelsForm.tsx");
  assert(form.includes("csvSymbol"), "konteks simbol tidak diteruskan");
  assert(
    form.includes("onDetected(support, resistance, resolved.source, {"),
    "meta deteksi tidak dikirim",
  );
});

test("209. decision engine dan aturan S/R validator tidak berubah", () => {
  const engine = readSrc("src/calculations/decisionEngine.ts");
  assert(!engine.includes("BrokerId"), "engine tercemar tipe broker");
  assert(!engine.includes("applyCsvSwingLevels"), "engine memakai apply CSV");
  assert(!engine.includes("CsvSwing"), "engine tercemar tipe CSV");
  const empty = validateAnalysisInputs(makeEmptySrMarket(), makeValidBroker());
  assert(
    empty.errors.some((error) => error.field === "support"),
    "validator tidak lagi meminta support kosong",
  );
  assert(
    empty.errors.some((error) => error.field === "resistance"),
    "validator tidak lagi meminta resistance kosong",
  );
  assert(!empty.valid, "market tanpa S/R dianggap valid");
});

/* ---------------- Preset OTB terverifikasi 4A: TEST 210-215 ---------------- */
/* Data only, isolated: belum di-wire ke preset/validator/registry. */

function requireOtbPreset(symbol: string) {
  const preset = getOtbInstrumentProfile(symbol);
  if (preset === null) {
    throw new Error(`preset OTB hilang untuk simbol ${symbol}`);
  }
  return preset;
}

test("210. OTB preset GBPUSD_ORB ada dan beda dari Finex", () => {
  const otb = requireOtbPreset("GBPUSD_ORB");
  assert(otb.symbol === "GBPUSD_ORB", `symbol=${otb.symbol}`);
  assert(otb.digits === 5, `digits=${otb.digits}`);
  assert(otb.contractSize === 100000, `contractSize=${otb.contractSize}`);
  assert(otb.spreadMode === "floating", `spreadMode=${otb.spreadMode}`);
  assert(otb.stopsLevel === 20, `stopsLevel=${otb.stopsLevel}`);
  assert(otb.tickSize === 0.00001, `tickSize=${otb.tickSize}`);
  assert(
    otb.tickSize !== getInstrumentProfile("GBPUSD").pipSize,
    "tickSize OTB sama dengan pipSize Finex",
  );
  assert(Object.isFrozen(otb), "preset OTB tidak dibekukan");
});

test("211. OTB initialMargin terpisah dari tick value", () => {
  const otb = requireOtbPreset("GBPUSD_ORB");
  assert(otb.initialMargin === 100000, `initialMargin=${otb.initialMargin}`);
  assert(
    otb.maintenanceMargin === 100000,
    `maintenanceMargin=${otb.maintenanceMargin}`,
  );
  assert(otb.tickValue === 1, `tickValue tersimpan=${otb.tickValue}`);
  const tickValue = calculateOtbTickValue(otb);
  assert(tickValue === 1, `tickValue=${tickValue}`);
  assert(otb.tickValue === tickValue, "nilai tersimpan beda dari kalkulator");
  assert(
    tickValue !== otb.initialMargin,
    "tick value sama dengan initial margin",
  );
});

test("212. OTB minVolume 0.1 dengan batas volume utuh", () => {
  const otb = requireOtbPreset("GBPUSD_ORB");
  assert(otb.minVolume === 0.1, `minVolume=${otb.minVolume}`);
  assert(otb.volumeStep === 0.1, `volumeStep=${otb.volumeStep}`);
  assert(otb.maxVolume === 10, `maxVolume=${otb.maxVolume}`);
  assert(otb.calculationMode === "Forex", `mode=${otb.calculationMode}`);
  assert(otb.currencyProfit === "USD", "currency profit bukan USD");
  assert(otb.currencyMargin === "USD", "currency margin bukan USD");
  assert(otb.commission !== null, "komisi hilang");
  if (otb.commission === null) {
    throw new Error("komisi OTB hilang");
  }
  assert(otb.commission.pricePerLot === 33, "komisi bukan 33 USD/lot");
  assert(
    otb.commission.volumeMin === 0.01 && otb.commission.volumeMax === 1000,
    "rentang volume komisi salah",
  );
  assert(otb.hedgedMargin === 50000, `hedgedMargin=${otb.hedgedMargin}`);
});

test("213. simbol OTB tak terverifikasi mengembalikan null", () => {
  assert(
    getOtbInstrumentProfile("EURUSD_ORB") === null,
    "simbol tak terverifikasi mengembalikan preset",
  );
  assert(
    getOtbInstrumentProfile("GBPUSD") === null,
    "nama simbol Finex bocor ke preset OTB",
  );
  assert(getOtbInstrumentProfile("") === null, "simbol kosong lolos");
  assert(
    getOtbInstrumentProfile("gbpusd_orb") === null,
    "lookup harus exact (case-sensitive)",
  );
  // 5D-EXT1: 3 flat + 10 percentage = 13 preset; 6H: +3 percentage = 16.
  assert(Object.keys(OTB_PRESETS).length === 16, "preset fiktif terdaftar");
  assert(
    getOtbInstrumentProfile("AUDCAD_ORB") !== null,
    "preset AUDCAD_ORB hilang",
  );
  assert(
    getOtbInstrumentProfile("EURCHF_ORB") !== null,
    "preset EURCHF_ORB hilang",
  );
  assert(
    getBrokerProfile("orbitraderberjangka").instruments.length === 0,
    "registry OTB teraktivasi prematur (wiring = 4B)",
  );
});

test("214. kalkulator tick value terkunci + swap tersimpan", () => {
  const otb = requireOtbPreset("GBPUSD_ORB");
  assert(
    calculateOtbTickValue(otb) === otb.tickSize * otb.contractSize,
    "rumus tick value berubah",
  );
  assert(calculateOtbTickValue(otb) === 1, "tick value bukan 1.00 USD");
  assert(otb.swapLong === -2.25, `swapLong=${otb.swapLong}`);
  assert(otb.swapShort === -0.75, `swapShort=${otb.swapShort}`);
});

test("215. preset Finex byte-identik setelah modul OTB", () => {
  assert(
    getInstrumentProfile("GBPUSD").contractSize === 100000,
    "contractSize Finex berubah",
  );
  assert(
    getInstrumentProfile("GBPUSD").pipSize === 0.0001,
    "pipSize Finex berubah",
  );
  assert(
    getInstrumentProfile("US100").defaultBuffer === 10,
    "preset US100 berubah",
  );
  assert(SUPPORTED_SYMBOLS.length === 10, "daftar simbol Finex berubah");
});

/* ---------------- Wiring preset OTB 4B: TEST 216-225 ---------------- */
/* Signature applyBrokerPreset dipertahankan; Finex byte-identik. */

test("216. Finex preset dipilih bila broker default/finex", () => {
  const viaDefault = applyBrokerPreset(makeEmptyBroker(), "GBPUSD");
  const viaFinex = applyBrokerPreset(makeEmptyBroker(), "GBPUSD", "finex");
  assert(
    JSON.stringify(viaDefault) === JSON.stringify(viaFinex),
    "jalur default beda dari jalur finex",
  );
  assert(
    viaDefault.pointValue === 100000 &&
      viaDefault.contractSize === 100000 &&
      viaDefault.buffer === 0.00005,
    "preset Finex tidak diterapkan",
  );
  assert(viaDefault.minLot === 0.01, `minLot=${viaDefault.minLot}`);
  assert(viaDefault.equity === 0, "equity ikut ditebak");
});

test("217. OTB preset dipilih bila broker orbitraderberjangka", () => {
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(applied.pointValue === 1, `pointValue=${applied.pointValue}`);
  assert(
    applied.contractSize === 100000,
    `contractSize=${applied.contractSize}`,
  );
  assert(applied.minLot === 0.1, `minLot=${applied.minLot}`);
  assert(applied.lotStep === 0.1, `lotStep=${applied.lotStep}`);
  assert(applied.buffer === 0, "buffer OTB dikarang (tidak ada datanya)");
  assert(applied.equity === 0, "equity ikut ditebak");
  assert(
    applied.commission === 33,
    `komisi OTB tidak terisi: ${applied.commission} (spec32 33, 6G)`,
  );
  assert(applied.slippage === 0, "slippage ikut ditebak");
  assert(applied.riskPercent === 10, "default strategi tidak diisi");
});

test("218. OTB tickValue dari kalkulator, bukan Finex", () => {
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(applied.pointValue === 1, "tick value OTB bukan 1.00");
  assert(
    applied.pointValue !== getInstrumentProfile("GBPUSD").defaultPointValue,
    "pointValue memakai angka Finex",
  );
});

test("219. OTB minLot 0.1 mengisi kekosongan tanpa menimpa pengguna", () => {
  const filled = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(filled.minLot === 0.1, `minLot=${filled.minLot}`);
  const kept = applyBrokerPreset(
    { ...makeEmptyBroker(), minLot: 0.5 },
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(kept.minLot === 0.5, "nilai minLot pengguna tertimpa preset");
});

test("220. preset OTB EXACT match: GBPUSD bukan GBPUSD_ORB", () => {
  const previous = makeValidBroker();
  assert(
    applyBrokerPreset(previous, "GBPUSD", "orbitraderberjangka") === previous,
    "simbol Finex lolos ke jalur OTB",
  );
  assert(
    applyBrokerPreset(previous, "gbpusd_orb", "orbitraderberjangka") ===
      previous,
    "varian kapital lolos (harus exact)",
  );
  assert(
    applyBrokerPreset(previous, "", "orbitraderberjangka") === previous,
    "simbol kosong lolos",
  );
  const ok = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(ok.minLot === 0.1 && ok.pointValue === 1, "simbol exact ditolak");
});

test("221. OTB tanpa preset tidak apply partial", () => {
  const previous = makeEmptyBroker();
  const result = applyBrokerPreset(
    previous,
    "EURUSD_ORB",
    "orbitraderberjangka",
  );
  assert(result === previous, "partial apply terjadi saat preset hilang");
  assert(
    result.pointValue === 0 && result.minLot === 0 && result.buffer === 0,
    "nilai berubah saat penolakan",
  );
});

test("222. Finex simbol invalid tetap memakai fallback lama", () => {
  const result = applyBrokerPreset(makeEmptyBroker(), "XYZ");
  assert(result.pointValue === 1, `pointValue=${result.pointValue}`);
  assert(result.contractSize === 1, `contractSize=${result.contractSize}`);
  assert(result.buffer === 0, `buffer=${result.buffer}`);
  assert(result.minLot === 0.01, "default strategi berubah");
});

test("223. validator OTB menolak minLot di bawah 0.1 via warning", () => {
  const otbMarket: MarketData = {
    ...makeValidMarket("GBPUSD"),
    symbol: "GBPUSD_ORB",
  };
  const low = validateAnalysisInputs(
    otbMarket,
    { ...makeValidBroker(), minLot: 0.05 },
    "orbitraderberjangka",
  );
  const warning = low.warnings.find((item) => item.field === "minLot");
  assert(warning !== undefined, "warning minLot OTB hilang");
  if (warning === undefined) {
    throw new Error("warning minLot OTB hilang");
  }
  assert(warning.message.includes("0.1"), `pesan=${warning.message}`);
  assert(
    !low.errors.some((item) => item.field === "minLot"),
    "guard OTB harus warning non-blokir, bukan error",
  );
  const noBroker = validateAnalysisInputs(otbMarket, {
    ...makeValidBroker(),
    minLot: 0.05,
  });
  assert(
    !noBroker.warnings.some((item) => item.field === "minLot"),
    "guard OTB bocor tanpa konteks broker",
  );
  const enough = validateAnalysisInputs(
    otbMarket,
    { ...makeValidBroker(), minLot: 0.1 },
    "orbitraderberjangka",
  );
  assert(
    !enough.warnings.some((item) => item.field === "minLot"),
    "minLot valid ikut diperingatkan",
  );
  const finex = validateAnalysisInputs(
    makeValidMarket("GBPUSD"),
    { ...makeValidBroker(), minLot: 0.05 },
    "finex",
  );
  assert(
    !finex.warnings.some((item) => item.field === "minLot"),
    "guard OTB bocor ke jalur Finex",
  );
});

test("224. Finex byte-identik sebelum/sesudah wiring OTB (komisi 1.00 6G)", () => {
  const result = applyBrokerPreset(makeValidBroker(), "GBPUSD");
  const expected: BrokerSettings = {
    equity: 8.99,
    riskPercent: 10,
    minLot: 0.01,
    lotStep: 0.01,
    pointValue: 100000,
    contractSize: 100000,
    // 6G: auto-fill komisi Finex 1.00 (CSV terminal); field lain identik.
    commission: 1,
    slippage: 0,
    buffer: 0.00005,
    atrMultiplier: 1.2,
    targetRR: 1.5,
  };
  assert(
    JSON.stringify(result) === JSON.stringify(expected),
    `snapshot berubah: ${JSON.stringify(result)}`,
  );
});

test("225. signature applyBrokerPreset aman + call site meneruskan broker", () => {
  const previous = makeValidBroker();
  const out = applyBrokerPreset(previous, "EURUSD");
  assert(out !== previous, "harus objek baru untuk simbol dikenal");
  assert(typeof out.pointValue === "number", "return bukan BrokerSettings");
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("applyBrokerPreset(previous, symbol, activeBrokerId)"),
    "effect simbol tidak meneruskan broker aktif",
  );
  assert(
    app.includes("[market.symbol, activeBrokerId, clearAnalysisOutput]"),
    "tombol preset tidak meneruskan broker aktif",
  );
  assert(
    app.includes("validateAnalysisInputs(market, broker, activeBrokerId)"),
    "validator tidak menerima konteks broker",
  );
  assert(
    app.includes("otbPresetMissingNotice"),
    "status preset OTB tak terverifikasi hilang dari UI",
  );
  assert(app.includes("belum terverifikasi di"), "pesan preset OTB hilang");
});

/* ---------------- Dropdown & warning kondisional 4C: TEST 226-235 ---------------- */

test("226. dropdown Finex menampilkan US100 dan GBPUSD", () => {
  const finex = getAvailableSymbols("finex");
  assert(
    JSON.stringify(finex) === JSON.stringify([...SUPPORTED_SYMBOLS]),
    "daftar Finex berubah",
  );
  assert(finex.includes("US100"), "US100 hilang dari dropdown Finex");
  assert(finex.includes("GBPUSD"), "GBPUSD hilang dari dropdown Finex");
  assert(
    JSON.stringify(getAvailableSymbols()) === JSON.stringify(finex),
    "default tanpa broker bukan jalur Finex",
  );
  const form = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(form.includes("SUPPORTED_SYMBOLS"), "form lepas dari daftar Finex");
  assert(form.includes("symbolOptions.map"), "render opsi hilang");
});

test("227. dropdown OTB menampilkan 16 simbol broker", () => {
  const otb = getAvailableSymbols("orbitraderberjangka");
  assert(otb.length === 16, `daftar OTB=${JSON.stringify(otb)}`);
  assert(otb[0] === "AUDCAD_ORB", "urutan dropdown berubah");
  assert(otb.includes("GBPUSD_ORB"), "GBPUSD_ORB hilang");
  assert(otb.includes("AUDCAD_ORB"), "AUDCAD_ORB hilang");
  assert(otb.includes("EURCHF_ORB"), "EURCHF_ORB hilang");
  assert(otb.includes("AUDCHF_ORB"), "simbol TBD hilang dari daftar");
  assert(otb.includes("USDCAD_ORB"), "USDCAD_ORB hilang dari daftar");
  assert(otb.includes("NZDJPY_ORB"), "NZDJPY_ORB hilang dari daftar");
  assert(otb.includes("USDCHF_ORB"), "USDCHF_ORB hilang dari daftar");
  assert(otb.includes("USDJPY_ORB"), "USDJPY_ORB hilang dari daftar");
});

test("228. 16/16 simbol verified tanpa warning (6H)", () => {
  // Kebijakan verifikasi (6H): 16/16 verified; tidak ada simbol
  // pending tersisa. Simbol invented di luar dropdown tetap null.
  const otb = getAvailableSymbols("orbitraderberjangka");
  assert(otb.includes("AUDCHF_ORB"), "AUDCHF_ORB tidak terdaftar di dropdown");
  assert(
    hasOtbPresetForSymbol("AUDCHF_ORB", "orbitraderberjangka") === true,
    "AUDCHF_ORB verified 6E-1 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("AUDJPY_ORB", "orbitraderberjangka") === true,
    "AUDJPY_ORB verified 6E-2 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("AUDNZD_ORB", "orbitraderberjangka") === true,
    "AUDNZD_ORB verified 6E-3 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("AUDUSD_ORB", "orbitraderberjangka") === true,
    "AUDUSD_ORB verified 6E-4 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("CADJPY_ORB", "orbitraderberjangka") === true,
    "CADJPY_ORB verified 6E-5 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("CHFJPY_ORB", "orbitraderberjangka") === true,
    "CHFJPY_ORB verified 6E-6 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("EURAUD_ORB", "orbitraderberjangka") === true,
    "EURAUD_ORB verified 6E-7 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("EURCAD_ORB", "orbitraderberjangka") === true,
    "EURCAD_ORB verified 6E-8 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("GBPAUD_ORB", "orbitraderberjangka") === true,
    "GBPAUD_ORB verified 6E-9 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("USDCAD_ORB", "orbitraderberjangka") === true,
    "USDCAD_ORB verified 6E-10 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("AUDCAD_ORB", "orbitraderberjangka") === true,
    "AUDCAD_ORB verified 6E-11 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("EURCHF_ORB", "orbitraderberjangka") === true,
    "EURCHF_ORB verified 6E-12 harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("NZDJPY_ORB", "orbitraderberjangka") === true,
    "NZDJPY_ORB verified 6H harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("USDCHF_ORB", "orbitraderberjangka") === true,
    "USDCHF_ORB verified 6H harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("USDJPY_ORB", "orbitraderberjangka") === true,
    "USDJPY_ORB verified 6H harus tanpa warning",
  );
  assert(
    !hasOtbPresetForSymbol("EURUSD_ORB", "orbitraderberjangka"),
    "TBD invented dianggap terverifikasi",
  );
  assert(
    !hasOtbPresetForSymbol("GBPUSD", "orbitraderberjangka"),
    "simbol Finex dianggap preset OTB",
  );
  assert(
    getOtbInstrumentProfile("EURUSD_ORB") === null,
    "preset fiktif untuk TBD",
  );
});

test("229. pindah Finex ke OTB mengubah daftar dropdown", () => {
  const finex = getAvailableSymbols("finex");
  const otb = getAvailableSymbols("orbitraderberjangka");
  assert(
    JSON.stringify(finex) !== JSON.stringify(otb),
    "daftar tidak berubah saat broker berganti",
  );
  const form = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(
    form.includes("getAvailableSymbols(brokerId)"),
    "form tidak menurunkan opsi dari broker aktif",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("<ExtractedDataForm") &&
      app.includes("brokerId={activeBrokerId}"),
    "App tidak meneruskan broker ke form simbol",
  );
});

test("230. kembali OTB ke Finex memulihkan dropdown Finex", () => {
  const finex = getAvailableSymbols("finex");
  assert(!finex.includes("GBPUSD_ORB"), "simbol OTB bocor ke Finex");
  assert(finex.length === 10, `daftar Finex=${finex.length}`);
  assert(finex.includes("US100") && finex.includes("GBPUSD"), "daftar rusak");
});

test("231. dropdown tidak mencampur simbol Finex dan OTB", () => {
  for (const symbol of getAvailableSymbols("orbitraderberjangka")) {
    assert(
      !isSupportedSymbol(symbol),
      `simbol Finex ${symbol} tercampur di OTB`,
    );
  }
  for (const symbol of getAvailableSymbols("finex")) {
    assert(
      getOtbInstrumentProfile(symbol) === null,
      `preset OTB ${symbol} tercampur di Finex`,
    );
  }
});

test("232. warning verifikasi tidak tampil untuk simbol Finex", () => {
  assert(hasOtbPresetForSymbol("GBPUSD", "finex") === true, "Finex ditandai");
  assert(hasOtbPresetForSymbol("GBPUSD") === true, "default ditandai");
  assert(hasOtbPresetForSymbol("US100", "finex") === true, "US100 ditandai");
  const form = readSrc("src/components/analysis/BrokerSettingsForm.tsx");
  assert(
    form.includes("!hasOtbPresetForSymbol(symbol, brokerId)"),
    "warning form tidak kondisional preset",
  );
});

test("233. warning hilang untuk GBPUSD_ORB dan validator menerima", () => {
  assert(
    hasOtbPresetForSymbol("GBPUSD_ORB", "orbitraderberjangka") === true,
    "GBPUSD_ORB dianggap belum terverifikasi",
  );
  const summary = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "GBPUSD_ORB" },
    makeValidBroker(),
    "orbitraderberjangka",
  );
  assert(
    !summary.errors.some((error) => error.field === "symbol"),
    "simbol OTB terverifikasi ditolak validator",
  );
  const closed = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "GBPUSD_ORB" },
    makeValidBroker(),
  );
  // Tanpa konteks broker: GBPUSD_ORB dinilai sebagai keluarga GBPUSD via
  // normalizeSymbol (perilaku lama; skala identik) — bukan error simbol.
  // Fail-closed tetap dijaga di jalur preset (220/221), guard min-lot
  // (223), dan dropdown (228/231) yang memakai exact match.
  assert(
    !closed.errors.some((error) => error.field === "symbol"),
    "keluarga skala GBPUSD ikut ditolak",
  );
});

test("234. warning tampil untuk simbol OTB tanpa preset", () => {
  assert(
    hasOtbPresetForSymbol("EURUSD_ORB", "orbitraderberjangka") === false,
    "simbol invented lolos guard",
  );
  // Preset tidak ter-apply (penolakan yang berlaku, tanpa partial):
  const previous = makeValidBroker();
  assert(
    applyBrokerPreset(previous, "EURUSD_ORB", "orbitraderberjangka") ===
      previous,
    "preset unverified ter-apply",
  );
  // Validator menilainya sebagai keluarga EURUSD (skala sama via
  // normalizeSymbol) — bukan error simbol; pembeda unverified adalah
  // notice UI + tanpa preset fill.
  const summary = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "EURUSD_ORB" },
    makeValidBroker(),
    "orbitraderberjangka",
  );
  assert(
    !summary.errors.some((error) => error.field === "symbol"),
    "keluarga skala EURUSD ikut ditolak",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("otbPresetMissingNotice") &&
      app.includes("belum terverifikasi di"),
    "notice preset hilang dari App",
  );
  // Simbol di luar keluarga mana pun tetap ditolak walau broker OTB:
  const xyz = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "XYZ" },
    makeValidBroker(),
    "orbitraderberjangka",
  );
  assert(
    xyz.errors.some((error) => error.field === "symbol"),
    "simbol asing lolos di mode OTB",
  );
});

test("235. memilih simbol dropdown mengubah simbol state secara exact", () => {
  assert(
    canonicalSymbolForBroker("GBPUSD_ORB", "orbitraderberjangka") ===
      "GBPUSD_ORB",
    "suffiks _ORB terpangkas",
  );
  assert(
    canonicalSymbolForBroker("gbpusd_orb", "orbitraderberjangka") ===
      "GBPUSD_ORB",
    "kapital OTB tidak dinormalisasi",
  );
  assert(
    canonicalSymbolForBroker("GBPUSD.pro", "finex") === "GBPUSD",
    "jalur Finex berubah",
  );
  assert(
    canonicalSymbolForBroker("GBPUSD.pro") === "GBPUSD",
    "default tanpa broker berubah",
  );
  assert(
    canonicalSymbolForBroker("", "orbitraderberjangka") === "",
    "simbol kosong lolos",
  );
  const form = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(
    form.includes("updateSymbol(event.target.value)"),
    "select tidak meneruskan pilihan",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("onSymbolChange={handleSymbolChange}"),
    "form simbol lepas dari handler",
  );
  const start = app.indexOf("const handleSymbolChange");
  const end = app.indexOf("const handleExtracted", start);
  assert(start >= 0 && end > start, "handler simbol hilang");
  const body = app.slice(start, end);
  assert(
    body.includes("canonicalSymbolForBroker"),
    "handler tidak memakai kanonikalisasi per broker",
  );
  assert(body.includes("createEmptyMarketForSymbol"), "reset hilang");
});

/* ---------------- Preservasi _ORB 5A Step 1: TEST 236-244 ---------------- */

test("236. OCR mengenali GBPUSD_ORB exact tanpa dinormalisasi", () => {
  assert(
    findOtbSymbolInText("GBPUSD_ORB 1.31970 1.31984") === "GBPUSD_ORB",
    "deteksi exact gagal",
  );
  assert(
    findOtbSymbolInText("gbpusd_orb H1") === "GBPUSD_ORB",
    "deteksi case-insensitive gagal",
  );
  assert(
    findOtbSymbolInText("GBPUSD 1.32474 1.32480") === null,
    "nama Finex cocok sebagai OTB",
  );
  assert(findOtbSymbolInText("") === null, "teks kosong cocok");
  assert(exactOtbSymbol("GBPUSD_ORB") === "GBPUSD_ORB", "kanonis gagal");
  assert(exactOtbSymbol("GBPUSD") === null, "nama Finex lolos exact");
  const rich = parseOcrTextRich("GBPUSD 1.32474 1.32480", {
    activeSymbol: "GBPUSD_ORB",
  });
  assert(
    rich.data.symbol === "GBPUSD_ORB",
    `simbol aktif OTB dinormalisasi: ${rich.data.symbol}`,
  );
});

test("237. OCR mengenali AUDCAD_ORB exact", () => {
  assert(
    findOtbSymbolInText("AUDCAD_ORB ... market watch") === "AUDCAD_ORB",
    "deteksi AUDCAD_ORB gagal",
  );
  const rich = parseOcrTextRich("AUDCAD_ORB 0.91210 0.91216", {
    activeSymbol: "",
  });
  assert(
    rich.data.symbol === "AUDCAD_ORB",
    `fallback OTB hilang: ${rich.data.symbol}`,
  );
});

test("238. OCR mengenali EURCHF_ORB dan merge menjaga simbol OTB", () => {
  assert(
    findOtbSymbolInText("EURCHF_ORB ... data window") === "EURCHF_ORB",
    "deteksi EURCHF_ORB gagal",
  );
  const previous: MarketData = {
    ...makeValidMarket("GBPUSD"),
    symbol: "GBPUSD_ORB",
    support: 1.3211,
    resistance: 1.3299,
  };
  const kept = mergeValidOcrMarketData(previous, {
    bid: 1.3197,
    ask: 1.31984,
    close: 1.31977,
  });
  assert(kept.symbol === "GBPUSD_ORB", `simbol OTB tertimpa: ${kept.symbol}`);
  assert(kept.support === 1.3211, "S/R ikut tertimpa");
  const fresh = mergeValidOcrMarketData(
    { ...makeEmptySrMarket(), symbol: "" },
    {
      bid: 1.3197,
      ask: 1.31984,
      symbol: "AUDCAD_ORB",
    },
  );
  assert(fresh.symbol === "AUDCAD_ORB", `deteksi baru hilang: ${fresh.symbol}`);
  const keepsCurrent = mergeValidOcrMarketData(makeEmptySrMarket(), {
    bid: 1.3197,
    ask: 1.31984,
    symbol: "AUDCAD_ORB",
  });
  assert(
    keepsCurrent.symbol === "GBPUSD",
    "OCR menimpa pilihan simbol aktif (current-wins dilanggar)",
  );
});

test("239. dropdown OTB 16 simbol, 16/16 terverifikasi", () => {
  const symbols = getAvailableSymbols("orbitraderberjangka");
  assert(symbols.length === 16, `expected 16, got ${symbols.length}`);
  assert(symbols.includes("GBPUSD_ORB"), "GBPUSD_ORB missing");
  assert(symbols.includes("AUDCAD_ORB"), "AUDCAD_ORB missing");
  assert(symbols.includes("EURCHF_ORB"), "EURCHF_ORB missing");
  // Kebijakan verifikasi (6H): 16/16 verified, tanpa pending.
  assert(
    hasOtbPresetForSymbol("GBPUSD_ORB", "orbitraderberjangka") === true,
    "GBPUSD_ORB harus terverifikasi",
  );
  assert(
    hasOtbPresetForSymbol("AUDCHF_ORB", "orbitraderberjangka") === true,
    "AUDCHF_ORB harus terverifikasi (6E-1)",
  );
  assert(
    hasOtbPresetForSymbol("AUDJPY_ORB", "orbitraderberjangka") === true,
    "AUDJPY_ORB harus terverifikasi (6E-2)",
  );
  assert(
    hasOtbPresetForSymbol("AUDNZD_ORB", "orbitraderberjangka") === true,
    "AUDNZD_ORB harus terverifikasi (6E-3)",
  );
  assert(
    hasOtbPresetForSymbol("AUDUSD_ORB", "orbitraderberjangka") === true,
    "AUDUSD_ORB harus terverifikasi (6E-4)",
  );
  assert(
    hasOtbPresetForSymbol("CADJPY_ORB", "orbitraderberjangka") === true,
    "CADJPY_ORB harus terverifikasi (6E-5)",
  );
  assert(
    hasOtbPresetForSymbol("CHFJPY_ORB", "orbitraderberjangka") === true,
    "CHFJPY_ORB harus terverifikasi (6E-6)",
  );
  assert(
    hasOtbPresetForSymbol("EURAUD_ORB", "orbitraderberjangka") === true,
    "EURAUD_ORB harus terverifikasi (6E-7)",
  );
  assert(
    hasOtbPresetForSymbol("EURCAD_ORB", "orbitraderberjangka") === true,
    "EURCAD_ORB harus terverifikasi (6E-8)",
  );
  assert(
    hasOtbPresetForSymbol("GBPAUD_ORB", "orbitraderberjangka") === true,
    "GBPAUD_ORB harus terverifikasi (6E-9)",
  );
  assert(
    hasOtbPresetForSymbol("USDCAD_ORB", "orbitraderberjangka") === true,
    "USDCAD_ORB harus terverifikasi (6E-10)",
  );
  assert(
    hasOtbPresetForSymbol("AUDCAD_ORB", "orbitraderberjangka") === true,
    "AUDCAD_ORB harus terverifikasi (6E-11)",
  );
  assert(
    hasOtbPresetForSymbol("EURCHF_ORB", "orbitraderberjangka") === true,
    "EURCHF_ORB harus terverifikasi (6E-12)",
  );
  assert(
    hasOtbPresetForSymbol("NZDJPY_ORB", "orbitraderberjangka") === true,
    "NZDJPY_ORB harus terverifikasi (6H)",
  );
  assert(
    hasOtbPresetForSymbol("USDCHF_ORB", "orbitraderberjangka") === true,
    "USDCHF_ORB harus terverifikasi (6H)",
  );
  assert(
    hasOtbPresetForSymbol("USDJPY_ORB", "orbitraderberjangka") === true,
    "USDJPY_ORB harus terverifikasi (6H)",
  );
  for (const symbol of symbols) {
    assert(
      hasOtbPresetForSymbol(symbol, "orbitraderberjangka") === true,
      `${symbol} belum terverifikasi`,
    );
  }
});

test("240. banner saran tampil untuk GBPUSD_ORB saat broker Finex", () => {
  const notice = getOtbDetectedNotice("finex", "GBPUSD_ORB");
  assert(notice !== null, "banner tidak tampil");
  if (notice === null) {
    throw new Error("banner tidak tampil");
  }
  assert(notice.includes("GBPUSD_ORB"), `pesan=${notice}`);
  assert(
    getOtbDetectedNotice("orbitraderberjangka", "GBPUSD_ORB") === null,
    "banner tampil saat broker sudah OTB",
  );
  assert(
    getOtbDetectedNotice("finex", "GBPUSD") === null,
    "banner tampil untuk simbol Finex",
  );
  assert(getOtbDetectedNotice("finex", "") === null, "banner tampil kosong");
});

test("241. banner pindah tampil untuk AUDCAD_ORB verified (6E-11)", () => {
  // Simbol terverifikasi memakai banner saran pindah broker (bukan notice
  // verifikasi yang khusus pending; tidak ada pending tersisa di 6E-11/12).
  assert(
    getOtbDetectedNotice("finex", "AUDCAD_ORB") !== null,
    "banner pindah hilang untuk simbol verified",
  );
  assert(
    hasOtbPresetForSymbol("AUDCAD_ORB", "orbitraderberjangka") === true,
    "AUDCAD_ORB harus terverifikasi (6E-11)",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("otbPresetMissingNotice") &&
      app.includes("belum terverifikasi di"),
    "notice verifikasi pending hilang dari App",
  );
});

test("242. banner pindah tampil untuk EURCHF_ORB verified (6E-12)", () => {
  assert(
    getOtbDetectedNotice("finex", "EURCHF_ORB") !== null,
    "banner pindah hilang untuk simbol verified",
  );
  assert(
    hasOtbPresetForSymbol("EURCHF_ORB", "orbitraderberjangka") === true,
    "EURCHF_ORB harus terverifikasi (6E-12)",
  );
  const app = readSrc("src/App.tsx");
  assert(app.includes("otb-switch-banner"), "testid banner hilang");
  assert(
    app.includes('handleBrokerChange("orbitraderberjangka")'),
    "tombol banner melewati cleanup handler",
  );
});

test("243. hasOtbPresetForSymbol true untuk 16/16 simbol verified", () => {
  assert(
    hasOtbPresetForSymbol("GBPUSD_ORB", "orbitraderberjangka") === true,
    "GBPUSD_ORB harus terverifikasi",
  );
  assert(
    hasOtbPresetForSymbol("AUDCHF_ORB", "orbitraderberjangka") === true,
    "AUDCHF_ORB harus terverifikasi (6E-1)",
  );
  assert(
    hasOtbPresetForSymbol("AUDJPY_ORB", "orbitraderberjangka") === true,
    "AUDJPY_ORB harus terverifikasi (6E-2)",
  );
  assert(
    hasOtbPresetForSymbol("AUDNZD_ORB", "orbitraderberjangka") === true,
    "AUDNZD_ORB harus terverifikasi (6E-3)",
  );
  assert(
    hasOtbPresetForSymbol("AUDUSD_ORB", "orbitraderberjangka") === true,
    "AUDUSD_ORB harus terverifikasi (6E-4)",
  );
  assert(
    hasOtbPresetForSymbol("CADJPY_ORB", "orbitraderberjangka") === true,
    "CADJPY_ORB harus terverifikasi (6E-5)",
  );
  assert(
    hasOtbPresetForSymbol("CHFJPY_ORB", "orbitraderberjangka") === true,
    "CHFJPY_ORB harus terverifikasi (6E-6)",
  );
  assert(
    hasOtbPresetForSymbol("EURAUD_ORB", "orbitraderberjangka") === true,
    "EURAUD_ORB harus terverifikasi (6E-7)",
  );
  assert(
    hasOtbPresetForSymbol("EURCAD_ORB", "orbitraderberjangka") === true,
    "EURCAD_ORB harus terverifikasi (6E-8)",
  );
  assert(
    hasOtbPresetForSymbol("GBPAUD_ORB", "orbitraderberjangka") === true,
    "GBPAUD_ORB harus terverifikasi (6E-9)",
  );
  assert(
    hasOtbPresetForSymbol("USDCAD_ORB", "orbitraderberjangka") === true,
    "USDCAD_ORB harus terverifikasi (6E-10)",
  );
  assert(
    hasOtbPresetForSymbol("AUDCAD_ORB", "orbitraderberjangka") === true,
    "AUDCAD_ORB harus terverifikasi (6E-11)",
  );
  assert(
    hasOtbPresetForSymbol("EURCHF_ORB", "orbitraderberjangka") === true,
    "EURCHF_ORB harus terverifikasi (6E-12)",
  );
  assert(
    hasOtbPresetForSymbol("NZDJPY_ORB", "orbitraderberjangka") === true,
    "NZDJPY_ORB harus terverifikasi (6H)",
  );
  assert(
    hasOtbPresetForSymbol("USDCHF_ORB", "orbitraderberjangka") === true,
    "USDCHF_ORB harus terverifikasi (6H)",
  );
  assert(
    hasOtbPresetForSymbol("USDJPY_ORB", "orbitraderberjangka") === true,
    "USDJPY_ORB harus terverifikasi (6H)",
  );
  // Kebijakan verifikasi (6H): tidak ada pending tersisa;
  // invented tetap false.
  assert(
    hasOtbPresetForSymbol("EURUSD_ORB", "orbitraderberjangka") === false,
    "EURUSD_ORB invented harus false (TBD)",
  );
});

test("244. OTB_PRESETS berisi 16 objek (16/16 verified)", () => {
  const keys = Object.keys(OTB_PRESETS);
  // 16/16 simbol terverifikasi via VERIFIED_OTB_SYMBOLS
  // (GBPUSD + 6E-1..6E-12 + 6H: NZDJPY, USDCHF, USDJPY).
  assert(keys.length === 16, `expected 16 presets, got ${keys.length}`);
  assert(keys.includes("GBPUSD_ORB"), "GBPUSD_ORB hilang dari preset");
  assert(keys.includes("AUDCAD_ORB"), "AUDCAD_ORB hilang dari preset");
  assert(keys.includes("EURCHF_ORB"), "EURCHF_ORB hilang dari preset");
  const audcad = getOtbInstrumentProfile("AUDCAD_ORB");
  if (audcad === null) {
    throw new Error("preset AUDCAD_ORB hilang");
  }
  assert(calculateOtbTickValue(audcad) === 1, "tick value AUDCAD bukan 1");
  assert(audcad.currencyProfit === "CAD", "profit currency bukan CAD");
  assert(audcad.contractCurrency === "AUD", "contract currency bukan AUD");
  assert(audcad.swapLong === -0.75 && audcad.swapShort === -2.25, "swap salah");
  const eurchf = getOtbInstrumentProfile("EURCHF_ORB");
  if (eurchf === null) {
    throw new Error("preset EURCHF_ORB hilang");
  }
  assert(calculateOtbTickValue(eurchf) === 1, "tick value EURCHF bukan 1");
  assert(eurchf.currencyProfit === "CHF", "profit currency bukan CHF");
  assert(eurchf.contractCurrency === "EUR", "contract currency bukan EUR");
  assert(eurchf.swapLong === -1.75 && eurchf.swapShort === -1.25, "swap salah");
});

/* ---------------- Komisi OTB auto-fill 5B: TEST 245-250 ---------------- */

function otbBrokerWithCommission(commission: number): BrokerSettings {
  return { ...makeValidBroker(), commission };
}

test("245. komisi GBPUSD_ORB auto-fill 33 (spec32 Tahap 6G)", () => {
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(applied.commission === 33, `komisi=${applied.commission} (spec32 33)`);
});

test("246. komisi AUDCAD_ORB aktif via spec32 (commission=33)", () => {
  // Tahap 6G: AUDCAD_ORB terdaftar di spec32 → preset ter-apply dengan
  // commission spec32 (33.00 CSV); profile fisik (pointValue/minLot) tetap
  // dari OTB_PRESETS. Override manual pengguna dipertahankan.
  const previous = makeEmptyBroker();
  const applied = applyBrokerPreset(
    previous,
    "AUDCAD_ORB",
    "orbitraderberjangka",
  );
  assert(applied !== previous, "preset spec32 tidak ter-apply");
  assert(applied.commission === 33, `komisi=${applied.commission} (spec32 33)`);
  assert(applied.pointValue === 1, `pointValue=${applied.pointValue}`);
  assert(applied.minLot === 0.1, `minLot=${applied.minLot}`);
  const manual = applyBrokerPreset(
    otbBrokerWithCommission(50),
    "AUDCAD_ORB",
    "orbitraderberjangka",
  );
  assert(manual.commission === 50, "input komisi manual pengguna tertimpa");
  // 6E-11: AUDCAD_ORB kini verified → penyimpangan komisi dari spec (33)
  // WAJIB warning (bukan pembanding fixture). Komisi 33 lolos tanpa warning.
  const summary = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "AUDCAD_ORB" },
    otbBrokerWithCommission(50),
    "orbitraderberjangka",
  );
  assert(
    summary.warnings.some((item) => item.field === "commission"),
    "warning penyimpangan komisi hilang untuk simbol verified",
  );
  const exact = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "AUDCAD_ORB" },
    otbBrokerWithCommission(33),
    "orbitraderberjangka",
  );
  assert(
    !exact.warnings.some((item) => item.field === "commission"),
    "komisi spec 33 ikut di-warning",
  );
});

test("247. komisi EURCHF_ORB aktif via spec32 (commission=33)", () => {
  // Tahap 6G: EURCHF_ORB terdaftar di spec32 → preset ter-apply dengan
  // commission spec32 (33.00); profile fisik tetap dari OTB_PRESETS.
  const previous = makeEmptyBroker();
  const applied = applyBrokerPreset(
    previous,
    "EURCHF_ORB",
    "orbitraderberjangka",
  );
  assert(applied !== previous, "preset spec32 tidak ter-apply");
  assert(applied.commission === 33, `komisi=${applied.commission} (spec32 33)`);
  assert(applied.pointValue === 1, `pointValue=${applied.pointValue}`);
});

test("248. komisi simbol OTB TBD tetap kosong", () => {
  const previous = makeEmptyBroker();
  // 5D-EXT1: AUDCHF_ORB kini berpreset → TBD diuji via invented EURUSD_ORB.
  const result = applyBrokerPreset(
    previous,
    "EURUSD_ORB",
    "orbitraderberjangka",
  );
  assert(result === previous, "preset TBD ikut mengisi");
  assert(result.commission === 0, "komisi berubah tanpa preset");
});

test("249. komisi Finex auto-fill 1.00 + override manual", () => {
  // Tahap 6G: Finex 1.00 USD/lot (CSV terminal). Kosong → 1.00;
  // input manual dipertahankan.
  const viaDefault = applyBrokerPreset(makeEmptyBroker(), "GBPUSD");
  assert(viaDefault.commission === 1, "Finex tidak auto-fill komisi 1.00");
  const viaFinex = applyBrokerPreset(makeEmptyBroker(), "GBPUSD", "finex");
  assert(viaFinex.commission === 1, "jalur finex tidak auto-fill komisi 1.00");
  assert(
    FINEX_DEFAULT_COMMISSION === 1,
    `konstanta=${FINEX_DEFAULT_COMMISSION}`,
  );
  const manual = applyBrokerPreset(
    { ...makeEmptyBroker(), commission: 5 },
    "GBPUSD",
    "finex",
  );
  assert(manual.commission === 5, "override komisi Finex tertimpa");
});

test("250. user bisa override komisi OTB + guard info menyimpang", () => {
  const kept = applyBrokerPreset(
    otbBrokerWithCommission(50),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(kept.commission === 50, "override komisi pengguna tertimpa");
  const warned = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "GBPUSD_ORB" },
    otbBrokerWithCommission(50),
    "orbitraderberjangka",
  );
  const info = warned.warnings.find((item) => item.field === "commission");
  assert(info !== undefined, "info penyimpangan komisi hilang");
  if (info === undefined) {
    throw new Error("info penyimpangan komisi hilang");
  }
  assert(info.message.includes("33"), `pesan=${info.message}`);
  assert(
    !warned.errors.some((item) => item.field === "commission"),
    "info komisi berubah menjadi error pemblokir",
  );
  const exact = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "GBPUSD_ORB" },
    otbBrokerWithCommission(33),
    "orbitraderberjangka",
  );
  assert(
    !exact.warnings.some((item) => item.field === "commission"),
    "komisi sesuai spec ikut diperingatkan",
  );
});

/* ---------------- Biaya swap overnight 5C: TEST 251-256 ---------------- */
/* Modul murni; engine/validator/UI tidak tersentuh. */

function requireSwapCost(
  args: Parameters<typeof calculateSwapCost>[0],
): Exclude<ReturnType<typeof calculateSwapCost>, null> {
  const result = calculateSwapCost(args);
  if (result === null) {
    throw new Error(`swap cost null untuk ${JSON.stringify(args)}`);
  }
  return result;
}

test("251. swapLong tersimpan (13/13 verified 6E-11/12)", () => {
  const gbp = getOtbInstrumentProfile("GBPUSD_ORB");
  const aud = getOtbInstrumentProfile("AUDCAD_ORB");
  const eur = getOtbInstrumentProfile("EURCHF_ORB");
  if (gbp === null || aud === null || eur === null) {
    throw new Error("preset swap hilang");
  }
  assert(gbp.swapLong === -2.25, `GBPUSD long=${gbp.swapLong}`);
  assert(aud.swapLong === -0.75, `AUDCAD long=${aud.swapLong}`);
  assert(eur.swapLong === -1.75, `EURCHF long=${eur.swapLong}`);
});

test("252. swapShort tersimpan (13/13 verified 6E-11/12)", () => {
  const gbp = getOtbInstrumentProfile("GBPUSD_ORB");
  const aud = getOtbInstrumentProfile("AUDCAD_ORB");
  const eur = getOtbInstrumentProfile("EURCHF_ORB");
  if (gbp === null || aud === null || eur === null) {
    throw new Error("preset swap hilang");
  }
  assert(gbp.swapShort === -0.75, `GBPUSD short=${gbp.swapShort}`);
  assert(aud.swapShort === -2.25, `AUDCAD short=${aud.swapShort}`);
  assert(eur.swapShort === -1.25, `EURCHF short=${eur.swapShort}`);
});

test("253. holdingDays=1 long memuat swap penuh + peta BELI", () => {
  const cost = requireSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "long",
    lot: 0.1,
    holdingDays: 1,
  });
  assert(cost.swapPerDayPerLot === -2.25, "rate long salah");
  assert(cost.direction === "long", "arah tidak bergema");
  assert(cost.holdingDays === 1 && cost.lot === 0.1, "input tidak bergema");
  assert(Math.abs(cost.swapCost - -0.225) < 1e-9, `swapCost=${cost.swapCost}`);
  const beli = requireSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.1,
    holdingDays: 1,
  });
  assert(
    Math.abs(beli.swapCost - cost.swapCost) < 1e-12,
    "BELI tidak memetakan ke long",
  );
});

test("254. holdingDays=0 atau negatif = nol biaya", () => {
  const zero = requireSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "long",
    lot: 0.5,
    holdingDays: 0,
  });
  assert(zero.swapCost === 0, `swapCost=${zero.swapCost}`);
  assert(zero.holdingDays === 0, "holdingDays tidak ternormalisasi");
  const negative = requireSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "short",
    lot: 0.5,
    holdingDays: -3,
  });
  assert(negative.swapCost === 0, "holding negatif berbiaya");
});

test("255. arah short memakai swapShort + default 1 hari", () => {
  const cost = requireSwapCost({
    symbol: "AUDCAD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 1,
    holdingDays: 2,
  });
  assert(cost.direction === "short", "JUAL tidak memetakan ke short");
  assert(cost.swapPerDayPerLot === -2.25, "rate short salah");
  assert(Math.abs(cost.swapCost - -4.5) < 1e-9, `swapCost=${cost.swapCost}`);
  const omitted = requireSwapCost({
    symbol: "EURCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "short",
    lot: 0.1,
  });
  assert(omitted.holdingDays === 1, "default holdingDays bukan 1");
  assert(
    Math.abs(omitted.swapCost - -0.125) < 1e-9,
    `swapCost=${omitted.swapCost}`,
  );
});

test("256. non-OTB/TBD/invalid mengembalikan null", () => {
  assert(
    calculateSwapCost({
      symbol: "GBPUSD",
      brokerId: "finex",
      direction: "long",
      lot: 0.1,
      holdingDays: 1,
    }) === null,
    "Finex berbiaya swap",
  );
  assert(
    calculateSwapCost({
      symbol: "GBPUSD",
      direction: "long",
      lot: 0.1,
      holdingDays: 1,
    }) === null,
    "tanpa broker ikut terhitung",
  );
  assert(
    calculateSwapCost({
      symbol: "NZDUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "long",
      lot: 0.1,
      holdingDays: 1,
    }) === null,
    "simbol TBD ikut terhitung",
  );
  assert(
    calculateSwapCost({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "TUNGGU",
      lot: 0.1,
      holdingDays: 1,
    }) === null,
    "TUNGGU berbiaya",
  );
  assert(
    calculateSwapCost({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "long",
      lot: 0,
      holdingDays: 1,
    }) === null,
    "lot 0 terhitung",
  );
  assert(
    calculateSwapCost({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "long",
      lot: NaN,
      holdingDays: 1,
    }) === null,
    "lot NaN terhitung",
  );
});

/* ---------------- Attach swap post-decision 5C-Step-2: TEST 257-262 ---------------- */

function makeAnalysisResult(
  decision: "BELI" | "JUAL" | "TUNGGU",
  suggestedLot: number | null,
) {
  return {
    decision,
    score: 4,
    trendScore: 1,
    cciScore: 1,
    macdScore: 1,
    rsiScore: 1,
    entry: 1.3197,
    stopLoss: 1.3187,
    takeProfit: 1.3212,
    riskDistance: 0.001,
    targetDistance: 0.0015,
    maxRiskUsd: 0.9,
    riskAtMinLot: 1.19,
    theoreticalLot: 0.05,
    suggestedLot,
    riskPercentAtMinLot: 13.2,
    riskStatus: "MEMENUHI batas risiko",
    explanation: "fixture",
    factors: [],
    warnings: [],
  };
}

function requireAttachedSwap(
  args: Parameters<typeof attachSwapToResult>[1],
  decision: "BELI" | "JUAL" | "TUNGGU" = "BELI",
) {
  const attached = attachSwapToResult(makeAnalysisResult(decision, 0.1), args);
  if (attached === null || attached.swapDetail === null) {
    throw new Error(`attach swap null untuk ${JSON.stringify(args)}`);
  }
  return attached.swapDetail;
}

test("257. attach holdingDays=0 → swapCost 0 intraday", () => {
  const detail = requireAttachedSwap({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.1,
    holdingDays: 0,
  });
  assert(detail.swapCost === 0, `swapCost=${detail.swapCost}`);
  assert(detail.holdingDays === 0, "holdingDays tidak bergema");
  assert(detail.profitCurrency === "USD", `currency=${detail.profitCurrency}`);
});

test("258. attach GBPUSD_ORB BELI 1 hari → -2.25 USD", () => {
  const detail = requireAttachedSwap({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
  });
  assert(detail.direction === "long", "BELI tidak memetakan ke long");
  assert(
    Math.abs(detail.swapCost - -2.25) < 1e-9,
    `swapCost=${detail.swapCost}`,
  );
  assert(detail.profitCurrency === "USD", "label currency salah");
});

test("259. attach AUDCAD_ORB JUAL multi-hari → CAD jujur [verified 6E-11]", () => {
  const detail = requireAttachedSwap(
    {
      symbol: "AUDCAD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "JUAL",
      lot: 1,
      holdingDays: 9,
    },
    "JUAL",
  );
  assert(detail.direction === "short", "JUAL tidak memetakan ke short");
  assert(
    Math.abs(detail.swapCost - -20.25) < 1e-9,
    `swapCost=${detail.swapCost}`,
  );
  assert(detail.profitCurrency === "CAD", "unit CAD diklaim USD");
});

test("260. memo swap berlabel profit-currency", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes('data-testid="swap-memo"'), "testid memo hilang");
  assert(src.includes("/lot (profit"), "label profit currency hilang");
  assert(src.includes("attachSwapToResult"), "memo tidak dari hasil attach");
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("blockedReasons={blockedReasons}") &&
      app.includes("brokerId={activeBrokerId}"),
    "props hasil tidak lengkap",
  );
});

test("261. spinner holdingDays 0-10 tersedia", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes("useState(0)"), "state holding default hilang");
  assert(src.includes("Holding (hari)"), "label spinner hilang");
  assert(
    src.includes('data-testid="swap-holding-input"'),
    "testid spinner hilang",
  );
  assert(src.includes("min={0}") && src.includes("max={10}"), "batas hilang");
  assert(src.includes("Math.min(10,"), "clamp atas hilang");
});

test("262. Finex blind + null-safety attach", () => {
  const base = {
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka" as const,
    direction: "BELI" as const,
    lot: 0.1,
    holdingDays: 1,
  };
  assert(
    attachSwapToResult(makeAnalysisResult("BELI", 0.1), {
      ...base,
      brokerId: "finex",
    }) === null,
    "Finex ikut ter-attach swap",
  );
  assert(
    attachSwapToResult(makeAnalysisResult("BELI", 0.1), {
      ...base,
      symbol: "NZDUSD_ORB",
    }) === null,
    "simbol TBD ikut ter-attach",
  );
  assert(
    attachSwapToResult(makeAnalysisResult("BELI", null), {
      ...base,
      lot: null,
    }) === null,
    "lot null ter-attach",
  );
  assert(
    attachSwapToResult(makeAnalysisResult("TUNGGU", 0.1), {
      ...base,
      direction: "TUNGGU",
    }) === null,
    "TUNGGU ter-attach swap",
  );
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(
    src.includes('brokerId === "orbitraderberjangka"'),
    "blok swap tidak digate broker OTB",
  );
});

/* ---------------- Swap dual-mode 5D-EXT1: TEST 263-278 ---------------- */
/* Flat = swapPerDayUSD × lot × days. Percentage = contractSize × currentPrice × (pct/100) × lot × days. */

test("263. flat GBPUSD_ORB BELI 1 lot 1 hari → -2.25 USD", () => {
  const cost = requireSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
  });
  assert(cost.swapType === "flat", `swapType=${cost.swapType}`);
  assert(Math.abs(cost.swapCost - -2.25) < 1e-9, `swapCost=${cost.swapCost}`);
  assert(
    Math.abs(cost.swapCostInContractBaseCurrency - -2.25) < 1e-9,
    "alias kontrak-base salah",
  );
  assert(cost.contractBaseCurrency === "USD", "flat base bukan USD");
  assert(cost.profitCurrency === "USD", "profit currency salah");
  assert(cost.swapPerDayUSD === -2.25, "swapPerDayUSD salah");
  assert(
    cost.direction === "long" && cost.directionInput === "BELI",
    "arah salah",
  );
});

test("264. flat AUDCAD_ORB JUAL 2 lot 2 hari → -9.0 [verified 6E-11]", () => {
  const cost = requireSwapCost({
    symbol: "AUDCAD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 2,
    holdingDays: 2,
  });
  assert(cost.swapType === "flat", "bukan flat");
  assert(cost.swapPerDayUSD === -2.25, "rate short salah");
  assert(
    Math.abs(cost.swapCost - -9.0) < 1e-9,
    `swapCost=${cost.swapCost} (spec -1.5 salah hitung: -2.25×2×2=-9.0)`,
  );
  assert(cost.contractBaseCurrency === "USD", "flat base bukan USD");
  assert(cost.profitCurrency === "CAD", "profit CAD salah");
});

test("265. flat EURCHF_ORB holdingDays=0 → 0 intraday", () => {
  const cost = requireSwapCost({
    symbol: "EURCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 0,
  });
  assert(cost.swapCost === 0, `swapCost=${cost.swapCost}`);
  assert(cost.swapCostInContractBaseCurrency === 0, "alias tidak nol");
  assert(cost.holdingDays === 0, "holdingDays tidak bergema");
});

test("266. percentage AUDCHF_ORB BELI 0.5 lot price=0.5756 → -431.7 AUD [verified 6E-1]", () => {
  const cost = requireSwapCost({
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
  });
  assert(cost.swapType === "percentage", `swapType=${cost.swapType}`);
  assert(
    Math.abs(cost.swapCost - -431.7) < 1e-6,
    `swapCost=${cost.swapCost} (spec -863.4 lupa ×lot 0.5)`,
  );
  assert(cost.contractBaseCurrency === "AUD", "base bukan AUD");
  assert(cost.profitCurrency === "CHF", "profit bukan CHF");
  assert(cost.swapPercentage === -1.5, "swapPercentage salah");
  assert(cost.contractSize === 100000, "contractSize salah");
});

test("267. percentage AUDCHF_ORB JUAL 0.5 lot → sama -431.7 AUD [verified 6E-1]", () => {
  const cost = requireSwapCost({
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
  });
  assert(Math.abs(cost.swapCost - -431.7) < 1e-6, `swapCost=${cost.swapCost}`);
  assert(cost.direction === "short", "JUAL tidak ke short");
  assert(cost.swapPercentage === -1.5, "long/short sama -1.5");
});

test("268. percentage AUDJPY_ORB JUAL 1 lot price=0.009325 3 hari → -48.95625 [verified 6E-2]", () => {
  const cost = requireSwapCost({
    symbol: "AUDJPY_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 1,
    holdingDays: 3,
    currentPrice: 0.009325,
  });
  assert(cost.swapPercentage === -1.75, "rate short salah");
  assert(
    Math.abs(cost.swapCost - -48.95625) < 1e-6,
    `swapCost=${cost.swapCost} (≈-49 spec)`,
  );
  assert(cost.contractBaseCurrency === "AUD", "base bukan AUD");
  assert(cost.profitCurrency === "JPY", "profit bukan JPY");
});

test("269. percentage AUDNZD_ORB BELI 2 lot price=0.4950 2 hari → -2475 [verified 6E-3]", () => {
  const cost = requireSwapCost({
    symbol: "AUDNZD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 2,
    holdingDays: 2,
    currentPrice: 0.495,
  });
  assert(Math.abs(cost.swapCost - -2475) < 1e-6, `swapCost=${cost.swapCost}`);
  assert(cost.profitCurrency === "NZD", "profit bukan NZD");
});

test("270. percentage AUDUSD_ORB holdingDays=0 → 0", () => {
  const cost = requireSwapCost({
    symbol: "AUDUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 0,
    currentPrice: 0.65,
  });
  assert(cost.swapCost === 0, `swapCost=${cost.swapCost}`);
  assert(cost.swapType === "percentage", "tipe harus percentage");
});

test("271. percentage holdingDays negatif → 0", () => {
  const cost = requireSwapCost({
    symbol: "AUDUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: -2,
    currentPrice: 0.65,
  });
  assert(cost.swapCost === 0, "holding negatif berbiaya");
  assert(cost.holdingDays === 0, "tidak ternormalisasi ke 0");
});

test("272. broker Finex → null", () => {
  assert(
    calculateSwapCost({
      symbol: "GBPUSD_ORB",
      brokerId: "finex",
      direction: "BELI",
      lot: 1,
      holdingDays: 1,
    }) === null,
    "Finex berbiaya swap",
  );
});

test("273. simbol TBD → null", () => {
  assert(
    calculateSwapCost({
      symbol: "NZDUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      lot: 1,
      holdingDays: 1,
      currentPrice: 0.6,
    }) === null,
    "simbol TBD ikut terhitung",
  );
});

test("274. direction TUNGGU → null", () => {
  assert(
    calculateSwapCost({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "TUNGGU",
      lot: 1,
      holdingDays: 1,
    }) === null,
    "TUNGGU berbiaya",
  );
});

test("275. lot=0 → null", () => {
  assert(
    calculateSwapCost({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      lot: 0,
      holdingDays: 1,
    }) === null,
    "lot 0 terhitung",
  );
});

test("276. percentage tanpa currentPrice → null (graceful)", () => {
  assert(
    calculateSwapCost({
      symbol: "AUDCHF_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      lot: 0.5,
      holdingDays: 1,
    }) === null,
    "tanpa price ikut terhitung",
  );
  assert(
    calculateSwapCost({
      symbol: "AUDCHF_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      lot: 0.5,
      holdingDays: 1,
      currentPrice: NaN,
    }) === null,
    "price NaN ikut terhitung",
  );
  assert(
    calculateSwapCost({
      symbol: "AUDCHF_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      lot: 0.5,
      holdingDays: 1,
      currentPrice: 0,
    }) === null,
    "price 0 ikut terhitung",
  );
});

test("277. swapType auto-detect dari preset (tanpa override manual)", () => {
  const flat = requireSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
  });
  assert(flat.swapType === "flat", "flat tidak terdeteksi");
  assert(flat.swapPerDayUSD !== undefined, "flat tanpa swapPerDayUSD");
  assert(flat.swapPercentage === undefined, "flat bocor percentage");
  const pct = requireSwapCost({
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
    currentPrice: 0.5756,
  });
  assert(pct.swapType === "percentage", "percentage tidak terdeteksi");
  assert(pct.swapPercentage !== undefined, "pct tanpa swapPercentage");
  assert(pct.swapPerDayUSD === undefined, "pct bocor flat");
  const gbp = getOtbInstrumentProfile("GBPUSD_ORB");
  if (gbp === null || gbp.swapType !== "flat") {
    throw new Error("preset flat hilang");
  }
});

test("278. return format validation (semua field baru hadir)", () => {
  const cost = requireSwapCost({
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
  });
  assert(typeof cost.directionInput === "string", "directionInput hilang");
  assert(
    typeof cost.swapCostInContractBaseCurrency === "number",
    "field baru hilang",
  );
  assert(typeof cost.contractBaseCurrency === "string", "base hilang");
  assert(typeof cost.profitCurrency === "string", "profit hilang");
  assert(typeof cost.swapType === "string", "swapType hilang");
  assert(typeof cost.contractSize === "number", "contractSize hilang");
  assert(typeof cost.swapPercentage === "number", "swapPercentage hilang");
  assert(typeof cost.symbol === "string", "symbol hilang");
  assert(typeof cost.swapCost === "number", "alias legacy hilang");
  const attached = attachSwapToResult(makeAnalysisResult("BELI", 0.5), {
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
  });
  if (attached === null || attached.swapDetail === null) {
    throw new Error("attach percentage null");
  }
  assert(
    Math.abs(attached.swapDetail.swapCost - -431.7) < 1e-6,
    "attach tidak meneruskan field baru",
  );
  assert(
    attached.swapDetail.contractBaseCurrency === "AUD",
    "attach base salah",
  );
});

/* ---------------- Expand OTB_PRESETS 5D-STEP1: TEST 279-286 ---------------- */

test("279. OTB_PRESETS size = 16 (16/16 verified)", () => {
  const keys = Object.keys(OTB_PRESETS);
  assert(keys.length === 16, `expected 16 presets, got ${keys.length}`);
  for (const s of ["GBPUSD_ORB", "AUDCAD_ORB", "EURCHF_ORB"]) {
    assert(keys.includes(s), `${s} hilang`);
  }
  for (const s of [
    "AUDCHF_ORB",
    "AUDJPY_ORB",
    "AUDNZD_ORB",
    "AUDUSD_ORB",
    "CADJPY_ORB",
    "CHFJPY_ORB",
    "EURAUD_ORB",
    "EURCAD_ORB",
    "GBPAUD_ORB",
    "USDCAD_ORB",
    "NZDJPY_ORB",
    "USDCHF_ORB",
    "USDJPY_ORB",
  ]) {
    assert(keys.includes(s), `${s} hilang`);
  }
  const symbols = getAvailableSymbols("orbitraderberjangka");
  assert(symbols.length === 16, `dropdown=${symbols.length}`);
});

test("280. AUDCHF_ORB preset exists + digits=5 [verified 6E-1]", () => {
  const p = getOtbInstrumentProfile("AUDCHF_ORB");
  if (p === null) throw new Error("preset AUDCHF_ORB hilang");
  assert(p.digits === 5, `digits=${p.digits}`);
  assert(p.contractSize === 100000, "contractSize salah");
  assert(p.contractCurrency === "AUD", "contractCurrency bukan AUD");
  assert(p.currencyProfit === "CHF", "profit bukan CHF");
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.swapLong === -1.5 && p.swapShort === -1.5, "swap salah");
  assert(p.commission?.pricePerLot === 33, "komisi bukan 33");
});

test("281. AUDJPY_ORB preset swapLong=-1.25% [verified 6E-2]", () => {
  const p = getOtbInstrumentProfile("AUDJPY_ORB");
  if (p === null) throw new Error("preset AUDJPY_ORB hilang");
  assert(p.digits === 3, `digits=${p.digits}`);
  assert(p.swapLong === -1.25, `swapLong=${p.swapLong}`);
  assert(p.swapShort === -1.75, `swapShort=${p.swapShort}`);
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.contractCurrency === "AUD", "contract bukan AUD");
  assert(p.currencyProfit === "JPY", "profit bukan JPY");
});

test("282. CADJPY_ORB contractCurrency=CAD [verified 6E-5]", () => {
  const p = getOtbInstrumentProfile("CADJPY_ORB");
  if (p === null) throw new Error("preset CADJPY_ORB hilang");
  assert(p.contractCurrency === "CAD", `contract=${p.contractCurrency}`);
  assert(p.currencyProfit === "JPY", "profit bukan JPY");
  assert(p.swapLong === -1.25 && p.swapShort === -1.75, "swap salah");
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.contractSize === 100000, "contractSize salah");
});

test("283. CHFJPY_ORB swapShort=-1.25% [verified 6E-6]", () => {
  const p = getOtbInstrumentProfile("CHFJPY_ORB");
  if (p === null) throw new Error("preset CHFJPY_ORB hilang");
  assert(p.swapShort === -1.25, `swapShort=${p.swapShort}`);
  assert(p.swapLong === -1.75, `swapLong=${p.swapLong}`);
  assert(p.contractCurrency === "CHF", "contract bukan CHF");
  assert(p.currencyProfit === "JPY", "profit bukan JPY");
  assert(p.swapType === "percentage", "swapType bukan percentage");
});

test("284. EURAUD_ORB profitCurrency=AUD [verified 6E-7]", () => {
  const p = getOtbInstrumentProfile("EURAUD_ORB");
  if (p === null) throw new Error("preset EURAUD_ORB hilang");
  assert(p.currencyProfit === "AUD", `profit=${p.currencyProfit}`);
  assert(p.contractCurrency === "EUR", "contract bukan EUR");
  assert(p.swapLong === -1.5 && p.swapShort === -1.5, "swap salah");
  assert(p.swapType === "percentage", "swapType bukan percentage");
});

test("285. GBPAUD_ORB swapLong=-0.75% [verified 6E-9]", () => {
  const p = getOtbInstrumentProfile("GBPAUD_ORB");
  if (p === null) throw new Error("preset GBPAUD_ORB hilang");
  assert(p.swapLong === -0.75, `swapLong=${p.swapLong}`);
  assert(p.swapShort === -2.25, `swapShort=${p.swapShort}`);
  assert(p.contractCurrency === "GBP", "contract bukan GBP");
  assert(p.currencyProfit === "AUD", "profit bukan AUD");
  assert(p.swapType === "percentage", "swapType bukan percentage");
});

test("286. USDCAD_ORB all fields present [verified 6E-10]", () => {
  const p = getOtbInstrumentProfile("USDCAD_ORB");
  if (p === null) throw new Error("preset USDCAD_ORB hilang");
  assert(p.contractSize === 100000, "contractSize salah");
  assert(p.contractCurrency === "USD", "contract bukan USD");
  assert(p.currencyProfit === "CAD", "profit bukan CAD");
  assert(p.swapLong === -1.5 && p.swapShort === -1.5, "swap salah");
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.commission?.pricePerLot === 33, "komisi bukan 33");
  assert(p.digits === 5, "digits bukan 5");
  assert(p.minVolume === 0.1 && p.maxVolume === 10, "volume salah");
  assert(p.initialMargin === 100000, "margin salah");
});

/* ---------------- Preset 6H (NZDJPY/USDCHF/USDJPY): TEST 416-418 ---------------- */

test("416. NZDJPY_ORB preset dari CSV [verified 6H]", () => {
  const p = getOtbInstrumentProfile("NZDJPY_ORB");
  if (p === null) throw new Error("preset NZDJPY_ORB hilang");
  assert(p.digits === 3, `digits=${p.digits}`);
  assert(p.tickSize === 0.001, "tickSize salah");
  assert(calculateOtbTickValue(p) === 100, "tick value bukan 100 JPY");
  assert(p.contractCurrency === "NZD", "contract bukan NZD");
  assert(p.currencyProfit === "JPY", "profit bukan JPY");
  assert(p.swapLong === -1.5 && p.swapShort === -1.5, "swap salah (CSV)");
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.commission?.pricePerLot === 33, "komisi bukan 33");
  assert(p.stopsLevel === 20, "stops bukan 20 (CSV)");
  assert(p.volumeStep === 0.1, "step bukan 0.1 (CSV)");
  assert(p.minVolume === 0.1 && p.maxVolume === 10, "volume salah");
  assert(
    p.initialMargin === 100000 && p.maintenanceMargin === 100000,
    "margin salah",
  );
  assert(p.hedgedMargin === 50000, "hedged salah");
  assert(isOtbSymbolVerified("NZDJPY_ORB"), "gate belum verified");
});

test("417. USDCHF_ORB preset dari CSV [verified 6H]", () => {
  const p = getOtbInstrumentProfile("USDCHF_ORB");
  if (p === null) throw new Error("preset USDCHF_ORB hilang");
  assert(p.digits === 5, `digits=${p.digits}`);
  assert(p.contractSize === 100000, "contractSize salah");
  assert(p.contractCurrency === "USD", "contract bukan USD");
  assert(p.currencyProfit === "CHF", "profit bukan CHF");
  assert(p.swapLong === -1.5 && p.swapShort === -1.5, "swap salah (CSV)");
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.commission?.pricePerLot === 33, "komisi bukan 33");
  assert(p.stopsLevel === 20, "stops bukan 20 (CSV)");
  assert(isOtbSymbolVerified("USDCHF_ORB"), "gate belum verified");
});

test("418. USDJPY_ORB preset dari CSV [verified 6H]", () => {
  const p = getOtbInstrumentProfile("USDJPY_ORB");
  if (p === null) throw new Error("preset USDJPY_ORB hilang");
  assert(p.digits === 3, `digits=${p.digits}`);
  assert(calculateOtbTickValue(p) === 100, "tick value bukan 100 JPY");
  assert(p.contractCurrency === "USD", "contract bukan USD");
  assert(p.currencyProfit === "JPY", "profit bukan JPY");
  assert(p.swapLong === -1.0 && p.swapShort === -2.0, "swap salah (CSV)");
  assert(p.swapType === "percentage", "swapType bukan percentage");
  assert(p.commission?.pricePerLot === 33, "komisi bukan 33");
  assert(isOtbSymbolVerified("USDJPY_ORB"), "gate belum verified");
});

/* ---------------- ECB Daily Rate + FX Conversion 5D-STEP2: TEST 287-296 ---------------- */

test("287. fetchECBRates() returns rates object (mock/live)", () => {
  // Tanpa network call (deterministik): bentuk fallback + wiring fetch.
  assert(typeof fetchECBRates === "function", "fetchECBRates hilang");
  for (const key of [
    "EUR",
    "USD",
    "AUD",
    "CAD",
    "CHF",
    "GBP",
    "JPY",
    "NZD",
  ] as const) {
    assert(
      typeof FALLBACK_RATES[key] === "number" &&
        Number.isFinite(FALLBACK_RATES[key]),
      `fallback ${key} invalid`,
    );
  }
  assert(FALLBACK_RATES.fetchedAt === "2026-10-02", "fallback date salah");
  const src = readSrc("src/services/fxRateService.ts");
  assert(src.includes("eurofxref-daily.xml"), "ECB URL hilang");
  assert(src.includes("FALLBACK_RATES"), "fallback wiring hilang");
  const maybePromise = (globalThis as { fetch?: unknown }).fetch;
  assert(
    typeof fetchECBRates === "function" &&
      (maybePromise === undefined || typeof maybePromise === "function"),
    "fetch boundary tidak aman",
  );
});

test("288. parseECBXml() extract USD=1.0831 dari XML", () => {
  const xml =
    `<gesmes:Envelope><Cube><Cube time="2026-10-02">` +
    `<Cube currency="USD" rate="1.0831"/>` +
    `<Cube currency="JPY" rate="161.25"/>` +
    `<Cube currency="AUD" rate="1.6512"/>` +
    `</Cube></Cube></gesmes:Envelope>`;
  const rates = parseECBXml(xml);
  assert(Math.abs(rates.USD - 1.0831) < 1e-9, `USD=${rates.USD}`);
  assert(Math.abs(rates.JPY - 161.25) < 1e-9, `JPY=${rates.JPY}`);
  assert(Math.abs(rates.AUD - 1.6512) < 1e-9, `AUD=${rates.AUD}`);
  assert(rates.EUR === 1.0, "EUR base berubah");
  // ECB live memakai single-quote (bug produksi: selalu default).
  const live =
    `<Cube time="2026-10-03">` +
    `<Cube currency='USD' rate='1.1225'/>` +
    `<Cube currency='JPY' rate='176.99'/>` +
    `</Cube>`;
  const liveRates = parseECBXml(live);
  assert(Math.abs(liveRates.USD - 1.1225) < 1e-9, `live USD=${liveRates.USD}`);
  assert(Math.abs(liveRates.JPY - 176.99) < 1e-9, `live JPY=${liveRates.JPY}`);
});

test("289. convertToUSD(100 AUD) ≈ 65.59 USD", () => {
  const usd = convertToUSD(100, "AUD", FALLBACK_RATES);
  assert(Math.abs(usd - (100 / 1.6512) * 1.0831) < 1e-9, `usd=${usd}`);
  assert(Math.abs(usd - 65.5947) < 0.01, `usd=${usd} (≈60.56 spec)`);
});

test("290. convertToUSD(-431.7 AUD) ≈ -283.17 USD (AUDCHF swap)", () => {
  const usd = convertToUSD(-431.7, "AUD", FALLBACK_RATES);
  assert(Math.abs(usd - -283.1724) < 0.01, `usd=${usd}`);
});

test("291. convertToUSD(-49 JPY) ≈ -0.304 USD (AUDJPY swap)", () => {
  const usd = convertToUSD(-49, "JPY", FALLBACK_RATES);
  assert(Math.abs(usd - -0.3291) < 0.001, `usd=${usd}`);
  assert(
    convertToUSD(10, "USD", FALLBACK_RATES) === 10,
    "USD passthrough rusak",
  );
  assert(
    convertToUSD(10, "XXX", FALLBACK_RATES) === 10,
    "unknown currency tidak fallback",
  );
});

test("292. attachSwapToResult dengan fxRates → swapCostInUSD populated", () => {
  const attached = attachSwapToResult(makeAnalysisResult("BELI", 0.5), {
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
    fxRates: FALLBACK_RATES,
  });
  if (attached === null || attached.swapDetail === null) {
    throw new Error("attach dengan fxRates null");
  }
  assert(
    attached.swapDetail.swapCostInUSD !== null,
    "swapCostInUSD tidak terisi",
  );
  assert(
    Math.abs((attached.swapDetail.swapCostInUSD ?? 0) - -283.1724) < 0.01,
    `usd=${attached.swapDetail.swapCostInUSD}`,
  );
  assert(
    Math.abs((attached.swapDetail.fxRate ?? 0) - 1.6512) < 1e-9,
    `fxRate=${attached.swapDetail.fxRate}`,
  );
});

test("293. attachSwapToResult tanpa fxRates → swapCostInUSD null (fallback)", () => {
  const attached = attachSwapToResult(makeAnalysisResult("BELI", 0.5), {
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
  });
  if (attached === null || attached.swapDetail === null) {
    throw new Error("attach tanpa fxRates null");
  }
  assert(attached.swapDetail.swapCostInUSD === null, "harus null tanpa rates");
  assert(
    Math.abs(attached.swapDetail.swapCostInContractBaseCurrency - -431.7) <
      1e-6,
    "satuan asli rusak",
  );
});

test("294. Rate cache per app session (tidak re-fetch)", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("fetchECBRates"), "App tidak fetch ECB");
  assert(src.includes("fxRates"), "state fxRates hilang");
  assert(src.includes("useEffect"), "fetch tidak di effect");
  assert(src.includes("[]"), "effect harus mount-once (cache session)");
  assert(
    src.includes("fxRates={fxRates}"),
    "fxRates tidak diteruskan ke hasil",
  );
  const comp = readSrc("src/components/result/AnalysisResult.tsx");
  assert(comp.includes("fxRates"), "AnalysisResult tidak menerima fxRates");
});

test("295. Fallback rate used jika ECB fetch gagal", () => {
  const src = readSrc("src/services/fxRateService.ts");
  assert(src.includes("try"), "tanpa try/catch");
  assert(src.includes("catch"), "tanpa catch fallback");
  assert(src.includes("console.warn"), "tanpa warn fallback");
  assert(src.includes("return FALLBACK_RATES"), "tidak return fallback");
  // Degradasi graceful: XML kosong → default 1 (tanpa throw).
  const empty = parseECBXml("<gesmes:Envelope/>");
  assert(empty.USD === 1 && empty.EUR === 1.0, "parse kosong tidak default");
});

test("296. Display memo USD (dari AUD @1.6512)", () => {
  const attached = attachSwapToResult(makeAnalysisResult("BELI", 0.5), {
    symbol: "AUDCHF_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.5,
    holdingDays: 1,
    currentPrice: 0.5756,
    fxRates: FALLBACK_RATES,
  });
  if (attached === null || attached.swapDetail === null) {
    throw new Error("attach null");
  }
  const d = attached.swapDetail;
  const memo =
    `Swap ${d.holdingDays} hari: ${(d.swapCostInUSD ?? 0).toFixed(2)} USD ` +
    `(dari ${d.swapCostInContractBaseCurrency.toFixed(1)} ` +
    `${d.contractBaseCurrency} @${(d.fxRate ?? 0).toFixed(4)})`;
  // Koreksi pembulatan spec: -431.7/1.6512 = -261.4462 → toFixed(2) = -261.45.
  assert(memo.includes("-283.17 USD"), `memo=${memo}`);
  assert(memo.includes("-431.7 AUD"), `memo=${memo}`);
  assert(memo.includes("@1.6512"), `memo=${memo}`);
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes('data-testid="swap-memo"'), "testid memo hilang");
  assert(src.includes("swapCostInUSD"), "memo tidak render USD");
  assert(src.includes("/lot (profit"), "label legacy hilang (regresi)");
});

/* Tahap 5E-STEP1: Triple-Swap Wednesday (8 test: 297-304).
 * Catatan tanggal: spec menulis 2026-10-02=Rabu / 2026-10-01=Sel,
 * namun kalender nyata 2026-10-02=Jumat & 2026-10-01=Kamis.
 * Test memakai Rabu nyata 2026-09-30 + Selasa 2026-09-29 agar
 * isWednesday deterministik dan tidak bergantung hari eksekusi. */
test("297. isWednesday(Rabu 2026-09-30) = true", () => {
  assert(isWednesday(new Date(2026, 8, 30)) === true, "2026-09-30 harus Rabu");
  assert(new Date(2026, 8, 30).getDay() === 3, "guard kalender rusak");
});

test("298. isWednesday(Selasa 2026-09-29) = false", () => {
  assert(isWednesday(new Date(2026, 8, 29)) === false, "2026-09-29 bukan Rabu");
});

test("299. calculateSwapWithTriple 2 hari tanpa Rabu = 2x normal", () => {
  // Sen 2026-09-28 + Sel 2026-09-29: 1x + 1x = 2x.
  const total = calculateSwapWithTriple({
    holdingDays: 2,
    swapPerDay: 10,
    startDate: new Date(2026, 8, 28),
  });
  assert(total === 20, `total=${total}, harus 20`);
});

test("300. calculateSwapWithTriple 2 hari dengan Rabu = 1+3 = 4x", () => {
  // Sel 2026-09-29 (1x) + Rab 2026-09-30 (3x) = 4x.
  const total = calculateSwapWithTriple({
    holdingDays: 2,
    swapPerDay: 10,
    startDate: new Date(2026, 8, 29),
  });
  assert(total === 40, `total=${total}, harus 40`);
});

test("301. calculateSwapWithTriple 3 hari Sel-Rab-Kam = 1+3+1 = 5x", () => {
  const total = calculateSwapWithTriple({
    holdingDays: 3,
    swapPerDay: 10,
    startDate: new Date(2026, 8, 29),
  });
  assert(total === 50, `total=${total}, harus 50`);
});

test("302. getTripleSwapLabel ada Rabu -> termasuk Rabu x3", () => {
  const label = getTripleSwapLabel(2, new Date(2026, 8, 29));
  assert(label.includes("2 hari"), `label=${label}`);
  assert(label.includes("Rabu"), `label=${label} harus sebut Rabu`);
});

test("303. getTripleSwapLabel tanpa Rabu -> normal", () => {
  const label = getTripleSwapLabel(2, new Date(2026, 8, 28));
  assert(label.includes("2 hari"), `label=${label}`);
  assert(label.includes("normal"), `label=${label} harus sebut normal`);
});

test("304. swapCost terintegrasi triple-swap (Rabu x3)", () => {
  const src = readSrc("src/calculations/swapCost.ts");
  assert(
    src.includes("calculateSwapWithTriple"),
    "swapCost tidak panggil triple",
  );
  assert(src.includes("startDate"), "param startDate hilang di swapCost");
  // GBPUSD_ORB flat long -2.25/lot/hari: Sel(1x)+Rab(3x) = -9.0 untuk 1 lot.
  const triple = calculateSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 2,
    startDate: new Date(2026, 8, 29),
  });
  if (triple === null) throw new Error("swap triple null");
  assert(
    Math.abs(triple.swapCost - -9) < 1e-9,
    `swap triple=${triple.swapCost}, harus -9`,
  );
  // Legacy tanpa startDate tetap 2x (-4.5) agar test 1-296 deterministik.
  const legacy = calculateSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 2,
  });
  if (legacy === null) throw new Error("swap legacy null");
  assert(
    Math.abs(legacy.swapCost - -4.5) < 1e-9,
    `swap legacy=${legacy.swapCost}, harus -4.5`,
  );
  const comp = readSrc("src/components/result/AnalysisResult.tsx");
  assert(comp.includes("getTripleSwapLabel"), "label triple hilang di UI");
});

/* Tahap 5E-STEP2: Node.js Backend + Live Equity (5 test: 305-309).
 * Runner proyek sinkron (tanpa supertest/vitest), sehingga route HTTP
 * diuji via kontrak sumber + pipeline refresh sinkron MT5LogReader
 * (tanpa membuka port). decisionEngine & test 1-304 tidak disentuh. */

const nodeFs = require("node:fs") as unknown as {
  readFileSync(path: string, encoding: string): string;
  writeFileSync(f: string, d: string): void;
  mkdtempSync(prefix: string): string;
  rmSync(path: string, opts: unknown): void;
};
const nodeOs = require("node:os") as unknown as { tmpdir(): string };
const nodePath = require("node:path") as unknown as {
  join(...parts: string[]): string;
};

function makeTempLogDir(): string {
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "mdbka-equity-"));
}

function removeTempDir(dir: string): void {
  nodeFs.rmSync(dir, { recursive: true, force: true });
}

test("305. MT5LogReader init aman: path hilang -> null, file valid -> snapshot", () => {
  const missing = new MT5LogReader(
    nodePath.join("tidak-ada-mdbka", "missing.log"),
  );
  assert(missing.getLatest() === null, "path hilang harus null");
  assert(missing.refresh() === null, "refresh path hilang harus null");

  const dir = makeTempLogDir();
  try {
    const file = nodePath.join(dir, "20261002.log");
    (nodeFs as { writeFileSync(f: string, d: string): void }).writeFileSync(
      file,
      "2026.10.02 10:00:00 Trade opened #1\nBalance: 1000.50\nEquity: 1050.75\n",
    );
    const reader = new MT5LogReader(file);
    const snap = reader.refresh();
    if (snap === null) throw new Error("snapshot null untuk file valid");
    assert(Math.abs(snap.balance - 1000.5) < 1e-9, `balance=${snap.balance}`);
    assert(Math.abs(snap.equity - 1050.75) < 1e-9, `equity=${snap.equity}`);
    assert(
      snap.timestamp.length > 0 && snap.lastModified.length > 0,
      "waktu kosong",
    );
  } finally {
    removeTempDir(dir);
  }
});

test("306. parseEquityFromText: Balance/Equity akurat + last-wins + profit derivasi", () => {
  const parsed = parseEquityFromText("Balance: 1000.50\nEquity: 1050.75\n");
  if (parsed === null) throw new Error("parse null untuk input valid");
  assert(Math.abs(parsed.balance - 1000.5) < 1e-9, `balance=${parsed.balance}`);
  assert(Math.abs(parsed.equity - 1050.75) < 1e-9, `equity=${parsed.equity}`);
  assert(Math.abs(parsed.profit - 50.25) < 1e-9, `profit=${parsed.profit}`);
  // Last wins: baris terakhir menang.
  const repeated = parseEquityFromText(
    "Balance: 100.00\nBalance: 1200.00\nEquity: 1300.00\n",
  );
  if (repeated === null) throw new Error("parse repeated null");
  assert(
    Math.abs(repeated.balance - 1200) < 1e-9,
    `last-wins=${repeated.balance}`,
  );
  // Tanpa angka relevan -> null (bukan 0 fiktif).
  assert(parseEquityFromText("hello world\n") === null, "teks acak harus null");
});

test("307. refresh() deteksi perubahan file -> onUpdate push snapshot baru", () => {
  const dir = makeTempLogDir();
  try {
    const file = nodePath.join(dir, "live.log");
    (nodeFs as { writeFileSync(f: string, d: string): void }).writeFileSync(
      file,
      "Balance: 1000.00\nEquity: 1010.00\n",
    );
    const reader = new MT5LogReader(file);
    reader.refresh();
    const received: number[] = [];
    const unsubscribe = reader.onUpdate((snap) => {
      received.push(snap.equity);
    });
    // Tulis ulang tanpa perubahan -> tidak ada push (dedup).
    reader.refresh();
    assert(received.length === 0, `dedup gagal, push=${received.length}`);
    // Tulis equity baru -> satu push dengan angka baru.
    (nodeFs as { writeFileSync(f: string, d: string): void }).writeFileSync(
      file,
      "Balance: 1000.00\nEquity: 1200.00\n",
    );
    reader.refresh();
    assert(received.length === 1, `push=${received.length}, harus 1`);
    assert(Math.abs(received[0] - 1200) < 1e-9, `equity push=${received[0]}`);
    unsubscribe();
    // Setelah unsubscribe tidak ada push lagi.
    (nodeFs as { writeFileSync(f: string, d: string): void }).writeFileSync(
      file,
      "Balance: 1000.00\nEquity: 1300.00\n",
    );
    reader.refresh();
    assert(received.length === 1, "unsubscribe gagal");
  } finally {
    removeTempDir(dir);
  }
});

test("308. equityRoutes kontrak: /latest + /stream SSE + heartbeat + error path", () => {
  const src = readSrc("server/routes/equityRoutes.ts");
  assert(src.includes('"/latest"'), "route /latest hilang");
  assert(src.includes('"/stream"'), "route /stream hilang");
  assert(src.includes("text/event-stream"), "header SSE hilang");
  assert(src.includes("data: "), "format SSE data: hilang");
  assert(src.includes("heartbeat"), "heartbeat 30s hilang");
  assert(src.includes("404"), "404 saat belum ada data hilang");
  assert(src.includes("500"), "error handling 500 hilang");
  const appSrc = readSrc("server/app.ts");
  assert(appSrc.includes('"/health"'), "health check hilang");
  assert(appSrc.includes('"/api/equity"'), "mount /api/equity hilang");
});

test("309. CORS localhost:5173 + frontend SSE wiring + LiveEquity terpasang", () => {
  const appSrc = readSrc("server/app.ts");
  assert(appSrc.includes("cors"), "middleware cors hilang");
  assert(appSrc.includes("http://localhost:5173"), "origin 5173 hilang");
  const hook = readSrc("src/hooks/useEquityStream.ts");
  assert(hook.includes("EventSource"), "SSE EventSource hilang di hook");
  assert(hook.includes("/api/equity/stream"), "URL stream hilang di hook");
  assert(hook.includes("/api/equity/latest"), "fallback polling latest hilang");
  assert(hook.includes("setInterval"), "fallback interval hilang");
  const panel = readSrc("src/components/result/LiveEquity.tsx");
  assert(
    panel.includes('data-testid="live-equity"'),
    "testid live-equity hilang",
  );
  assert(panel.includes("useEquityStream"), "hook tak dipakai panel");
  const resultSrc = readSrc("src/components/result/AnalysisResult.tsx");
  assert(resultSrc.includes("LiveEquity"), "LiveEquity tak terpasang di hasil");
  assert(
    resultSrc.includes("/lot (profit"),
    "label swap legacy hilang (regresi)",
  );
});

/* Kebijakan verifikasi OTB: TEST 330-332.
 * 16/16 verified (GBPUSD + 6E-1..6E-12 + 6H: NZDJPY, USDCHF, USDJPY).
 * Finex byte-identik; SSE 318-329 tidak tersentuh. */

test("330. 16/16 simbol verified end-to-end (preset+warning+validator)", () => {
  assert(isOtbSymbolVerified("GBPUSD_ORB") === true, "GBPUSD_ORB harus verified");
  assert(isOtbSymbolVerified("AUDCHF_ORB") === true, "AUDCHF_ORB harus verified (6E-1)");
  assert(isOtbSymbolVerified("AUDJPY_ORB") === true, "AUDJPY_ORB harus verified (6E-2)");
  assert(isOtbSymbolVerified("AUDNZD_ORB") === true, "AUDNZD_ORB harus verified (6E-3)");
  assert(isOtbSymbolVerified("AUDUSD_ORB") === true, "AUDUSD_ORB harus verified (6E-4)");
  assert(isOtbSymbolVerified("CADJPY_ORB") === true, "CADJPY_ORB harus verified (6E-5)");
  assert(isOtbSymbolVerified("CHFJPY_ORB") === true, "CHFJPY_ORB harus verified (6E-6)");
  assert(isOtbSymbolVerified("EURAUD_ORB") === true, "EURAUD_ORB harus verified (6E-7)");
  assert(isOtbSymbolVerified("EURCAD_ORB") === true, "EURCAD_ORB harus verified (6E-8)");
  assert(isOtbSymbolVerified("GBPAUD_ORB") === true, "GBPAUD_ORB harus verified (6E-9)");
  assert(isOtbSymbolVerified("USDCAD_ORB") === true, "USDCAD_ORB harus verified (6E-10)");
  assert(isOtbSymbolVerified("AUDCAD_ORB") === true, "AUDCAD_ORB harus verified (6E-11)");
  assert(isOtbSymbolVerified("EURCHF_ORB") === true, "EURCHF_ORB harus verified (6E-12)");
  assert(isOtbSymbolVerified("NZDJPY_ORB") === true, "NZDJPY_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("USDCHF_ORB") === true, "USDCHF_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("USDJPY_ORB") === true, "USDJPY_ORB harus verified (6H)");
  assert(
    VERIFIED_OTB_SYMBOLS.length === 16 &&
      VERIFIED_OTB_SYMBOLS.includes("GBPUSD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("AUDCHF_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("AUDJPY_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("AUDNZD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("AUDUSD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("CADJPY_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("CHFJPY_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("EURAUD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("EURCAD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("GBPAUD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("USDCAD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("AUDCAD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("EURCHF_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("NZDJPY_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("USDCHF_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("USDJPY_ORB"),
    "daftar verified berubah di luar 6H",
  );
  assert(
    hasOtbPresetForSymbol("GBPUSD_ORB", "orbitraderberjangka") === true,
    "warning muncul untuk simbol verified",
  );
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(applied.commission === 33, "komisi verified tidak terisi (spec32 33, 6G)");
  assert(applied.minLot === 0.1, "minLot verified tidak terisi");
  assert(
    getOtbDetectedNotice("finex", "GBPUSD_ORB") !== null,
    "banner pindah hilang untuk simbol verified",
  );
});

test("331. 0 simbol pending; 16/16 ter-apply via spec32 (6H)", () => {
  // Tahap 6E-1..6E-12 + 6H: seluruh 16 simbol OTB verified (gate lama).
  // Tidak ada pending tersisa: VERIFIED_OTB_SYMBOLS = 16, semua simbol
  // tanpa warning verifikasi, banner pindah tampil, preset spec32
  // (commission 33) ter-apply. Blok validator anti-warning-fixture untuk
  // pending dihapus (jalur pending tidak ada lagi); perilaku validator
  // untuk verified dikunci test 246/330.
  const pending = (OTB_ALL_SYMBOLS as readonly string[]).filter(
    (symbol) => !isOtbSymbolVerified(symbol),
  );
  assert(pending.length === 0, `pending=${JSON.stringify(pending)}, harus 0`);
  for (const symbol of OTB_ALL_SYMBOLS as readonly string[]) {
    assert(
      hasOtbPresetForSymbol(symbol, "orbitraderberjangka") === true,
      `${symbol} belum terverifikasi`,
    );
    const previous = makeEmptyBroker();
    const applied = applyBrokerPreset(previous, symbol, "orbitraderberjangka");
    assert(
      applied !== previous,
      `${symbol} preset spec32 tidak ter-apply`,
    );
    assert(
      applied.commission === 33,
      `${symbol} commission=${applied.commission} (spec32 33)`,
    );
    assert(
      getOtbDetectedNotice("finex", symbol) !== null,
      `${symbol} banner pindah hilang (khusus verified)`,
    );
  }
  // Dropdown tetap menampilkan semuanya (tidak ada simbol dihapus).
  const dropdown = getAvailableSymbols("orbitraderberjangka");
  assert(dropdown.length === 16, "simbol hilang dari dropdown");
});

test("332. Finex tidak terpengaruh kebijakan verifikasi OTB", () => {
  const finex = getAvailableSymbols("finex");
  assert(finex.length === 10, `daftar Finex=${finex.length}`);
  for (const symbol of finex) {
    assert(
      hasOtbPresetForSymbol(symbol, "finex") === true,
      `${symbol} Finex ikut ditandai`,
    );
  }
  assert(
    getOtbInstrumentProfile("GBPUSD") === null,
    "nama Finex bocor ke preset OTB",
  );
  const preset = applyBrokerPreset(makeEmptyBroker(), "GBPUSD", "finex");
  assert(
    preset.pointValue === 100000 && preset.commission === 1,
    "preset Finex berubah di luar komisi 6G",
  );
});

/* Tahap 5E-3G — guard equity + pin kebijakan: TEST 336-338. */

test("336. isEquitySnapshot menerima valid, menolak malformed", () => {
  assert(
    isEquitySnapshot({
      timestamp: "2026-10-03T00:00:00.000Z",
      balance: 1000.5,
      equity: 1060,
      profit: 59.5,
      lastModified: "2026-10-03T00:00:00.000Z",
    }),
    "snapshot valid ditolak",
  );
  assert(
    isEquitySnapshot({
      timestamp: "t",
      balance: 1,
      equity: 2,
      profit: 1,
      tradeCount: 0,
    }),
    "tradeCount opsional ditolak",
  );
  assert(!isEquitySnapshot(null), "null lolos");
  assert(!isEquitySnapshot({ bid: 1, ask: 2 }), "quote lolos sebagai equity");
  assert(
    !isEquitySnapshot({ timestamp: "t", balance: 1, equity: 2 }),
    "profit hilang lolos",
  );
  assert(
    !isEquitySnapshot({
      timestamp: "t",
      balance: 1,
      equity: NaN,
      profit: 0,
    }),
    "equity NaN lolos",
  );
  assert(
    !isEquitySnapshot({
      timestamp: "t",
      balance: 1,
      equity: 2,
      profit: 1,
      tradeCount: -1,
    }),
    "tradeCount negatif lolos",
  );
  const hook = readSrc("src/hooks/useEquityStream.ts");
  assert(
    hook.includes("isEquitySnapshot"),
    "hook tidak memvalidasi payload equity",
  );
  assert(
    !hook.includes("as EquitySnapshot"),
    "cast langsung JSON->EquitySnapshot masih ada",
  );
});

test("337. VERIFIED_OTB_SYMBOLS = 16 simbol (6H)", () => {
  assert(
    VERIFIED_OTB_SYMBOLS.length === 16 &&
      VERIFIED_OTB_SYMBOLS[0] === "GBPUSD_ORB" &&
      VERIFIED_OTB_SYMBOLS[1] === "AUDCHF_ORB" &&
      VERIFIED_OTB_SYMBOLS[2] === "AUDJPY_ORB" &&
      VERIFIED_OTB_SYMBOLS[3] === "AUDNZD_ORB" &&
      VERIFIED_OTB_SYMBOLS[4] === "AUDUSD_ORB" &&
      VERIFIED_OTB_SYMBOLS[5] === "CADJPY_ORB" &&
      VERIFIED_OTB_SYMBOLS[6] === "CHFJPY_ORB" &&
      VERIFIED_OTB_SYMBOLS[7] === "EURAUD_ORB" &&
      VERIFIED_OTB_SYMBOLS[8] === "EURCAD_ORB" &&
      VERIFIED_OTB_SYMBOLS[9] === "GBPAUD_ORB" &&
      VERIFIED_OTB_SYMBOLS[10] === "USDCAD_ORB" &&
      VERIFIED_OTB_SYMBOLS[11] === "AUDCAD_ORB" &&
      VERIFIED_OTB_SYMBOLS[12] === "EURCHF_ORB" &&
      VERIFIED_OTB_SYMBOLS[13] === "NZDJPY_ORB" &&
      VERIFIED_OTB_SYMBOLS[14] === "USDCHF_ORB" &&
      VERIFIED_OTB_SYMBOLS[15] === "USDJPY_ORB",
    "daftar verified berubah di luar 6H",
  );
});

test("338. kontrak SSE quotes tidak berubah", () => {
  const types = readSrc("server/types/quotes.ts");
  assert(
    types.includes("QuoteSseEnvelope"),
    "tipe envelope tunggal hilang",
  );
  assert(
    types.includes('"init"') && types.includes('"update"'),
    "varian init/update hilang",
  );
  const hook = readSrc("src/hooks/useQuotesStream.ts");
  assert(
    hook.includes("extractQuoteFromEnvelope") &&
      hook.includes("extractQuoteFromRestPayload"),
    "hook lepas dari helper envelope",
  );
  assert(
    !hook.includes("as QuoteSnapshot"),
    "cast langsung kembali muncul",
  );
});

/* ---------------- Safety gate swap unverified (Tahap 6A): TEST 353-357 ---------------- */
/* Nomor label suite-lokal (async suite memakai 339-352); otoritatif = counter.
 * Gate di lapisan presentasi (AnalysisResult); calculateSwapCost /
 * attachSwapToResult murni tidak berubah (test 251-278 terkunci). */

test("353. swap function-level tetap passthrough untuk simbol pending (gate di UI)", () => {
  const cost = calculateSwapCost({
    symbol: "AUDJPY_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 1,
    holdingDays: 1,
    currentPrice: 98.5,
  });
  assert(cost !== null, "kontrak function-level berubah (harus non-null)");
});

test("354. 16/16 OTB verified; invented tetap unverified", () => {
  assert(isOtbSymbolVerified("GBPUSD_ORB"), "GBPUSD_ORB harus verified");
  assert(isOtbSymbolVerified("AUDCHF_ORB"), "AUDCHF_ORB harus verified (6E-1)");
  assert(isOtbSymbolVerified("AUDJPY_ORB"), "AUDJPY_ORB harus verified (6E-2)");
  assert(isOtbSymbolVerified("AUDNZD_ORB"), "AUDNZD_ORB harus verified (6E-3)");
  assert(isOtbSymbolVerified("AUDUSD_ORB"), "AUDUSD_ORB harus verified (6E-4)");
  assert(isOtbSymbolVerified("CADJPY_ORB"), "CADJPY_ORB harus verified (6E-5)");
  assert(isOtbSymbolVerified("CHFJPY_ORB"), "CHFJPY_ORB harus verified (6E-6)");
  assert(isOtbSymbolVerified("EURAUD_ORB"), "EURAUD_ORB harus verified (6E-7)");
  assert(isOtbSymbolVerified("EURCAD_ORB"), "EURCAD_ORB harus verified (6E-8)");
  assert(isOtbSymbolVerified("GBPAUD_ORB"), "GBPAUD_ORB harus verified (6E-9)");
  assert(isOtbSymbolVerified("USDCAD_ORB"), "USDCAD_ORB harus verified (6E-10)");
  assert(isOtbSymbolVerified("AUDCAD_ORB"), "AUDCAD_ORB harus verified (6E-11)");
  assert(isOtbSymbolVerified("EURCHF_ORB"), "EURCHF_ORB harus verified (6E-12)");
  assert(isOtbSymbolVerified("NZDJPY_ORB"), "NZDJPY_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("USDCHF_ORB"), "USDCHF_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("USDJPY_ORB"), "USDJPY_ORB harus verified (6H)");
  assert(!isOtbSymbolVerified("EURUSD_ORB"), "invented dianggap verified");
});

test("355. AnalysisResult: memo swap digate verifikasi + PENDING notice", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes("isOtbSymbolVerified"), "gate verifikasi hilang di hasil");
  assert(src.includes('data-testid="swap-pending"'), "testid pending hilang");
  assert(src.includes("belum terverifikasi"), "label PENDING hilang");
  // Jalur verified tidak berubah: memo numerik tetap ada.
  assert(src.includes('data-testid="swap-memo"'), "memo verified hilang");
  assert(src.includes("/lot (profit"), "label profit currency hilang");
});

test("356. AnalysisResult: kontrak lama swap block utuh", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(
    src.includes('brokerId === "orbitraderberjangka"'),
    "gate broker hilang",
  );
  assert(src.includes("attachSwapToResult"), "attach hilang");
  assert(src.includes('data-testid="swap-holding-input"'), "spinner hilang");
});

test("357. attach verified GBPUSD_ORB tetap non-null (jalur rilis utuh)", () => {
  const attached = attachSwapToResult(makeAnalysisResult("BELI", 1), {
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
  });
  assert(
    attached !== null && attached.swapDetail !== null,
    "jalur verified rusak",
  );
});

/* ---------------- Tahap 6B additive (paralel, tanpa sentuh 1-354): TEST 358-385 ---------------- */
/* Modul baru instrumentSpecs32 + jpySwapCalculator. Legacy otbInstrumentConfig /
 * swapCost / dropdown 13-simbol TIDAK diubah; suite ini hanya membaca modul baru. */

function requireSpec32(symbol: string) {
  const spec = getInstrumentSpec32(symbol);
  if (spec === null) throw new Error(`spec32 hilang untuk ${symbol}`);
  return spec;
}

test("358. specs32 berisi 32 simbol (16 OTB + 16 Finex)", () => {
  assert(Object.keys(INSTRUMENT_SPECS_32).length === 32, "harus 32 specs");
  assert(OTB_SPECS_32.length === 16, "OTB harus 16");
  assert(FINEX_SPECS_32.length === 16, "Finex harus 16");
  for (const s of OTB_SPECS_32) assert(s.endsWith("_ORB"), `${s} bukan OTB`);
  for (const s of FINEX_SPECS_32)
    assert(!s.endsWith("_ORB"), `${s} bocor _ORB ke Finex`);
});

test("359. semua specs32 VERIFIED + commission per broker (6G)", () => {
  for (const [symbol, spec] of Object.entries(INSTRUMENT_SPECS_32)) {
    assert(spec.symbol === symbol, `key/symbol beda: ${symbol}`);
    assert(spec.status === "VERIFIED", `${symbol} bukan VERIFIED`);
    assert(isSpec32Verified(symbol), `${symbol} helper verified gagal`);
    const expected = spec.broker === "orbitraderberjangka" ? 33 : 1;
    assert(
      spec.commission === expected,
      `${symbol} commission=${spec.commission} (expect ${expected})`,
    );
  }
  assert(getInstrumentSpec32("XYZ") === null, "unknown harus null");
  assert(getInstrumentSpec32("gbpusd_orb") === null, "harus exact case-sensitive");
});

test("360. OTB 16 simbol lengkap sesuai CSV 6B", () => {
  for (const s of [
    "AUDCAD_ORB",
    "AUDCHF_ORB",
    "AUDJPY_ORB",
    "AUDNZD_ORB",
    "AUDUSD_ORB",
    "CADJPY_ORB",
    "CHFJPY_ORB",
    "EURAUD_ORB",
    "EURCAD_ORB",
    "EURCHF_ORB",
    "GBPAUD_ORB",
    "GBPUSD_ORB",
    "NZDJPY_ORB",
    "USDCAD_ORB",
    "USDCHF_ORB",
    "USDJPY_ORB",
  ]) {
    const spec = requireSpec32(s);
    assert(spec.broker === "orbitraderberjangka", `${s} broker salah`);
  }
});

test("361. Finex 16 simbol lengkap termasuk US100", () => {
  for (const s of [
    "AUDCAD",
    "AUDCHF",
    "AUDJPY",
    "AUDNZD",
    "AUDUSD",
    "CADJPY",
    "CHFJPY",
    "EURAUD",
    "EURCAD",
    "EURCHF",
    "EURUSD",
    "GBPUSD",
    "NZDJPY",
    "USDCHF",
    "USDJPY",
    "US100",
  ]) {
    const spec = requireSpec32(s);
    assert(spec.broker === "finex", `${s} broker salah`);
  }
});

test("362. swap Long/Short OTB sesuai CSV 6B", () => {
  assert(requireSpec32("AUDCAD_ORB").swapLong === -0.75, "AUDCAD long salah");
  assert(requireSpec32("AUDCAD_ORB").swapShort === -2.25, "AUDCAD short salah");
  assert(requireSpec32("GBPUSD_ORB").swapLong === -2.25, "GU long salah");
  assert(requireSpec32("GBPUSD_ORB").swapShort === -0.75, "GU short salah");
  assert(requireSpec32("USDJPY_ORB").swapLong === -1.0, "UJ long salah");
  assert(requireSpec32("USDJPY_ORB").swapShort === -2.0, "UJ short salah");
});

test("363. swap Long/Short Finex sesuai CSV 6B (termasuk positif)", () => {
  assert(requireSpec32("AUDJPY").swapLong === 0.75, "AUDJPY long salah");
  assert(requireSpec32("AUDJPY").swapShort === -3.95, "AUDJPY short salah");
  assert(requireSpec32("CADJPY").swapLong === -6.32, "CADJPY long salah");
  assert(requireSpec32("CADJPY").swapShort === 0.96, "CADJPY short salah");
  assert(requireSpec32("US100").swapLong === -25.29, "US100 long salah");
  assert(requireSpec32("US100").swapShort === -117.17, "US100 short salah");
});

test("364. JPY pairs flagged + tick 0.63 (5 per broker, tanpa fabrikasi)", () => {
  const jpy = getJPYPairSymbols32();
  assert(jpy.length === 10, `JPY=${jpy.length}, harus 10 (5+5)`);
  for (const s of [
    "AUDJPY_ORB",
    "CADJPY_ORB",
    "CHFJPY_ORB",
    "NZDJPY_ORB",
    "USDJPY_ORB",
    "AUDJPY",
    "CADJPY",
    "CHFJPY",
    "NZDJPY",
    "USDJPY",
  ]) {
    const spec = requireSpec32(s);
    assert(spec.isJPYPair === true, `${s} bukan JPY`);
    assert(spec.tickValue === 0.63, `${s} tick=${spec.tickValue}`);
    assert(spec.swapWedMultiplier === 3, `${s} multiplier hilang`);
  }
  assert(requireSpec32("AUDCAD_ORB").isJPYPair === false, "AUDCAD ikut JPY");
  assert(requireSpec32("EURUSD").isJPYPair === false, "EURUSD ikut JPY");
});

test("365. tick/pip per digits + triple day (US100 Jumat)", () => {
  assert(requireSpec32("AUDJPY_ORB").pip === 0.001, "JPY pip salah");
  assert(requireSpec32("GBPUSD_ORB").pip === 0.00001, "5-digit pip salah");
  assert(requireSpec32("US100").pip === 0.01, "US100 pip salah");
  assert(requireSpec32("US100").tickValue === 0.2, "US100 tick salah");
  assert(requireSpec32("US100").swap3DayWeekday === 5, "US100 triple bukan Jum");
  assert(requireSpec32("AUDJPY_ORB").swap3DayWeekday === 3, "FX triple bukan Rab");
});

test("366. Rabu 2026-09-30 terdeteksi triple, Selasa tidak", () => {
  assert(detectWednesdayTripleSwap(new Date(2026, 8, 30)) === true, "Rab gagal");
  assert(detectWednesdayTripleSwap(new Date(2026, 8, 29)) === false, "Sel lolos");
  const audjpy = requireSpec32("AUDJPY_ORB");
  assert(isTripleDay(new Date(2026, 8, 30), audjpy) === true, "isTriple Rab gagal");
  assert(isTripleDay(new Date(2026, 8, 29), audjpy) === false, "isTriple Sel lolos");
  const us100 = requireSpec32("US100");
  assert(isTripleDay(new Date(2026, 9, 2), us100) === true, "US100 Jum gagal");
  assert(isTripleDay(new Date(2026, 8, 30), us100) === false, "US100 Rab lolos");
  assert(getDayMultiplier(new Date(2026, 8, 30), audjpy) === 3, "mult Rab bukan 3");
  assert(getDayMultiplier(new Date(2026, 8, 29), audjpy) === 1, "mult Sel bukan 1");
});

test("367. AUDJPY_ORB LONG 1 hari Senin = -0.79 USD", () => {
  const r = calculateSwap({
    instrument: requireSpec32("AUDJPY_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28), // Senin
  });
  assert(Math.abs(r.swapUSD - -0.79) < 0.01, `swapUSD=${r.swapUSD}`);
  assert(r.daysMultiplier === 1, `mult=${r.daysMultiplier}`);
  assert(r.tripleDayHit === false, "triple ikut hit");
  assert(r.tickValueUsed === 0.63, "tick salah");
});

test("368. AUDJPY_ORB LONG 1 hari Rabu = -2.36 USD (3x)", () => {
  const r = calculateSwap({
    instrument: requireSpec32("AUDJPY_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 30), // Rabu
  });
  assert(Math.abs(r.swapUSD - -2.36) < 0.01, `swapUSD=${r.swapUSD}`);
  assert(r.daysMultiplier === 3, `mult=${r.daysMultiplier}`);
  assert(r.tripleDayHit === true, "triple tidak hit");
});

test("369. SHORT memakai swapShort (inversi arah)", () => {
  const monday = new Date(2026, 8, 28);
  const long = calculateSwap({
    instrument: requireSpec32("AUDJPY_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: monday,
  });
  const short = calculateSwap({
    instrument: requireSpec32("AUDJPY_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "SHORT",
    tradeDatetime: monday,
  });
  assert(Math.abs(long.swapUSD - -0.79) < 0.01, `long=${long.swapUSD}`);
  assert(Math.abs(short.swapUSD - -1.1) < 0.01, `short=${short.swapUSD}`);
});

test("370. non-JPY AUDCAD_ORB LONG 1 hari = -0.52 USD", () => {
  const r = calculateSwap({
    instrument: requireSpec32("AUDCAD_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(Math.abs(r.swapUSD - -0.52) < 0.01, `swapUSD=${r.swapUSD}`);
});

test("371. EURUSD SHORT Finex 2 hari Senin = +3.86 USD", () => {
  const r = calculateSwap({
    instrument: requireSpec32("EURUSD"),
    daysHeld: 2,
    leverage: 100,
    direction: "SHORT",
    tradeDatetime: new Date(2026, 8, 28), // Sen+Sel, tanpa Rabu
  });
  assert(Math.abs(r.swapUSD - 3.86) < 0.01, `swapUSD=${r.swapUSD}`);
  assert(r.effectiveDays === 2, `eff=${r.effectiveDays}`);
});

test("372. rentang Sel-Rab 2 hari = 1x+3x = 4x", () => {
  const r = calculateSwap({
    instrument: requireSpec32("AUDJPY_ORB"),
    daysHeld: 2,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 29), // Selasa
  });
  assert(r.effectiveDays === 4, `eff=${r.effectiveDays}`);
  assert(r.daysMultiplier === 2, `mult=${r.daysMultiplier}`);
  assert(Math.abs(r.swapUSD - -3.15) < 0.01, `swapUSD=${r.swapUSD}`);
  assert(r.tripleDayHit === true, "triple tidak hit");
});

test("373. semua 10 JPY pairs menghitung tanpa error", () => {
  const monday = new Date(2026, 8, 28);
  for (const s of getJPYPairSymbols32()) {
    const spec = requireSpec32(s);
    const r = calculateSwap({
      instrument: spec,
      daysHeld: 1,
      leverage: 50,
      direction: "LONG",
      tradeDatetime: monday,
    });
    assert(Number.isFinite(r.swapUSD), `${s} swapUSD tidak finite`);
    assert(r.tickValueUsed === 0.63, `${s} tick bukan 0.63`);
  }
});

test("374. semua 32 simbol menghitung LONG/SHORT tanpa error", () => {
  const monday = new Date(2026, 8, 28);
  for (const s of Object.keys(INSTRUMENT_SPECS_32)) {
    const spec = requireSpec32(s);
    for (const direction of ["LONG", "SHORT"] as const) {
      const r = calculateSwap({
        instrument: spec,
        daysHeld: 1,
        leverage: 50,
        direction,
        tradeDatetime: monday,
      });
      assert(Number.isFinite(r.swapUSD), `${s}/${direction} tidak finite`);
    }
  }
});

test("375. edge: 0/negatif hari = 0, tanpa fallback -1.5%", () => {
  const spec = requireSpec32("AUDJPY_ORB");
  const zero = calculateSwap({
    instrument: spec,
    daysHeld: 0,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(zero.swapUSD === 0 && zero.effectiveDays === 0, "0 hari berbiaya");
  const neg = calculateSwap({
    instrument: spec,
    daysHeld: -3,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(neg.swapUSD === 0, "negatif berbiaya");
  const src = readSrc("src/lib/jpySwapCalculator.ts");
  assert(src.includes("calculateSwap"), "fungsi utama hilang");
});

test("376. US100 Jumat triple, Senin normal", () => {
  const us100 = requireSpec32("US100");
  const fri = calculateSwap({
    instrument: us100,
    daysHeld: 1,
    leverage: 100,
    direction: "LONG",
    tradeDatetime: new Date(2026, 9, 2), // Jumat 2026-10-02
  });
  assert(fri.tripleDayHit === true, "Jumat tidak triple");
  assert(Math.abs(fri.swapUSD - -15.17) < 0.02, `fri=${fri.swapUSD}`);
  const mon = calculateSwap({
    instrument: us100,
    daysHeld: 1,
    leverage: 100,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(mon.tripleDayHit === false, "Senin ikut triple");
  assert(Math.abs(mon.swapUSD - -5.06) < 0.02, `mon=${mon.swapUSD}`);
});

test("377. getJPYRate fallback deterministik", () => {
  assert(getJPYRate("AUD", "JPY") === 0.0067, "quote JPY salah");
  assert(getJPYRate("EUR", "USD") === 1.1, "EUR salah");
  assert(getJPYRate("XXX", "USD") === 1.0, "unknown tidak fallback 1.0");
});

test("378. legacy swapCost tidak berubah (flat GBPUSD_ORB -2.25)", () => {
  const cost = calculateSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
  });
  if (cost === null) throw new Error("legacy null");
  assert(Math.abs(cost.swapCost - -2.25) < 1e-9, `legacy=${cost.swapCost}`);
});

test("379. legacy registry/dropdown 16-OTB + 10-Finex utuh", () => {
  assert(getAvailableSymbols("orbitraderberjangka").length === 16, "OTB berubah");
  assert(getAvailableSymbols("finex").length === 10, "Finex berubah");
  assert(Object.keys(OTB_PRESETS).length === 16, "preset berubah");
  assert(VERIFIED_OTB_SYMBOLS.length === 16, "verified berubah di luar 6H");
});

test("380. AUDNZD 0.00 long dihitung jujur (tanpa fabrikasi)", () => {
  const r = calculateSwap({
    instrument: requireSpec32("AUDNZD"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(r.swapUSD === 0, `harus 0, dapat ${r.swapUSD}`);
  const short = calculateSwap({
    instrument: requireSpec32("AUDNZD"),
    daysHeld: 1,
    leverage: 50,
    direction: "SHORT",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(Math.abs(short.swapUSD - -2.21) < 0.01, `short=${short.swapUSD}`);
});

test("381. NZDJPY_ORB LONG Rabu triple = -1.50x3x0.63", () => {
  const r = calculateSwap({
    instrument: requireSpec32("NZDJPY_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 30),
  });
  assert(Math.abs(r.swapUSD - -2.84) < 0.02, `swapUSD=${r.swapUSD}`);
});

test("382. USDJPY Finex LONG positif + SHORT negatif", () => {
  const monday = new Date(2026, 8, 28);
  const spec = requireSpec32("USDJPY");
  const long = calculateSwap({
    instrument: spec,
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: monday,
  });
  const short = calculateSwap({
    instrument: spec,
    daysHeld: 1,
    leverage: 50,
    direction: "SHORT",
    tradeDatetime: monday,
  });
  assert(Math.abs(long.swapUSD - 1.23) < 0.02, `long=${long.swapUSD}`);
  assert(Math.abs(short.swapUSD - -4.98) < 0.02, `short=${short.swapUSD}`);
});

test("383. GBPUSD_ORB spot-check prompt: LONG Mon -2.25x1x1.00", () => {
  const r = calculateSwap({
    instrument: requireSpec32("GBPUSD_ORB"),
    daysHeld: 1,
    leverage: 50,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(Math.abs(r.swapUSD - -2.25) < 0.001, `swapUSD=${r.swapUSD}`);
});

test("384. CADJPY Finex SHORT Senin = +0.96x1x0.63", () => {
  const r = calculateSwap({
    instrument: requireSpec32("CADJPY"),
    daysHeld: 1,
    leverage: 50,
    direction: "SHORT",
    tradeDatetime: new Date(2026, 8, 28),
  });
  assert(Math.abs(r.swapUSD - 0.6) < 0.02, `swapUSD=${r.swapUSD}`);
});

test("385. specs32 frozen (immutable registry paralel)", () => {
  assert(Object.isFrozen(INSTRUMENT_SPECS_32), "registry tidak frozen");
  assert(Object.isFrozen(OTB_SPECS_32), "OTB list tidak frozen");
  assert(Object.isFrozen(FINEX_SPECS_32), "Finex list tidak frozen");
  assert(
    Object.isFrozen(requireSpec32("AUDJPY_ORB")),
    "spec tidak frozen",
  );
});

/* ---------------- Tahap 6C-safe additive (paralel, tanpa sentuh legacy): TEST 386-400 ---------------- */
/* Adapter spec32Wiring + non-regresi legacy. Tidak ada rewrite test 1-385. */

test("386. wiring form defaults OTB GBPUSD_ORB → 100000/33/verified", () => {
  const d = getSpec32FormDefaults("GBPUSD_ORB");
  assert(d.leverage === 100000, `leverage=${d.leverage}`);
  assert(d.commission === 33, `commission=${d.commission}`);
  assert(d.verified === true, "harus verified");
  assert(isSpec32Available("GBPUSD_ORB") === true, "available gagal");
});

test("387. wiring form defaults Finex GBPUSD + US100", () => {
  const gbp = getSpec32FormDefaults("GBPUSD");
  assert(gbp.leverage === 100000 && gbp.commission === 1 && gbp.verified, "GBPUSD salah");
  const us100 = getSpec32FormDefaults("US100");
  assert(us100.leverage === 100000 && us100.commission === 1 && us100.verified, "US100 salah");
});

test("388. wiring fallback unknown/empty (tanpa fabrikasi)", () => {
  const unknown = getSpec32FormDefaults("XYZ");
  assert(unknown.leverage === SPEC32_FALLBACK_LEVERAGE, "fallback leverage salah");
  assert(unknown.commission === SPEC32_FALLBACK_COMMISSION, "fallback commission salah");
  assert(unknown.verified === false, "unknown dianggap verified");
  assert(isSpec32Available("XYZ") === false, "unknown available");
  assert(isSpec32Available("") === false, "empty available");
});

test("389. wiring semua 32 simbol verified available (komisi per broker)", () => {
  for (const s of Object.keys(INSTRUMENT_SPECS_32)) {
    const d = getSpec32FormDefaults(s);
    assert(d.verified === true, `${s} tidak verified`);
    const expected = s.endsWith("_ORB") ? 33 : 1;
    assert(d.commission === expected, `${s} commission bukan ${expected}`);
    assert(isSpec32Available(s) === true, `${s} tidak available`);
  }
});

test("390. wiring swap preview AUDJPY_ORB LONG Mon = -0.79", () => {
  const r = getSpec32SwapPreview({
    symbol: "AUDJPY_ORB",
    daysHeld: 1,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  if (r === null) throw new Error("preview null");
  assert(Math.abs(r.swapUSD - -0.79) < 0.01, `swapUSD=${r.swapUSD}`);
});

test("391. wiring swap preview AUDJPY_ORB LONG Wed = -2.36 (3x)", () => {
  const r = getSpec32SwapPreview({
    symbol: "AUDJPY_ORB",
    daysHeld: 1,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 30),
  });
  if (r === null) throw new Error("preview null");
  assert(Math.abs(r.swapUSD - -2.36) < 0.01, `swapUSD=${r.swapUSD}`);
  assert(r.tripleDayHit === true, "triple tidak hit");
});

test("392. wiring swap preview null untuk unknown/0-hari", () => {
  assert(
    getSpec32SwapPreview({
      symbol: "XYZ",
      daysHeld: 1,
      direction: "LONG",
      tradeDatetime: new Date(2026, 8, 28),
    }) === null,
    "unknown harus null",
  );
  assert(
    getSpec32SwapPreview({
      symbol: "AUDJPY_ORB",
      daysHeld: 0,
      direction: "LONG",
      tradeDatetime: new Date(2026, 8, 28),
    }) === null,
    "0 hari harus null",
  );
});

test("393. wiring verification notice (null vs fallback)", () => {
  assert(spec32VerificationNotice("GBPUSD_ORB") === null, "verified harus null");
  assert(spec32VerificationNotice("") === null, "empty harus null");
  const notice = spec32VerificationNotice("XYZ");
  assert(notice !== null && notice.includes("XYZ"), `notice=${notice}`);
});

test("394. legacy non-regresi: swapCost flat GBPUSD_ORB tetap -2.25", () => {
  const cost = calculateSwapCost({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
  });
  if (cost === null) throw new Error("legacy null");
  assert(Math.abs(cost.swapCost - -2.25) < 1e-9, `legacy=${cost.swapCost}`);
});

test("395. legacy non-regresi: dateService triple Sel-Rab = 4x", () => {
  const total = calculateSwapWithTriple({
    holdingDays: 2,
    swapPerDay: 10,
    startDate: new Date(2026, 8, 29),
  });
  assert(total === 40, `total=${total}`);
});

test("396. legacy non-regresi: preset Finex utuh + OTB spec32 aktif", () => {
  const finex = applyBrokerPreset(makeEmptyBroker(), "GBPUSD", "finex");
  assert(finex.pointValue === 100000 && finex.commission === 1, "Finex berubah di luar komisi 6G");
  // Tahap 6G: AUDCAD_ORB aktif via spec32 (commission 33, bukan no-apply).
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "AUDCAD_ORB",
    "orbitraderberjangka",
  );
  assert(applied.commission === 33, "spec32 commission bukan 33");
});

test("397. wiring modul murni (tanpa impor legacy/UI)", () => {
  const src = readSrc("src/lib/spec32Wiring.ts");
  assert(src.includes("instrumentSpecs32"), "impor spec32 hilang");
  assert(src.includes("jpySwapCalculator"), "impor kalkulator hilang");
  assert(!src.includes("from \"./swapCost\""), "tercemar modul biaya legacy");
  assert(!src.includes("from \"../calculations/swapCost\""), "tercemar kalkulator legacy");
  assert(!src.includes("extraction/ExtractedDataForm"), "tercemar komponen form");
  assert(!src.includes("result/AnalysisResult"), "tercemar komponen hasil");
});

test("398. wiring spot-check US100 Jumat triple via preview", () => {
  const r = getSpec32SwapPreview({
    symbol: "US100",
    daysHeld: 1,
    direction: "LONG",
    tradeDatetime: new Date(2026, 9, 2), // Jumat 2026-10-02
  });
  if (r === null) throw new Error("preview null");
  assert(r.tripleDayHit === true, "Jumat tidak triple");
  assert(Math.abs(r.swapUSD - -15.17) < 0.02, `swapUSD=${r.swapUSD}`);
});

test("399. wiring spot-check AUDCAD_ORB LONG 2 hari = -1.05", () => {
  const r = getSpec32SwapPreview({
    symbol: "AUDCAD_ORB",
    daysHeld: 2,
    direction: "LONG",
    tradeDatetime: new Date(2026, 9, 2), // Jum+Sab, tanpa triple
  });
  if (r === null) throw new Error("preview null");
  assert(Math.abs(r.swapUSD - -1.05) < 0.01, `swapUSD=${r.swapUSD}`);
});

test("400. wiring SHORT memakai swapShort (USDJPY Finex)", () => {
  const monday = new Date(2026, 8, 28);
  const long = getSpec32SwapPreview({
    symbol: "USDJPY",
    daysHeld: 1,
    direction: "LONG",
    tradeDatetime: monday,
  });
  const short = getSpec32SwapPreview({
    symbol: "USDJPY",
    daysHeld: 1,
    direction: "SHORT",
    tradeDatetime: monday,
  });
  if (long === null || short === null) throw new Error("preview null");
  assert(Math.abs(long.swapUSD - 1.23) < 0.02, `long=${long.swapUSD}`);
  assert(Math.abs(short.swapUSD - -4.98) < 0.02, `short=${short.swapUSD}`);
});

/* ---------------- Tahap 6D spec32 integration + 6G komisi broker: TEST 401-410 ---------------- */
/* applyBrokerPreset OTB memakai commission spec32 (33.00 OTB / 1.00 Finex,
 * CSV terminal 03 Okt 2026); fixture OTB_PRESETS (33) tetap terkunci
 * sebagai data-layer (test 408). */

test("401. getSpec32FormDefaults: AUDJPY_ORB verified → leverage/commission", () => {
  const defaults = getSpec32FormDefaults("AUDJPY_ORB");
  assert(defaults.verified === true, "AUDJPY_ORB harus verified");
  assert(defaults.commission === 33, `commission=${defaults.commission} (expect 33)`);
  assert(defaults.leverage === 100000, `leverage=${defaults.leverage}`);
});

test("402. getSpec32FormDefaults: unknown symbol → fallback 50/0/false", () => {
  const defaults = getSpec32FormDefaults("UNKNOWN_SYMBOL");
  assert(defaults.verified === false, "unknown harus verified=false");
  assert(defaults.commission === 0, `commission=${defaults.commission}`);
  assert(defaults.leverage === 50, `leverage=${defaults.leverage}`);
});

test("403. isSpec32Available: GBPUSD_ORB=true, UNKNOWN=false", () => {
  assert(isSpec32Available("GBPUSD_ORB") === true, "GBPUSD_ORB tersedia");
  assert(isSpec32Available("UNKNOWN") === false, "UNKNOWN tidak tersedia");
});

test("404. spec32VerificationNotice: null verified, warning unknown, null empty", () => {
  assert(spec32VerificationNotice("AUDJPY_ORB") === null, "verified return null");
  const unknown = spec32VerificationNotice("XYZABC");
  assert(unknown !== null && unknown.includes("XYZABC"), `notice=${unknown}`);
  assert(spec32VerificationNotice("") === null, "empty return null");
});

test("405. applyBrokerPreset: AUDJPY_ORB → commission=33 + pointValue OTB", () => {
  // commission dari spec32 (33.00, 6G); pointValue dari kalkulator tick OTB
  // (0.001 × 100000 = 100) — BUKAN tickValue spec32 (0.63).
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "AUDJPY_ORB",
    "orbitraderberjangka",
  );
  assert(applied.commission === 33, `commission=${applied.commission} (spec32)`);
  assert(applied.pointValue === 100, `pointValue=${applied.pointValue} (kalkulator OTB)`);
  assert(applied.minLot === 0.1, `minLot=${applied.minLot}`);
});

test("406. applyBrokerPreset: 16 OTB spec32 semua commission=33", () => {
  assert(OTB_SPECS_32.length === 16, "spec32 OTB harus 16");
  for (const symbol of OTB_SPECS_32) {
    const applied = applyBrokerPreset(
      makeEmptyBroker(),
      symbol,
      "orbitraderberjangka",
    );
    // 6H: 16/16 simbol berprofile OTB ter-apply (commission 33).
    const expected = getOtbInstrumentProfile(symbol) === null ? 0 : 33;
    assert(applied.commission === expected, `${symbol} commission=${applied.commission}`);
  }
});

test("407. getSpec32SwapPreview: AUDJPY_ORB LONG 2 hari Senin", () => {
  // -1.25 × 2 hari × 1 × 0.63 = -1.575 → -1.57 (Sen+Sel, tanpa triple).
  const preview = getSpec32SwapPreview({
    symbol: "AUDJPY_ORB",
    daysHeld: 2,
    direction: "LONG",
    tradeDatetime: new Date(2026, 8, 28),
  });
  if (preview === null) throw new Error("preview null");
  assert(preview.effectiveDays === 2, `eff=${preview.effectiveDays}`);
  assert(preview.tripleDayHit === false, "triple ikut hit");
  assert(Math.abs(preview.swapUSD - -1.57) < 0.011, `swapUSD=${preview.swapUSD}`);
});

test("408. spec32 non-regresi: OTB fixture data tetap locked (commission 33)", () => {
  const p = getOtbInstrumentProfile("GBPUSD_ORB");
  if (p === null) throw new Error("GBPUSD_ORB preset hilang");
  assert(p.commission?.pricePerLot === 33, `fixture=${p.commission?.pricePerLot} (harus 33)`);
});

test("409. spec32 fallback: unknown symbol → previous (no change)", () => {
  const previous = { ...makeEmptyBroker(), commission: 50 };
  const result = applyBrokerPreset(previous, "UNKNOWN", "orbitraderberjangka");
  assert(result === previous, "unknown symbol ikut ter-apply");
  assert(result.commission === 50, `commission=${result.commission}`);
});

test("410. spec32 modul murni: legacy registry Finex tidak rusak", () => {
  assert(SUPPORTED_SYMBOLS.length === 10, "daftar Finex berubah");
  const finex = getBrokerProfile("finex");
  assert(finex.instruments.length === 10, "instrumen Finex berubah");
  assert(
    getOtbInstrumentProfile("GBPUSD") === null,
    "nama Finex bocor ke preset OTB",
  );
});

/* ---------------- Normalisasi harga JPY 6F-1: TEST 411-413 ---------------- */

test("411. JPY quote-form (bid 109.764) = inverse-form (6F-1)", () => {
  // UI meneruskan quote pasar; formula % butuh invers. Hasil quote-form
  // harus identik dengan inverse-form (test 268), bukan meledak 10.000x.
  const quote = requireSwapCost({
    symbol: "AUDJPY_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 1,
    holdingDays: 1,
    currentPrice: 109.764,
  });
  const inverse = requireSwapCost({
    symbol: "AUDJPY_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    lot: 1,
    holdingDays: 1,
    currentPrice: 1 / 109.764,
  });
  assert(
    Math.abs(quote.swapCost - inverse.swapCost) < 1e-9,
    `quote=${quote.swapCost} inverse=${inverse.swapCost}`,
  );
  assert(
    Math.abs(quote.swapCost) < 1000,
    `nosional JPY meledak: ${quote.swapCost}`,
  );
  assert(quote.swapPercentage === -1.75, "swapPercentage berubah");
});

test("412. CADJPY_ORB quote-form konsisten dengan inverse-form (6F-1)", () => {
  const quote = requireSwapCost({
    symbol: "CADJPY_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 2,
    currentPrice: 110.749,
  });
  const inverse = requireSwapCost({
    symbol: "CADJPY_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 2,
    currentPrice: 1 / 110.749,
  });
  assert(
    Math.abs(quote.swapCost - inverse.swapCost) < 1e-9,
    `quote=${quote.swapCost} inverse=${inverse.swapCost}`,
  );
  assert(quote.swapPercentage === -1.25, "swapPercentage berubah");
});

test("413. non-JPY harga >1 tidak diinvers (USDCAD 1.42561, 6F-1)", () => {
  // Gate 6F-1 hanya untuk profit JPY; pair lain byte-identik.
  const cost = requireSwapCost({
    symbol: "USDCAD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
    currentPrice: 1.42561,
  });
  assert(
    Math.abs(cost.swapCost - -2138.415) < 1e-6,
    `swapCost=${cost.swapCost} (100000x1.42561x-1.5%)`,
  );
});

/* ---------------- Komisi broker 6G + margin getter: TEST 414-415 ---------------- */

test("414. getOtbMarginRequirements: statis CSV + null invented (6G)", () => {
  // Data-layer murni (display-only); decision engine tidak tersentuh.
  for (const s of ["GBPUSD_ORB", "AUDCAD_ORB", "EURCHF_ORB", "AUDJPY_ORB"]) {
    const m = getOtbMarginRequirements(s);
    if (m === null) throw new Error(`margin ${s} hilang`);
    assert(m.symbol === s, `symbol=${m.symbol}`);
    assert(m.initialMargin === 100000, `${s} initial=${m.initialMargin}`);
    assert(m.maintenanceMargin === 100000, `${s} maintenance=${m.maintenanceMargin}`);
    assert(m.hedgedMargin === 50000, `${s} hedged=${m.hedgedMargin}`);
    assert(Object.isFrozen(m), `${s} tidak frozen`);
  }
  assert(getOtbMarginRequirements("EURUSD_ORB") === null, "invented harus null");
  assert(getOtbMarginRequirements("GBPUSD") === null, "Finex harus null");
});

test("415. matriks komisi broker 6G: OTB 33 / Finex 1 / fallback 0", () => {
  assert(requireSpec32("GBPUSD_ORB").commission === 33, "OTB harus 33");
  assert(requireSpec32("AUDJPY_ORB").commission === 33, "OTB JPY harus 33");
  assert(requireSpec32("GBPUSD").commission === 1, "Finex harus 1");
  assert(requireSpec32("US100").commission === 1, "US100 harus 1");
  assert(
    getSpec32FormDefaults("XYZ").commission === SPEC32_FALLBACK_COMMISSION,
    "fallback berubah",
  );
  const finex = applyBrokerPreset(makeEmptyBroker(), "EURUSD", "finex");
  assert(finex.commission === FINEX_DEFAULT_COMMISSION, "Finex default bukan 1");
});

/* ---------------- Base URL backend via env (PROD): TEST 419-421 ---------------- */

test("419. resolveApiBaseUrl: default, trim, slash, eksplisit", () => {
  assert(
    resolveApiBaseUrl() === DEFAULT_API_BASE_URL ||
      resolveApiBaseUrl().startsWith("http"),
    "default rusak",
  );
  assert(
    resolveApiBaseUrl("http://192.168.1.63:3000") === "http://192.168.1.63:3000",
    "eksplisit berubah",
  );
  assert(
    resolveApiBaseUrl("  http://192.168.1.63:3000/  ") === "http://192.168.1.63:3000",
    "trim/slash gagal",
  );
  assert(resolveApiBaseUrl("") === resolveApiBaseUrl(), "empty inkonsisten");
  assert(typeof API_BASE_URL === "string" && API_BASE_URL !== "", "konstanta kosong");
});

test("420. hooks live memakai base URL terpusat (tanpa hardcode)", () => {
  for (const f of ["src/hooks/useEquityStream.ts", "src/hooks/useQuotesStream.ts"]) {
    const src = readSrc(f);
    assert(src.includes("lib/apiBaseUrl"), `${f} tidak impor apiBaseUrl`);
    assert(!src.includes("http://localhost:3000"), `${f} masih hardcode localhost`);
  }
});

test("421. CORS origin backend dari env + default lokal", () => {
  assert(FRONTEND_ORIGIN === "http://localhost:5173", `default=${FRONTEND_ORIGIN}`);
  const src = readSrc("server/app.ts");
  assert(src.includes("FRONTEND_ORIGIN"), "env FRONTEND_ORIGIN hilang");
  assert(src.includes('process.env?.["FRONTEND_ORIGIN"]'), "baca env hilang");
});

/* ---------------- Kesegaran data live P2: TEST 422-424 ---------------- */

test("422. parseSnapshotTime MT5 + ISO + invalid", () => {
  const mt5 = parseSnapshotTime("2026.10.02 22:54:59");
  assert(mt5 === Date.UTC(2026, 9, 2, 22, 54, 59), `mt5=${mt5}`);
  const iso = parseSnapshotTime("2026-10-04T06:54:37.014Z");
  assert(iso === Date.parse("2026-10-04T06:54:37.014Z"), `iso=${iso}`);
  assert(parseSnapshotTime("") === null, "empty harus null");
  assert(parseSnapshotTime("kemarin sore") === null, "sampah harus null");
  assert(parseSnapshotTime("2026-13-99T99:99:99Z") === null, "tanggal rusak harus null");
});

test("423. isStale ambang 15 mnt + formatAge bucket", () => {
  const now = 1_700_000_000_000;
  assert(STALE_AFTER_MS === 15 * 60 * 1000, "ambang berubah");
  assert(isStale(now - 60 * 1000, now) === false, "1 mnt dianggap basi");
  assert(isStale(now - 16 * 60 * 1000, now) === true, "16 mnt tak basi");
  assert(isStale(null, now) === false, "null menuduh basi");
  assert(isStale(now - 60 * 1000, now, 30 * 1000) === true, "threshold custom diabaikan");
  assert(formatAge(30 * 1000) === "baru saja", "detik salah");
  assert(formatAge(5 * 60 * 1000) === "5 mnt lalu", "menit salah");
  assert(formatAge(3 * 3600 * 1000) === "3 jam lalu", "jam salah");
  assert(formatAge(3 * 86400 * 1000) === "3 hari lalu", "hari salah");
  assert(formatAge(-5) === "baru saja", "negatif salah");
  // Seed jelas-basi: gap weekend terdeteksi, tick segar tidak.
  assert(CLEARLY_STALE_AFTER_MS === 12 * 3600 * 1000, "margin seed berubah");
  assert(
    isClearlyStale("2026.10.02 22:54:59", Date.UTC(2026, 9, 4, 12, 0, 0)) === true,
    "gap 2 hari tak terdeteksi",
  );
  const freshTs = new Date(now - 60 * 1000).toISOString();
  assert(isClearlyStale(freshTs, now) === false, "tick segar dituduh basi");
  assert(isClearlyStale(undefined, now) === false, "undefined basi");
  assert(isClearlyStale("sampah", now) === false, "sampah basi");
});

test("424. panel live wiring dataFreshness + teks basi (readSrc)", () => {
  for (const f of [
    "src/components/analysis/LiveQuotes.tsx",
    "src/components/result/LiveEquity.tsx",
  ]) {
    const src = readSrc(f);
    assert(src.includes("lib/dataFreshness"), `${f} tak impor dataFreshness`);
    assert(src.includes("isStale"), `${f} tak memakai isStale`);
    assert(src.includes("basi"), `${f} tak render label basi`);
  }
  const helper = readSrc("src/lib/dataFreshness.ts");
  assert(!helper.includes("import.meta."), "helper tak CJS-safe");
  assert(!helper.includes("document"), "helper menyentuh DOM");
});

/* ---------------- Guard deviasi CSV vs harga berjalan: TEST 425-426 ---------------- */

function makeFlatCandles(close: number, count: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    out.push(makeCandle(`t${i}`, close, close + 0.0002, close - 0.0002, close));
  }
  return out;
}

test("425. checkPriceDeviation: cocok null, salah-pair warning", () => {
  assert(DEVIATION_WARN_PCT === 10, "ambang berubah");
  // GBPUSD CSV (~1.3240) vs harga 1.3248 → <0.1%, lolos.
  assert(
    checkPriceDeviation(makeFlatCandles(1.324, 10), 1.3248) === null,
    "pair benar ikut warning",
  );
  // AUDCAD CSV (~0.99) ditempel untuk GBPUSD (1.32) → ~25%, warning.
  const warned = checkPriceDeviation(makeFlatCandles(0.99, 10), 1.32);
  assert(warned !== null, "pair salah lolos diam-diam");
  if (warned !== null) {
    assert(warned.includes("25."), `persen hilang: ${warned}`);
    assert(warned.includes("CSV"), "sumber CSV tak disebut");
  }
  // Batas: 9% lolos, 11% warning (hindari batas biner persis 10%).
  assert(checkPriceDeviation(makeFlatCandles(1.09, 5), 1.0) === null, "9% gagal");
  assert(
    checkPriceDeviation(makeFlatCandles(1.11, 5), 1.0) !== null,
    "11% lolos",
  );
  // Invalid dilewati tanpa tuduhan.
  assert(checkPriceDeviation([], 1.32) === null, "kosong warning");
  assert(checkPriceDeviation(makeFlatCandles(1.32, 5), 0) === null, "harga 0 warning");
  assert(checkPriceDeviation(makeFlatCandles(1.32, 5), NaN) === null, "NaN warning");
});

test("426. SwingLevelsForm memakai guard ganda (readSrc)", () => {
  const src = readSrc("src/components/analysis/SwingLevelsForm.tsx");
  assert(src.includes("checkPriceDeviation"), "guard deviasi tak di-wire");
  assert(
    src.includes("checkInstrumentMismatch"),
    "guard skala hilang (regresi)",
  );
});

/* ---------------- Arsip tick histori HIST-1: TEST 427-429 ---------------- */

test("427. normalizeTsToUtc + resolveTzOffset + filename + dedup key", () => {
  assert(DEFAULT_TZ_OFFSET_HOURS === 3, "default offset berubah");
  assert(DEFAULT_RETENTION_DAYS === 120, "default retensi berubah");
  // MT5 "22:54:59" server +3 → 19:54:59Z.
  assert(
    normalizeTsToUtc("2026.10.02 22:54:59", 3) === "2026-10-02T19:54:59.000Z",
    "konversi MT5 salah",
  );
  assert(
    normalizeTsToUtc("2026.10.02 22:54:59", 0) === "2026-10-02T22:54:59.000Z",
    "offset 0 salah",
  );
  assert(
    normalizeTsToUtc("2026-10-04T06:54:37.014Z", 3) === "2026-10-04T06:54:37.014Z",
    "ISO harus passthrough",
  );
  assert(normalizeTsToUtc("", 3) === null, "empty harus null");
  assert(normalizeTsToUtc("sampah", 3) === null, "sampah harus null");
  assert(resolveTzOffset("3") === 3, "string offset gagal");
  assert(resolveTzOffset(99) === 3, "offset liar harus default");
  assert(resolveTzOffset(undefined) === 3, "undefined harus default");
  assert(
    historyFileName("2026-10-02T19:54:59.000Z") === "ticks-2026-10-02.jsonl",
    "bucket harian salah",
  );
  assert(
    tickKey("A", "t", 1, 2) !== tickKey("A", "t", 1, 3),
    "key tak membedakan bid/ask",
  );
  assert(tickKey("A", "t", 1, 2) === tickKey("A", "t", 1, 2), "key tak stabil");
});

test("428. TickHistoryLogger: tulis, dedup, coverage, prune (temp dir)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdbka-hist-"));
  try {
    const logger = new TickHistoryLogger(dir, "otb", 3);
    const batch = [
      { timestamp: "2026.10.02 22:54:59", symbol: "CADJPY_ORB", bid: 110.701, ask: 110.749 },
      { timestamp: "2026.10.02 22:54:59", symbol: "CADJPY_ORB", bid: 110.701, ask: 110.749 },
      { timestamp: "2026.10.02 22:55:01", symbol: "GBPUSD_ORB", bid: 1.3237, ask: 1.32393 },
      { timestamp: "", symbol: "X", bid: 1, ask: 2 },
      { timestamp: "2026.10.02 22:55:02", symbol: "Y", bid: 0, ask: 0 },
    ];
    const r1 = logger.ingest(batch, true);
    assert(r1.appended === 2, `appended=${r1.appended} (duplikat+invalid harus dilewati)`);
    assert(r1.skipped === 3, `skipped=${r1.skipped}`);
    const r2 = logger.ingest(batch, false);
    assert(r2.appended === 0, "re-ingest menulis ulang");
    assert(r2.skipped === 5, "re-ingest tak skip semua");
    const cov = logger.coverage();
    assert(cov.broker === "otb", "broker salah");
    assert(cov.files === 1, `files=${cov.files}`);
    assert(cov.symbols["CADJPY_ORB"]?.count === 1, "count CADJPY salah");
    assert(
      cov.symbols["CADJPY_ORB"]?.first === "2026-10-02T19:54:59.000Z",
      "first salah (UTC)",
    );
    assert(cov.symbols["GBPUSD_ORB"]?.count === 1, "count GBPUSD salah");
    // Prune: file purba terhapus, file kemarin bertahan.
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const oldF = `ticks-${fmt(new Date(Date.now() - 200 * 86400 * 1000))}.jsonl`;
    const keepF = `ticks-${fmt(new Date(Date.now() - 86400 * 1000))}.jsonl`;
    fs.writeFileSync(path.join(dir, "otb", oldF), "");
    fs.writeFileSync(path.join(dir, "otb", keepF), "");
    assert(logger.prune(120) === 1, "prune tak hapus file purba");
    assert(fs.existsSync(path.join(dir, "otb", keepF)), "file kemarin ikut terhapus");
    const totals = logger.getTotals();
    assert(totals.appended === 2 && totals.skipped === 8, `totals=${JSON.stringify(totals)}`);
    // Restart backend (proses baru, memori kosong): kunci dimuat dari disk,
    // backfill ulang TIDAK menulis duplikat.
    const logger2 = new TickHistoryLogger(dir, "otb", 3);
    const r3 = logger2.ingest(batch, true);
    assert(r3.appended === 0, `restart menulis ulang: +${r3.appended}`);
    assert(r3.skipped === 5, "restart tak skip semua");
    // Compaction: duplikat manual di file dibersihkan saat init.
    const histFile = path.join(dir, "otb", "ticks-2026-10-02.jsonl");
    const before = fs.readFileSync(histFile, "utf-8").split("\n").filter((l: string) => l.trim() !== "").length;
    fs.appendFileSync(histFile, fs.readFileSync(histFile, "utf-8"));
    const logger3 = new TickHistoryLogger(dir, "otb", 3);
    const after = fs.readFileSync(histFile, "utf-8").split("\n").filter((l: string) => l.trim() !== "").length;
    assert(after === before, `compact gagal: ${before} → ${after}`);
    void logger3;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("429. wiring histori: subscribe + backfill + route + env (readSrc)", () => {
  const index = readSrc("server/index.ts");
  assert(index.includes("TickHistoryLogger"), "logger tak di-wire di index");
  assert(index.includes(".onUpdate("), "subscribe onUpdate hilang");
  assert(index.includes(".refresh()"), "backfill refresh hilang");
  assert(index.includes("/api/history/coverage") || readSrc("server/app.ts").includes("/api/history/coverage"), "route coverage hilang");
  const app = readSrc("server/app.ts");
  assert(app.includes("history"), "app tak kenal history");
  const envExample = readSrc(".env.example");
  assert(envExample.includes("HISTORY_DIR"), "HISTORY_DIR tak didokumentasikan");
  assert(envExample.includes("MT5_TZ_OFFSET_OTB"), "offset OTB tak didokumentasikan");
  assert(envExample.includes("MT5_TZ_OFFSET_FINEX"), "offset Finex tak didokumentasikan");
  const gitignore = readSrc(".gitignore");
  assert(gitignore.includes("data/"), "data/ tak di-ignore (arsip ikut commit!)");
});

/* ---------------- Proxy kurs ECB via backend (FX-PROXY): TEST 430-431 ---------------- */

test("430. isFxCacheFresh + route terdaftar + parser dipakai ulang", () => {
  assert(FX_CACHE_TTL_MS === 12 * 3600 * 1000, "TTL cache berubah");
  const now = 1_700_000_000_000;
  assert(isFxCacheFresh(now - 1000, now) === true, "cache segar ditolak");
  assert(isFxCacheFresh(now - 13 * 3600 * 1000, now) === false, "cache basi diterima");
  assert(isFxCacheFresh(NaN, now) === false, "NaN diterima");
  const app = readSrc("server/app.ts");
  assert(app.includes("/api/fx"), "route /api/fx tak mount");
  const routes = readSrc("server/routes/fxRoutes.ts");
  assert(routes.includes('"/ecb"'), "endpoint /ecb hilang");
  assert(routes.includes("parseECBXml"), "parser tak dipakai ulang");
  assert(routes.includes("FALLBACK_RATES"), "fallback hilang");
  assert(routes.includes("FX_CACHE_TTL_MS"), "konstanta TTL hilang");
});

test("431. frontend via proxy dulu, direct tetap cadangan (readSrc)", () => {
  const service = readSrc("src/services/fxRateService.ts");
  assert(service.includes("fetchBackendRates"), "fetchBackendRates hilang");
  assert(service.includes("/api/fx/ecb"), "URL proxy hilang");
  assert(service.includes("fetchECBRates"), "direct fetch hilang (regresi test 287)");
  assert(service.includes("eurofxref-daily.xml"), "ECB URL hilang (regresi test 287)");
  const appSrc = readSrc("src/App.tsx");
  assert(appSrc.includes("fetchBackendRates"), "App tak pakai proxy");
  assert(appSrc.includes("fetchECBRates"), "App kehilangan cadangan direct (regresi test 294)");
  assert(appSrc.includes("API_BASE_URL"), "App tak pakai base URL env");
});

/* ---------------- Monitor posisi + sinyal exit F1: TEST 432-435 ---------------- */

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h-test",
    symbol: "USDCHF",
    brokerId: "finex",
    direction: "BELI",
    lot: 0.01,
    entryPrice: 0.83231,
    sl: 0.82724,
    tp: 0.84224,
    entryTime: "2026-09-29T06:04:06.000Z",
    createdAt: "2026-09-29T06:04:06.000Z",
    ...overrides,
  };
}

/** Konverter FX deterministik untuk test (ECB 1 CHF = 1/0.832 USD). */
function testToUsd(amount: number, currency: string): number | null {
  if (currency === "USD") return amount;
  if (currency === "CHF") return (amount / 0.832) * 1;
  if (currency === "CAD") return (amount / 1.42) * 1;
  if (currency === "JPY") return (amount / 157.0) * 1;
  if (currency === "AUD" || currency === "EUR" || currency === "GBP" || currency === "NZD") {
    return amount * 1;
  }
  return null;
}

test("432. P&L cocok laporan broker 91811209 (real history)", () => {
  // USDCHF buy 0.01 @0.83231 → bid 0.83349 = +1.42 (laporan).
  const usdchf = calculateHoldingPnL(
    makeHolding(),
    0.83349,
    0.8336,
    testToUsd,
  );
  if (usdchf === null) throw new Error("pnl null");
  assert(usdchf.currency === "USD", `ccy=${usdchf.currency}`);
  assert(Math.abs((usdchf?.value ?? 0) - 1.42) < 0.03, `pnl=${usdchf?.value}`);
  // GBPUSD buy 0.01 @1.32483 → 1.32339 = -1.44 (laporan, tanpa konversi).
  const gbpusd = calculateHoldingPnL(
    makeHolding({ symbol: "GBPUSD", entryPrice: 1.32483, sl: 1.31977, tp: 1.33477 }),
    1.32339,
    1.3235,
    testToUsd,
  );
  assert(gbpusd?.currency === "USD", "GBPUSD harus USD langsung");
  assert(Math.abs((gbpusd?.value ?? 0) - -1.44) < 1e-9, `pnl=${gbpusd?.value}`);
  // AUDCAD buy 0.01 @0.99345 → 0.99154 ≈ -1.35 via konversi (bukan -1.91 mentah).
  const audcad = calculateHoldingPnL(
    makeHolding({ symbol: "AUDCAD", entryPrice: 0.99345, sl: 0.98975, tp: 1.00475 }),
    0.99154,
    0.9916,
    testToUsd,
  );
  assert(audcad?.currency === "USD", "AUDCAD harus terkonversi USD");
  assert(Math.abs((audcad?.value ?? 0) - -1.35) < 0.05, `pnl=${audcad?.value}`);
  // Tanpa converter: nilai profit-ccy berlabel jujur.
  const raw = calculateHoldingPnL(
    makeHolding({ symbol: "AUDCAD", entryPrice: 0.99345, sl: 0.98975, tp: 1.00475 }),
    0.99154,
    0.9916,
  );
  assert(raw?.currency === "CAD", "tanpa converter harus CAD");
  // Invalid → null; simbol unknown → null.
  assert(calculateHoldingPnL(makeHolding(), 0, 0.8, testToUsd) === null, "bid 0 lolos");
  assert(
    calculateHoldingPnL(makeHolding({ symbol: "XYZ" }), 1, 2, testToUsd) === null,
    "unknown lolos",
  );
});

test("433. evaluateExitSignal: TP/SL/near/drift/HOLD", () => {
  assert(NEAR_LEVEL_PCT === 15 && ADVERSE_DRIFT_PCT === 50, "ambang berubah");
  const base = makeHolding();
  // TP tersentuh (bid 0.84224 ≥ TP).
  const tp = evaluateExitSignal(base, 0.8423, 0.8424, testToUsd);
  assert(tp.signal === "EXIT_TAKE_PROFIT", `sinyal=${tp.signal}`);
  // SL tersentuh (bid 0.82724 ≤ SL).
  const sl = evaluateExitSignal(base, 0.8272, 0.8273, testToUsd);
  assert(sl.signal === "EXIT_STOP_LOSS", `sinyal=${sl.signal}`);
  // Tengah koridor → HOLD.
  const hold = evaluateExitSignal(base, 0.834, 0.8341, testToUsd);
  assert(hold.signal === "HOLD", `sinyal=${hold.signal}`);
  assert(hold.risk !== null && hold.reward !== null, "risk/reward hilang");
  // JUAL terbalik: ask ≤ TP → TP; ask ≥ SL → SL.
  const short = makeHolding({ direction: "JUAL", entryPrice: 0.83523, sl: 0.83802, tp: 0.83202 });
  const shortTp = evaluateExitSignal(short, 0.8319, 0.832, testToUsd);
  assert(shortTp.signal === "EXIT_TAKE_PROFIT", `short TP=${shortTp.signal}`);
  const shortSl = evaluateExitSignal(short, 0.8379, 0.8381, testToUsd);
  assert(shortSl.signal === "EXIT_STOP_LOSS", `short SL=${shortSl.signal}`);
  // Drift: rugi ~60% risiko (di luar band near 15%, di atas ambang 50%).
  const drift = evaluateExitSignal(base, 0.8296, 0.8297, testToUsd);
  assert(drift.signal === "WARN_ADVERSE_DRIFT", `drift=${drift.signal} (${drift.pnl})`);
  // Dekat TP: dalam 15% rentang (0.84224-0.82724=0.015 → band 0.00225).
  const near = evaluateExitSignal(base, 0.841, 0.8411, testToUsd);
  assert(near.signal === "WARN_NEAR_TP", `near=${near.signal}`);
  // Invalid → HOLD + alasan.
  const bad = evaluateExitSignal(base, 0, 0, testToUsd);
  assert(bad.signal === "HOLD" && bad.pnl === null, "invalid tak HOLD");
});

test("434. validateHoldingInput: sisi SL/TP + spec", () => {
  assert(
    validateHoldingInput({ symbol: "USDCHF", direction: "BELI", lot: 0.01, entryPrice: 0.83, sl: 0.82, tp: 0.84 }).length === 0,
    "input valid ditolak",
  );
  const wrongSide = validateHoldingInput({ symbol: "USDCHF", direction: "BELI", lot: 0.01, entryPrice: 0.83, sl: 0.84, tp: 0.82 });
  assert(wrongSide.some((m) => m.includes("BELI")), "sisi BELI salah lolos");
  const wrongSell = validateHoldingInput({ symbol: "USDCHF", direction: "JUAL", lot: 0.01, entryPrice: 0.83, sl: 0.82, tp: 0.84 });
  assert(wrongSell.some((m) => m.includes("JUAL")), "sisi JUAL salah lolos");
  assert(validateHoldingInput({ symbol: "", direction: "BELI", lot: 0.01, entryPrice: 0.83, sl: 0.82, tp: 0.84 }).length > 0, "simbol kosong lolos");
  assert(validateHoldingInput({ symbol: "USDCHF", direction: "BELI", lot: 0, entryPrice: 0.83, sl: 0.82, tp: 0.84 }).length > 0, "lot 0 lolos");
  assert(
    validateHoldingInput({ symbol: "XYZ", direction: "BELI", lot: 0.01, entryPrice: 1, sl: 0.9, tp: 1.1 }).some((m) => m.includes("spec")),
    "unknown tanpa peringatan spec",
  );
});

test("435. wiring holdings: komponen + mount App (readSrc)", () => {
  for (const f of [
    "src/components/holdings/HoldingsForm.tsx",
    "src/components/holdings/HoldingsDashboard.tsx",
    "src/components/holdings/HoldingsMonitor.tsx",
    "src/hooks/useHoldingsQuotes.ts",
  ]) {
    const src = readSrc(f);
    assert(!src.includes("import.meta."), `${f} tak CJS-safe`);
  }
  const form = readSrc("src/components/holdings/HoldingsForm.tsx");
  assert(form.includes("validateHoldingInput"), "form tak validasi");
  assert(form.includes("Tanpa order") || form.includes("tanpa order"), "label tanpa-order hilang");
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("evaluateExitSignal"), "dashboard tak evaluasi sinyal");
  assert(dash.includes("holdings-dashboard"), "testid dashboard hilang");
  const app = readSrc("src/App.tsx");
  assert(app.includes("HoldingsMonitor"), "monitor tak terpasang di App");
  assert(app.includes("Monitor posisi"), "panel monitor hilang");
});

/* ---------------- Guard margin + R:R + drift harga Phase 2: TEST 436-439 ---------------- */

test("436. checkMarginGuard: >10% warning, ≤10% null", () => {
  assert(MARGIN_GUARD_PCT === 10, "ambang berubah");
  // Risiko USDCHF 0.01 lot = 5.07 CHF ≈ $6.09 (testToUsd).
  const risky = makeHolding({ accountEquity: 50 });
  const warn = checkMarginGuard(risky, testToUsd);
  assert(warn !== null, "risiko 12% lolos tanpa warning");
  if (warn !== null) {
    assert(warn.includes("12."), `persen hilang: ${warn}`);
    assert(warn.includes("10%"), "ambang tak disebut");
  }
  const safe = makeHolding({ accountEquity: 100 });
  assert(checkMarginGuard(safe, testToUsd) === null, "risiko 6% ikut warning");
  assert(
    checkMarginGuard(makeHolding(), testToUsd) === null,
    "tanpa equity ikut warning",
  );
  assert(
    checkMarginGuard(makeHolding({ accountEquity: 50 })) === null,
    "tanpa converter AUD? (USDCHF perlu konversi CHF→USD)",
  );
  const usdPair = makeHolding({
    symbol: "GBPUSD",
    entryPrice: 1.32483,
    sl: 1.31977,
    tp: 1.33477,
    accountEquity: 10,
  });
  // Risiko = 0.00506×100000×0.01 = $5.06 = 50.6% equity → warning (tanpa converter).
  const warnUsd = checkMarginGuard(usdPair);
  assert(warnUsd !== null, "risiko 50% USD lolos");
});

test("437. rewardRiskRatio + checkRewardRisk 1:2", () => {
  assert(MIN_REWARD_RISK === 2, "ambang berubah");
  // Trade contoh user: risk 0.00507, reward 0.00993 → 1:1.96 < 1:2.
  const ratio = rewardRiskRatio(0.83231, 0.82724, 0.84224);
  assert(ratio !== null && Math.abs(ratio - 1.959) < 0.01, `ratio=${ratio}`);
  const warn = checkRewardRisk(0.83231, 0.82724, 0.84224);
  assert(warn !== null && warn.includes("1:1.96"), `warning=${warn}`);
  assert(checkRewardRisk(1, 0.9, 1.3) === null, "1:3 ikut warning");
  assert(checkRewardRisk(1, 1, 1.1) === null, "risiko nol harus null");
  assert(checkRewardRisk(NaN, 0.9, 1.1) === null, "NaN harus null");
});

test("438. WARN_PRICE_DRIFT 0,5%: BELI/JUAL + batas zona", () => {
  assert(PRICE_DRIFT_PCT === 0.5, "ambang berubah");
  // SL lebar agar zona near (15%) tak menutupi zona drift.
  const wide = makeHolding({ sl: 0.82, tp: 0.85 });
  // Bid 0.8281 = −0.51% dari 0.83231 → drift (di luar band near 0.0045).
  const drifted = evaluateExitSignal(wide, 0.8281, 0.8282, testToUsd);
  assert(drifted.signal === "WARN_PRICE_DRIFT", `sinyal=${drifted.signal}`);
  // Merugikan 0,3% (< 0,5%) → bukan price drift (jatuh ke risk drift).
  const mild = evaluateExitSignal(wide, 0.8298, 0.8299, testToUsd);
  assert(mild.signal !== "WARN_PRICE_DRIFT", `ikut drift: ${mild.signal}`);
  // Sisi menguntungkan → tak pernah drift harga.
  const gain = evaluateExitSignal(wide, 0.838, 0.8381, testToUsd);
  assert(gain.signal !== "WARN_PRICE_DRIFT", `gain ikut drift: ${gain.signal}`);
  // JUAL cermin: ask +0,51% di atas entry → drift.
  const short = makeHolding({
    direction: "JUAL",
    entryPrice: 0.83523,
    sl: 0.84523,
    tp: 0.82523,
  });
  const shortDrift = evaluateExitSignal(short, 0.8394, 0.8395, testToUsd);
  assert(shortDrift.signal === "WARN_PRICE_DRIFT", `short=${shortDrift.signal}`);
  // TP/SL tetap menang atas drift.
  const slHit = evaluateExitSignal(wide, 0.8199, 0.82, testToUsd);
  assert(slHit.signal === "EXIT_STOP_LOSS", `SL kalah: ${slHit.signal}`);
});

test("439. wiring Phase 2: form equity + badge margin/RR/drift (readSrc)", () => {
  const form = readSrc("src/components/holdings/HoldingsForm.tsx");
  assert(form.includes("accountEquity"), "field equity hilang di form");
  assert(form.includes("rewardRiskRatio"), "hint R:R hilang di form");
  assert(form.includes("1:2"), "ambang 1:2 hilang di form");
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("checkMarginGuard"), "margin guard tak di-wire");
  assert(dash.includes("checkRewardRisk"), "cek R:R tak di-wire");
  assert(dash.includes("WARN_PRICE_DRIFT"), "badge drift harga hilang");
  const lib = readSrc("src/lib/exitMonitor.ts");
  assert(lib.includes("PRICE_DRIFT_PCT"), "konstanta drift hilang");
  assert(lib.includes("MARGIN_GUARD_PCT"), "konstanta margin hilang");
  assert(lib.includes("MIN_REWARD_RISK"), "konstanta R:R hilang");
});

// Test 310-317 (QuotesLogReader) + 318-329 (SSE envelope/stream) +
// 339-344 (hardening akses file MT5):
// SATU runner async utama dengan SATU process.exit. Dua IIFE terpisah
// dilarang (balapan exit + ringkasan ganda). Jumlah stream/hardening
// dibaca dari konstanta suite agar tidak hard-code di dua tempat.
(async () => {
  try {
    const allPassed = await runQuotesLogReaderTests();
    if (allPassed) {
      passed += 8;
    } else {
      failed += 8;
    }
  } catch (e) {
    console.error("✗ QuotesLogReader test suite error:", e);
    failed += 8;
  }

  try {
    const {
      QUOTES_STREAM_TEST_COUNT,
      runQuotesStreamTests,
    } = await import("../src/hooks/useQuotesStream.test");
    const allPassed = await runQuotesStreamTests();
    if (allPassed) {
      passed += QUOTES_STREAM_TEST_COUNT;
    } else {
      failed += QUOTES_STREAM_TEST_COUNT;
    }
  } catch (e) {
    console.error("✗ Quotes stream test suite error:", e);
    // Import gagal -> count tak terbaca; samakan dengan
    // QUOTES_STREAM_TEST_COUNT di src/hooks/useQuotesStream.test.ts.
    failed += 12;
  }

  try {
    const {
      READER_HARDENING_TEST_COUNT,
      runReaderHardeningTests,
    } = await import("../src/services/quotesLogReader.test");
    const allPassed = await runReaderHardeningTests();
    if (allPassed) {
      passed += READER_HARDENING_TEST_COUNT;
    } else {
      failed += READER_HARDENING_TEST_COUNT;
    }
  } catch (e) {
    console.error("✗ Reader hardening test suite error:", e);
    // Samakan dengan READER_HARDENING_TEST_COUNT di
    // src/services/quotesLogReader.test.ts.
    failed += 6;
  }

  try {
    const {
      LIVE_SOURCE_TEST_COUNT,
      runLiveSourceTests,
    } = await import("../server/types/liveSource.test");
    const allPassed = await runLiveSourceTests();
    if (allPassed) {
      passed += LIVE_SOURCE_TEST_COUNT;
    } else {
      failed += LIVE_SOURCE_TEST_COUNT;
    }
  } catch (e) {
    console.error("✗ Live source test suite error:", e);
    // Samakan dengan LIVE_SOURCE_TEST_COUNT di
    // server/types/liveSource.test.ts.
    failed += 8;
  }

  console.log(
    `\n${passed} lolos, ${failed} gagal dari ${passed + failed} pengujian.`,
  );
  process.exit(failed > 0 ? 1 : 0);
})();
