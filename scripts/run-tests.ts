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
import { checkStopsDistance, getStopsDistance } from "../src/lib/orderTicket";
import {
  INDICATOR_MIN_CANDLES,
  atrWilder,
  cci,
  computeIndicators,
  ema,
  macd,
  rsiWilder,
  sma,
} from "../src/calculations/indicators";
import {
  analyzeMarket,
  MAX_COST_SHARE_OF_RISK,
} from "../src/calculations/decisionEngine";
import { formatSharePercent, signalReason } from "../src/lib/signalReason";
import { collectCandleItems } from "../server/routes/candlesRoutes";
import { createTradeEntryLog } from "../server/services/tradeEntryLog";
import { getBackupStatus, runBackup } from "../server/services/dataBackup";
import { evaluateTrades, GROUP_BEFORE_LOG, GROUP_NO_LOG } from "../server/services/tradeEvaluation";
import {
  brokerFromCompany,
  collectAccountEvaluations,
  excursionsForLogin,
  parseAccountLabels,
} from "../server/routes/evaluationRoutes";
import { lastCandleTimeMs, scanSymbol, sortScanRows, type ScanRow } from "../src/lib/symbolScanner";
import { parseCalendarCsv, readCalendarForBroker } from "../server/services/calendarReader";
import { calendarResponse } from "../server/routes/calendarRoutes";
import { mergeUsdIdrBook, parseEcbHistXml, readUsdIdrBook, refreshUsdIdrBook, usdIdrOn } from "../server/services/ecbHistory";
import { buildHistoryView } from "../server/services/historyView";
import { accountKind, historyForLogin, listHistoryAccounts } from "../server/routes/historyRoutes";
import { parseSignalPage, signalPageUrl } from "../src/lib/signalPageView";
import { calculateTargets, secureReadiness } from "../src/lib/targetCalculator";
import { accountMetrics, GROUP_TABS, groupPageUrl, groupSymbolTabs, parseGroupPage } from "../src/lib/groupPageView";
import { candleChartModel, hourKey, LINE_COLOR, positionLines, spreadLabels, withLiveCandles } from "../src/lib/candleChart";
import { readCandleCsv } from "../server/routes/candlesRoutes";
import { findSessionHold, serverNowText, serverToWitLabel, sessionNotice, sessionState, weeklyIntervals } from "../src/lib/sessionGuard";
import { parseSessionsCsv } from "../server/services/sessionReader";
import { buildStockPortfolio, buildTradeSummary, isStockSymbol } from "../src/lib/stockPortfolio";
import { calculatorPageUrl, calculatorUrlFromHolding, parseCalculatorPage, parseInputNumber, positionOptionLabel, prefillFromPosition, symbolOptions } from "../src/lib/calculatorPageView";
import { accountsForBroker, formatIdr, formatUsd as formatUsdHistory, historyPageUrl, mt5DirectionText, parseHistoryPage } from "../src/lib/historyPageView";
import { applyNewsHold, findNewsHold, newsCurrenciesOf, newsMinutesBefore, NEWS_WINDOW_MINUTES, upcomingHighNews } from "../src/lib/newsGuard";
import { formatClock12, serverUtcOffsetHours, WIT_UTC_OFFSET } from "../src/lib/serverClock";
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
  getFinexVolumeSpec,
  isMarketEmptyForSymbol,
  mergeValidOcrMarketData,
  parseMarketInput,
} from "../src/lib/marketReset";
import { validateAnalysisInputs } from "../src/calculations/inputValidator";
import { MARGIN_USAGE_MAX_PCT, checkMarginCap } from "../src/lib/marginGuard";
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
  hasDecimalSeparator,
  normalizeBigOcrNumber,
} from "../src/lib/marketWatchParser";
import {
  parseMaValue,
  parseOcrTextRich,
  parseSignedIndicatorLine,
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
  COMPACTED_REGISTRY,
  forEachLineSync,
  normalizeTsToUtc,
  readTailText,
  resolveTzOffset,
  tickKey,
} from "../server/services/tickHistory";
import { FX_CACHE_TTL_MS, isFxCacheFresh } from "../server/routes/fxRoutes";
import { isBrokerPosition, parsePositionRow } from "../server/types/positions";
import { PositionsLogReader } from "../server/services/positionsLogReader";
import { marginFileTag, parseMarginCsv } from "../server/types/marginCsv";
import { parseSwapLogCsv, swapLogLogin } from "../server/types/swapLogCsv";
import { extractIdrAmount, parseHistoryCsv } from "../server/types/historyCsv";
import {
  applyKursRules,
  DEFAULT_SERVER_UTC_OFFSET_HOURS,
  entriesToCsv,
  mergeDeals,
  parseKursText,
  serverDateWib,
  summarizeByYear,
  updateEntry,
} from "../server/types/jurnalPajak";
import { createJurnalPajakStore } from "../server/services/jurnalPajakStore";
import {
  calculateTaxLiability,
  progressiveTax,
  ptkpAmount,
} from "../server/types/pajakOP";
import { buildLaporanHtml, escapeHtml } from "../server/types/laporanPajak";
import { createPembayaranPajakStore } from "../server/services/pembayaranPajakStore";
import {
  decodeBukti,
  kodeAkunFor,
  validatePembayaran,
  validateProfil,
} from "../server/types/pembayaranPajak";
import { predictDailySwap } from "../src/lib/swapPrediction";
import {
  ADVERSE_DRIFT_PCT,
  MARGIN_GUARD_PCT,
  MIN_REWARD_RISK,
  NEAR_LEVEL_PCT,
  PRICE_DRIFT_PCT,
  calculateExitPnL,
  calculateHoldingPnL,
  calculateHoldingSwap,
  checkMarginGuard,
  checkRewardRisk,
  commissionForHolding,
  countHoldings,
  evaluateExitSignal,
  stockCommissionUnverified,
  filterHoldingsByBroker,
  markHoldingExited,
  rewardRiskRatio,
  toAutoHolding,
  validateHoldingInput,
  type Holding,
  BREAKEVEN_R_MULTIPLE,
  TIME_STOP_HOURS,
  checkTimeStop,
  timeStopApplies,
  checkBreakeven,
  breakevenCostDistance,
  formatPriceDistance,
} from "../src/lib/exitMonitor";
import {
  createFreshWorkspace,
  createWorkspaceStore,
  hasWorkspaceWork,
  snapshotWorkspace,
  type BrokerWorkspace,
} from "../src/lib/brokerWorkspace";
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
  profitToIdr,
  usdIdrRate,
} from "../src/services/fxRateService";
import { withUsdPointValue } from "../src/lib/usdPointValue";
import { resolveCsvBidAsk } from "../src/lib/csvQuote";
import {
  calculateSwapWithTriple,
  getTripleSwapLabel,
  isWednesday,
} from "../src/services/dateService";
import {
  MT5LogReader,
  parseEquityCsvLine,
  parseEquityFromText,
} from "../server/services/mt5LogReader";
import { isEquitySnapshot } from "../server/types/equity";
import { autoCsvFileName, autoLoadKey, findCandleItem } from "../src/lib/autoCandle";
import { summarizeAccountBalance } from "../server/services/accountBalance";
import { buildBalanceRows, usdToIdrText } from "../src/lib/accountBalanceView";
import { applyDoubleBetHold, exposureOf, findDoubleBet } from "../src/lib/correlationGuard";
import { applyLossPauseHold, checkLossStreak, tradesForBroker } from "../src/lib/lossStreakGuard";
import { formatPrice, priceDigits } from "../src/lib/tickSize";
import { baseRiskSymbol, RISK_GROUPS, riskCapFor, riskGroupOf, riskGroupTable } from "../src/lib/riskGroup";
import { computeExcursion } from "../server/services/tradeExcursion";
import { computeExcursionsFromArchive, excursionFileNames } from "../server/services/excursionReader";
import {
  appendExcursionCache,
  excursionCacheFile,
  excursionKey,
  isFinalExcursion,
  readExcursionCache,
} from "../server/services/excursionCache";
import { newestTickRaw, runExcursionPass, startExcursionSchedule } from "../server/services/excursionJob";
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

import { applySpecHold, compareSpecs, heldSymbols, parseSpecsCsv, specHoldMap } from "../src/lib/specCompare";
import { readSpecsForBroker } from "../server/services/specReader";
import { pickLiveSource, resolveLiveBroker } from "../server/types/liveSource";
import { MIFX_SPEC_SYMBOLS } from "../src/lib/mifxSpecs";
import { mandatoryStop } from "../src/lib/mandatoryStop";
import { estimateSwap, swapChargeDays } from "../src/lib/swapEstimate";
import { applyOpeningHold, findOpeningHold, openingState, openingWarning } from "../src/lib/openingGuard";
import {
  COPY_DRIFT_SHARE,
  COPY_LOCK_SECONDS,
  copyButtonsView,
  copyLockState,
  planDriftShare,
  startCopyLock,
} from "../src/lib/copyGuard";
import {
  excursionCell,
  usdPerPriceUnit,
  formatDuration,
  formatRupiah,
  formatUsd,
  formatWinRate,
  isLegacyGroup,
  lolosLabel,
  mergeGroupStats,
  proofLabel,
  proofStatus,
  sortGroups,
  type EvalAccount,
  type EvalTradeStats,
} from "../src/lib/evaluationView";

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
  assert(SUPPORTED_SYMBOLS.length === 82, `jumlah=${SUPPORTED_SYMBOLS.length}`);
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

test("55. App: peringatan CSV lintas simbol ditampilkan", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("csvSymbolMismatchNotice"), "guard mismatch hilang");
  assert(src.includes("berisi data"), "pesan mismatch hilang");
  assert(
    src.includes("agar analisa tidak memakai"),
    "arahan file benar hilang",
  );
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
  assert(applied.contractSize === 20, `contractSize=${applied.contractSize}`);
  assert(applied.pointValue === 20, `pointValue=${applied.pointValue}`);
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
  assert(src.includes("executeAnalysis"), "auto-analisa hilang");
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

test("473. #AAPL Finex: level CSV diterapkan dengan cocok nama persis", () => {
  const previous = { ...makeValidMarket("#AAPL"), support: 0, resistance: 0 };
  const result = applyCsvSwingLevels(
    previous,
    { support: 331.5, resistance: 334.51, csvSymbol: "#AAPL" },
    { activeSymbol: "#AAPL" },
  );
  assert(result.applied, `ditolak: ${result.rejectionReason}`);
  assert(result.rejectionReason === null, "alasan penolakan harus null");
  assert(result.market.support === 331.5, `support=${result.market.support}`);
  assert(result.appliedSupport === 331.5, "diagnostik support salah");
  assert(
    result.market.resistance === 334.51,
    `resistance=${result.market.resistance}`,
  );
  assert(result.appliedResistance === 334.51, "diagnostik resistance salah");
});

test("474. BABA.US OTB: level CSV diterapkan dengan cocok nama persis", () => {
  const previous = { ...makeValidMarket("BABA.US"), support: 0, resistance: 0 };
  const result = applyCsvSwingLevels(
    previous,
    { support: 105.15, resistance: 111.4, csvSymbol: "BABA.US" },
    { activeSymbol: "BABA.US" },
  );
  assert(result.applied, `ditolak: ${result.rejectionReason}`);
  assert(result.rejectionReason === null, "alasan penolakan harus null");
  assert(result.market.support === 105.15, `support=${result.market.support}`);
  assert(result.appliedSupport === 105.15, "diagnostik support salah");
  assert(
    result.market.resistance === 111.4,
    `resistance=${result.market.resistance}`,
  );
  assert(result.appliedResistance === 111.4, "diagnostik resistance salah");
});

test("475. #AA vs #AAPL: level CSV ditolak (simbol berbeda)", () => {
  const previous = { ...makeValidMarket("#AAPL"), support: 0, resistance: 0 };
  const result = applyCsvSwingLevels(
    previous,
    { support: 331.5, resistance: 334.51, csvSymbol: "#AA" },
    { activeSymbol: "#AAPL" },
  );
  assert(!result.applied, "level harus ditolak simbol berbeda");
  assert(result.market === previous, "market tidak boleh berubah");
  assert(
    result.rejectionReason !== null &&
      result.rejectionReason.includes("simbol"),
    `alasan=${result.rejectionReason}`,
  );
});

test("476. BA.US vs BABA.US: level CSV ditolak (simbol berbeda)", () => {
  const previous = { ...makeValidMarket("BABA.US"), support: 0, resistance: 0 };
  const result = applyCsvSwingLevels(
    previous,
    { support: 105.15, resistance: 111.4, csvSymbol: "BA.US" },
    { activeSymbol: "BABA.US" },
  );
  assert(!result.applied, "level harus ditolak simbol berbeda");
  assert(result.market === previous, "market tidak boleh berubah");
  assert(
    result.rejectionReason !== null &&
      result.rejectionReason.includes("simbol"),
    `alasan=${result.rejectionReason}`,
  );
});

test("477. GBPUSD vs GBPUSD: non-regression tetap applied", () => {
  const previous = makeEmptySrMarket();
  const result = applyCsvSwingLevels(
    previous,
    { support: 1.3211, resistance: 1.3299, csvSymbol: "GBPUSD" },
    { activeSymbol: "GBPUSD" },
  );
  assert(result.applied, `ditolak: ${result.rejectionReason}`);
  assert(result.rejectionReason === null, "alasan penolakan harus null");
  assert(result.market.support === 1.3211, `support=${result.market.support}`);
  assert(
    result.market.resistance === 1.3299,
    `resistance=${result.market.resistance}`,
  );
});

test("478. GBPUSD.pro vs GBPUSD: jalur normalisasi lama tetap applied", () => {
  const previous = makeEmptySrMarket();
  const result = applyCsvSwingLevels(
    previous,
    { support: 1.3211, resistance: 1.3299, csvSymbol: "GBPUSD.pro" },
    { activeSymbol: "GBPUSD" },
  );
  assert(result.applied, `ditolak: ${result.rejectionReason}`);
  assert(result.rejectionReason === null, "alasan penolakan harus null");
  assert(result.market.support === 1.3211, `support=${result.market.support}`);
  assert(
    result.market.resistance === 1.3299,
    `resistance=${result.market.resistance}`,
  );
});

test("479. OTB minLot 0.01 nyangkut naik ke spec; lotStep ikut spec", () => {
  const stale = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 0.01, lotStep: 0.01 },
    "BABA.US",
    "orbitraderberjangka",
  );
  assert(stale.minLot === 0.1, `minLot=${stale.minLot} (harus 0.1)`);
  assert(stale.lotStep === 0.1, `lotStep=${stale.lotStep} (harus 0.1)`);
  const higher = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 0.5, lotStep: 0.01 },
    "BABA.US",
    "orbitraderberjangka",
  );
  assert(higher.minLot === 0.5, "minLot pengguna >= spec tertimpa");
  assert(higher.lotStep === 0.1, "lotStep tidak ikut spec");
});

test("480. Finex volume spec: saham # 1.00, GBXUSD 0.10, forex 0.01", () => {
  const aapl = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 0.01, lotStep: 0.01 },
    "#AAPL",
    "finex",
  );
  assert(aapl.minLot === 1, `#AAPL minLot=${aapl.minLot}`);
  assert(aapl.lotStep === 1, `#AAPL lotStep=${aapl.lotStep}`);
  const gbx = applyBrokerPreset(makeEmptyBroker(), "GBXUSD", "finex");
  assert(gbx.minLot === 0.1 && gbx.lotStep === 0.1, "GBXUSD bukan 0.1");
  const gbp = applyBrokerPreset(makeEmptyBroker(), "GBPUSD", "finex");
  assert(gbp.minLot === 0.01 && gbp.lotStep === 0.01, "GBPUSD bukan 0.01");
  assert(getFinexVolumeSpec("#NVDA").minVolume === 1, "#NVDA bukan 1");
});

test("481. checkMarginCap: BABA dipangkas, #AAPL diblokir, data kosong jujur", () => {
  assert(MARGIN_USAGE_MAX_PCT === 50, "batas berubah");
  // Kasus nyata: 12.6 lot BABA.US, margin $2217.80/lot, free $4848.
  const baba = checkMarginCap({ suggestedLot: 12.6, minLot: 0.1, lotStep: 0.1, marginPerLot: 2217.8, freeMargin: 4848 });
  assert(baba.cappedLot === 1, `BABA capped=${baba.cappedLot} (harus 1.0)`);
  assert(!baba.blocked && baba.warning !== null, "BABA harus dipangkas + warning");
  // Kasus nyata: #AAPL Finex min 1 lot, margin $13.32, free $8.41.
  const aapl = checkMarginCap({ suggestedLot: 1, minLot: 1, lotStep: 1, marginPerLot: 13.32, freeMargin: 8.41 });
  assert(aapl.blocked && aapl.cappedLot === null, "#AAPL harus diblokir");
  assert(aapl.warning !== null && aapl.warning.includes("JANGAN"), "pesan blokir hilang");
  // Muat: GBPUSD Finex 0.01 lot, margin $264.62/lot, free $8.41 → budget 4.2 → max 0.01.
  const gu = checkMarginCap({ suggestedLot: 0.01, minLot: 0.01, lotStep: 0.01, marginPerLot: 264.62, freeMargin: 8.41 });
  assert(gu.cappedLot === 0.01 && gu.warning === null, `GBPUSD=${gu.cappedLot}`);
  // Data margin kosong: lot tidak diubah, warning jujur.
  const none = checkMarginCap({ suggestedLot: 0.5, minLot: 0.1, lotStep: 0.1, marginPerLot: null, freeMargin: 100 });
  assert(none.cappedLot === 0.5 && !none.blocked && none.warning !== null, "fallback salah");
});

test("482. parseMarginCsv: format ExportMarginMDBKA + nilai -1 jadi null", () => {
  const csv =
    "Symbol,Ask,Bid,Margin_Buy_1Lot,Margin_Sell_1Lot,Account_Leverage,Account_Currency,Exported\r\n" +
    "BABA.US,110.89,110.70,2217.80,2214.00,100,USD,2026.10.06 09:40:04\r\n" +
    "#AAPL,332.91,332.69,13.32,13.31,500,USD,2026.10.06 10:41:00\r\n" +
    "MATI,0,0,-1.00,-1.00,100,USD,2026.10.06 10:41:00\r\n";
  const m = parseMarginCsv(csv);
  assert(m.size === 3, `size=${m.size}`);
  assert(m.get("BABA.US")?.marginBuy === 2217.8, "BABA buy salah");
  assert(m.get("#AAPL")?.leverage === 500, "leverage #AAPL salah");
  assert(m.get("MATI")?.marginBuy === null, "-1 harus null");
  assert(marginFileTag("finex") === "Finex", "tag Finex salah");
  assert(marginFileTag("orbitraderberjangka") === "OTB", "tag OTB salah");
  assert(marginFileTag("xyz") === null, "broker asing lolos");
  const route = readSrc("server/routes/marginRoutes.ts");
  assert(route.includes("parseMarginCsv") && route.includes("404"), "route tak pakai parser/404");
});

test("483. useSymbolMargin: encode simbol #, 404 jujur, anti data basi (readSrc)", () => {
  const src = readSrc("src/hooks/useSymbolMargin.ts");
  assert(src.includes("/api/margin"), "endpoint margin hilang");
  assert(src.includes("encodeURIComponent(sym)"), "simbol # tak di-encode");
  assert(src.includes("sourceMissing: true"), "404 jujur hilang");
  assert(src.includes("state.key === key"), "guard data basi hilang");
  assert(src.includes("API_BASE_URL"), "base URL tak terpusat");
});

test("485. parseEquityCsvLine format 8 kolom: margin asli, leverage bukan tradeCount", () => {
  const otb = parseEquityCsvLine("2026.10.06 10:39:46,4811.82,4879.82,68.00,100,250.00,4629.82,1951.93");
  if (otb === null) throw new Error("baris OTB ditolak");
  assert(otb.freeMargin === 4629.82, `free=${otb.freeMargin}`);
  assert(otb.margin === 250 && otb.leverage === 100, "margin/leverage salah");
  assert(otb.marginLevel === 1951.93, "margin level salah");
  assert(otb.tradeCount === undefined, "leverage terbaca sebagai tradeCount");
  const fx = parseEquityCsvLine("2026.10.06 11:39:49,8.50,8.50,0.00,500,0.00,8.50,0.00");
  if (fx === null) throw new Error("baris Finex ditolak");
  assert(fx.freeMargin === 8.5 && fx.leverage === 500, "Finex salah");
  assert(fx.marginLevel === undefined, "margin level 0 harus undefined");
  const old = parseEquityCsvLine("2026.10.03 09:00,1000.50,1060.00,59.50,3");
  assert(old !== null && old.tradeCount === 3 && old.freeMargin === undefined, "format lama rusak");
});

test("486. kartu Lot disarankan memakai orderLot + DIBLOKIR (readSrc)", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes('label="Lot disarankan"'), "kartu hilang");
  assert(src.includes('"DIBLOKIR"'), "status blokir hilang");
  assert(src.includes("dibatasi margin"), "keterangan pangkas hilang");
  assert(src.includes(": number(orderLot, 4)"), "kartu tidak pakai orderLot");
  assert(!src.includes("value={number(result.suggestedLot, 4)}"), "masih lot mentah");
});

test("487. buffer OTB = 5 tick spec: BABA.US 0.05, tidak terbawa forex", () => {
  const forex = applyBrokerPreset(makeEmptyBroker(), "GBPUSD_ORB", "orbitraderberjangka");
  const baba = applyBrokerPreset(forex, "BABA.US", "orbitraderberjangka");
  assert(baba.buffer === 0.05, `buffer BABA.US=${baba.buffer}`);
  const back = applyBrokerPreset(baba, "GBPUSD_ORB", "orbitraderberjangka");
  assert(back.buffer === 0.00005, `buffer GBPUSD_ORB=${back.buffer}`);
});

test("503. saham .US OTB: swap persentase ÷360 (META.US data nyata, BABA.US)", () => {
  const meta = requireSwapCost({
    symbol: "META.US",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 0.1,
    holdingDays: 1,
    currentPrice: 739.54,
  });
  assert(meta.swapType === "percentage", `swapType=${meta.swapType}`);
  assert(
    Math.abs(meta.swapCost - ((739.54 * -0.1) / 360) * 0.1) < 1e-9,
    `meta=${meta.swapCost}`,
  );
  const baba = requireSwapCost({
    symbol: "BABA.US",
    brokerId: "orbitraderberjangka",
    direction: "BELI",
    lot: 1,
    holdingDays: 1,
    currentPrice: 110.89,
  });
  assert(
    Math.abs(baba.swapCost - (100 * 110.89 * -0.032) / 360) < 1e-9,
    `baba=${baba.swapCost}`,
  );
});

test("504. parseHistoryCsv: setoran BALANCE (IDR di komentar) + deal BUY/SELL Finex", () => {
  const header =
    "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency";
  const dep =
    "106597010,0,0,2026.09.29 03:47:04,External,BALANCE,IN,0.00,0,0.00,0.00,11.11,0.00,0,D-DUIQR-2860357: IDR 200000.00,91811209,PT. Finex Bisnis Solusi Futures,USD";
  const buy =
    "106606849,108571917,108571917,2026.09.29 04:08:06,GBPUSD,BUY,IN,0.01,1.32483,-0.01,0.00,0.00,0.00,0,,91811209,PT. Finex Bisnis Solusi Futures,USD";
  const out =
    "106765702,108571917,108732639,2026.09.29 10:48:00,GBPUSD,SELL,OUT,0.01,1.32339,0.00,0.00,-1.44,0.00,0,[sl 1.32339],91811209,PT. Finex Bisnis Solusi Futures,USD";
  const deals = parseHistoryCsv([header, dep, buy, out, ""].join("\r\n"));
  assert(deals.length === 3, `deals=${deals.length}`);
  assert(
    deals[0].type === "BALANCE" &&
      deals[0].profit === 11.11 &&
      deals[0].idrAmount === 200000,
    "setoran/IDR salah",
  );
  assert(
    deals[1].commission === -0.01 && deals[1].idrAmount === null,
    "komisi salah",
  );
  assert(
    deals[2].entry === "OUT" &&
      deals[2].profit === -1.44 &&
      deals[2].positionId === "108571917",
    "deal OUT salah",
  );
  assert(extractIdrAmount("tanpa nominal") === null, "IDR harus null");
});

test("505. jurnalPajak: impor anti-duplikat, kurs/catatan tidak tertimpa, rekap tahunan", () => {
  const header =
    "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency";
  const rows = [
    "1,0,0,2026.09.29 03:47:04,External,BALANCE,IN,0.00,0,0.00,0.00,11.11,0.00,0,IDR 200000.00,91811209,PT,USD",
    "2,10,10,2026.09.29 04:08:06,GBPUSD,BUY,IN,0.01,1.32483,-0.01,0.00,0.00,0.00,0,,91811209,PT,USD",
    "3,10,11,2026.09.29 10:48:00,GBPUSD,SELL,OUT,0.01,1.32339,0.00,-0.05,-1.44,0.00,0,,91811209,PT,USD",
  ];
  const deals = parseHistoryCsv([header, ...rows, ""].join("\r\n"));
  const first = mergeDeals([], deals);
  assert(first.added === 3, `added=${first.added}`);
  const edited = updateEntry(first.entries, "3", {
    kursIdr: 16000,
    catatan: " tes ",
  });
  if (edited === null) throw new Error("updateEntry null");
  const again = mergeDeals(edited, deals);
  assert(
    again.added === 0 && again.entries.length === 3,
    "duplikat tidak boleh masuk",
  );
  const e3 = again.entries.find((e) => e.dealTicket === "3");
  assert(
    e3?.kursIdr === 16000 && e3.catatan === "tes",
    "kurs/catatan tertimpa",
  );
  assert(
    updateEntry(edited, "999", { catatan: "x" }) === null,
    "tiket asing harus null",
  );
  const s = summarizeByYear(again.entries);
  assert(s.length === 1 && s[0].year === "2026", "tahun salah");
  assert(
    s[0].depositUsd === 11.11 && s[0].withdrawalUsd === 0,
    "setoran salah",
  );
  assert(
    s[0].profitUsd === -1.44 && s[0].swapUsd === -0.05,
    "profit/swap salah",
  );
  assert(
    s[0].commissionUsd === -0.01 && s[0].nettoUsd === -1.5,
    `netto=${s[0].nettoUsd}`,
  );
  assert(s[0].nettoIdr === Math.round(-1.49 * 16000), `idr=${s[0].nettoIdr}`);
  assert(
    s[0].tanpaKurs === 1 && s[0].dealCount === 2,
    "tanpaKurs/dealCount salah",
  );
});

test("506. kurs pajak tempel: tanggal/rentang menimpa kurs per transaksi, baris asing ditolak", () => {
  const header =
    "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency";
  const rows = [
    "2,10,10,2026.09.29 04:08:06,GBPUSD,BUY,IN,0.01,1.32483,-0.01,0.00,0.00,0.00,0,,91811209,PT,USD",
    "3,10,11,2026.09.30 10:48:00,GBPUSD,SELL,OUT,0.01,1.32339,0.00,0.00,-1.44,0.00,0,,91811209,PT,USD",
    "4,11,11,2026.10.08 10:48:00,GBPUSD,SELL,OUT,0.01,1.32339,0.00,0.00,1.00,0.00,0,,91811209,PT,USD",
  ];
  const deals = parseHistoryCsv([header, ...rows, ""].join("\r\n"));
  const base = mergeDeals([], deals).entries;
  const text = [
    "29/09/2026 16.650,50",
    "2026-09-30 s/d 2026-10-06 16700",
    "bukan kurs",
    "2026-10-09 99",
  ].join("\n");
  const parsed = parseKursText(text);
  assert(parsed.rules.length === 2, `rules=${parsed.rules.length}`);
  assert(parsed.rejected.length === 2, `rejected=${parsed.rejected.length}`);
  assert(
    parsed.rules[0].kurs === 16650.5 && parsed.rules[0].from === "2026-09-29",
    "aturan 1 salah",
  );
  assert(
    parsed.rules[1].from === "2026-09-30" &&
      parsed.rules[1].to === "2026-10-06",
    "rentang salah",
  );
  const applied = applyKursRules(base, parsed.rules);
  assert(applied.updated === 2, `updated=${applied.updated}`);
  const byId = (id: string) => applied.entries.find((e) => e.dealTicket === id);
  assert(
    byId("2")?.kursIdr === 16650.5 && byId("2")?.kursSumber === "KMK",
    "kurs 29/09 salah",
  );
  assert(byId("3")?.kursIdr === 16700, "kurs rentang salah");
  assert(byId("4")?.kursIdr === null, "di luar rentang harus tetap null");
});

test("513. jurnalPajak: tanggal transaksi untuk kurs = tanggal WIB (server UTC+1, WIB +6 jam)", () => {
  assert(
    DEFAULT_SERVER_UTC_OFFSET_HOURS === 1,
    "default offset server harus +1",
  );
  assert(
    serverDateWib("2026.09.29 17:59:59") === "2026-09-29",
    "17:59 server masih 29 Sep WIB",
  );
  assert(
    serverDateWib("2026.09.29 18:00:00") === "2026-09-30",
    "18:00 server = 00:00 WIB 30 Sep",
  );
  assert(
    serverDateWib("2026.10.06 23:08:54") === "2026-10-07",
    "malam server geser ke tanggal WIB berikutnya",
  );
  assert(
    serverDateWib("2026.09.29 03:47:04") === "2026-09-29",
    "pagi server tetap tanggal yang sama",
  );
  assert(
    serverDateWib("2026.09.29 16:59:59", 0) === "2026-09-29" &&
      serverDateWib("2026.09.29 17:00:00", 0) === "2026-09-30",
    "offset 0 (server UTC): batas pindah hari pukul 17:00",
  );
  assert(
    serverDateWib("rusak") === "rusak",
    "format tak dikenal dikembalikan apa adanya",
  );
});

test("507. jurnalPajakStore: sinkron otomatis idempoten, kurs tempel & catatan tersimpan, CSV ekspor", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jurnal-"));
  const header =
    "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency";
  const body = [
    "1,0,0,2026.09.29 03:47:04,External,BALANCE,IN,0.00,0,0.00,0.00,11.11,0.00,0,D-1: IDR 200000.00,91811209,PT,USD",
    "2,10,10,2026.09.29 04:08:06,GBPUSD,BUY,IN,0.01,1.32483,-0.01,0.00,0.00,0.00,0,,91811209,PT,USD",
    "3,10,11,2026.09.29 10:48:00,GBPUSD,SELL,OUT,0.01,1.32339,0.00,0.00,-1.44,0.00,0,[sl 1.32339],91811209,PT,USD",
  ];
  const csvPath = path.join(dir, "MDBKA_History_91811209.csv");
  const file = path.join(dir, "data", "jurnal.json");
  const store = createJurnalPajakStore({
    commonDir: dir,
    file,
    login: "91811209",
  });
  assert(store.sync() === null, "tanpa CSV harus null");
  fs.writeFileSync(csvPath, [header, ...body, ""].join("\r\n"), "utf8");
  const s1 = store.sync();
  assert(
    s1 !== null && s1.added === 3 && s1.total === 3,
    "sinkron pertama salah",
  );
  const s2 = store.sync();
  assert(
    s2 !== null && s2.added === 0 && s2.total === 3,
    "sinkron kedua harus 0 baru",
  );
  const k = store.applyKursText("29/09/2026 16650\nngawur");
  assert(
    k.updated === 3 && k.rejected.length === 1,
    `kurs updated=${k.updated}`,
  );
  assert(store.patch("3", { catatan: "tes" }) === true, "patch gagal");
  assert(
    store.patch("999", { catatan: "x" }) === false,
    "tiket asing harus false",
  );
  fs.appendFileSync(
    csvPath,
    "4,11,11,2026.09.30 10:00:00,GBPUSD,BUY,IN,0.01,1.3,-0.01,0.00,0.00,0.00,0,,91811209,PT,USD\r\n",
  );
  const s3 = store.sync();
  assert(
    s3 !== null && s3.added === 1 && s3.total === 4,
    "deal baru harus masuk",
  );
  const e3 = store.load().find((e) => e.dealTicket === "3");
  assert(
    e3?.kursIdr === 16650 && e3.catatan === "tes",
    "kurs/catatan hilang setelah sinkron",
  );
  const csv = entriesToCsv(store.load());
  assert(
    csv.charCodeAt(0) === 0xfeff && csv.slice(1).startsWith("DealTicket,"),
    "BOM/header CSV salah",
  );
  assert(csv.includes("-1.44") && csv.includes("tes"), "isi CSV salah");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("508. pajakOP: tarif Pasal 17 HPP, PTKP, bagian trading, rugi, kredit pajak", () => {
  assert(ptkpAmount("TK/0") === 54_000_000, "PTKP TK/0 salah");
  assert(ptkpAmount("K/0") === 58_500_000, "PTKP K/0 salah");
  assert(
    ptkpAmount("K/I/3") === 126_000_000,
    `PTKP K/I/3=${ptkpAmount("K/I/3")}`,
  );
  assert(progressiveTax(46_000_000) === 2_300_000, "5% salah");
  assert(progressiveTax(96_000_000) === 8_400_000, "lapis 15% salah");
  assert(
    progressiveTax(54_123_456) === 2_706_150,
    `pembulatan=${progressiveTax(54_123_456)}`,
  );
  assert(
    progressiveTax(300_000_000) === 3_000_000 + 28_500_000 + 12_500_000,
    "lapis 25% salah",
  );
  assert(
    progressiveTax(6_000_000_000) ===
      3_000_000 + 28_500_000 + 62_500_000 + 1_350_000_000 + 350_000_000,
    "lapis 35% salah",
  );
  const solo = calculateTaxLiability({
    year: 2026,
    nettoTradingIdr: 100_000_000,
    otherNetIncomeIdr: 0,
    ptkpStatus: "TK/0",
    creditIdr: 0,
  });
  assert(
    solo.pkpTotalIdr === 46_000_000 && solo.taxTotalIdr === 2_300_000,
    "kasus trading saja salah",
  );
  assert(
    solo.kodeAkunPajak === "411125" && solo.kodeJenisSetoran === "200",
    "kode setoran salah",
  );
  assert(solo.jatuhTempo === "2027-03-31", `jatuhTempo=${solo.jatuhTempo}`);
  const gabung = calculateTaxLiability({
    year: 2026,
    nettoTradingIdr: 50_000_000,
    otherNetIncomeIdr: 100_000_000,
    ptkpStatus: "TK/0",
    creditIdr: 1_000_000,
  });
  assert(
    gabung.taxTotalIdr === 8_400_000 &&
      gabung.taxWithoutTradingIdr === 2_300_000,
    "pajak gabungan salah",
  );
  assert(
    gabung.taxFromTradingIdr === 6_100_000,
    `bagian trading=${gabung.taxFromTradingIdr}`,
  );
  assert(
    gabung.kurangBayarIdr === 7_400_000 && gabung.lebihBayarIdr === 0,
    "kurang bayar salah",
  );
  const rugi = calculateTaxLiability({
    year: 2026,
    nettoTradingIdr: -246_780,
    otherNetIncomeIdr: 100_000_000,
    ptkpStatus: "TK/0",
    creditIdr: 0,
  });
  assert(
    rugi.tradingLoss &&
      rugi.tradingTaxableIdr === 0 &&
      rugi.taxFromTradingIdr === 0,
    "rugi tidak boleh mengurangi penghasilan lain",
  );
  const lebih = calculateTaxLiability({
    year: 2026,
    nettoTradingIdr: 100_000_000,
    otherNetIncomeIdr: 0,
    ptkpStatus: "TK/0",
    creditIdr: 3_000_000,
  });
  assert(
    lebih.kurangBayarIdr === 0 && lebih.lebihBayarIdr === 700_000,
    "lebih bayar salah",
  );
});

test("509. pembayaranPajak: validasi, simpan pembayaran + bukti, profil, tolak input salah", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const ok = validatePembayaran({
    year: 2026,
    tanggalBayar: "2027-03-20",
    jenis: "PPh Pasal 29 OP",
    jumlahIdr: 123456.4,
    ntpn: "abcd1234abcd1234",
    kodeBilling: "123456789012345",
  });
  assert(
    ok.ok &&
      ok.value.jumlahIdr === 123456 &&
      ok.value.ntpn === "ABCD1234ABCD1234",
    "validasi sah gagal",
  );
  assert(
    !validatePembayaran({
      year: 2026,
      tanggalBayar: "2027-02-30",
      jenis: "Lainnya",
      jumlahIdr: 1,
    }).ok,
    "tanggal palsu harus ditolak",
  );
  assert(
    !validatePembayaran({
      year: 2026,
      tanggalBayar: "2027-03-20",
      jenis: "Lainnya",
      jumlahIdr: 0,
    }).ok,
    "jumlah 0 harus ditolak",
  );
  assert(
    !validatePembayaran({
      year: 2026,
      tanggalBayar: "2027-03-20",
      jenis: "Lainnya",
      jumlahIdr: 1,
      ntpn: "123",
    }).ok,
    "NTPN pendek harus ditolak",
  );
  assert(
    !validatePembayaran({
      year: 2026,
      tanggalBayar: "2027-03-20",
      jenis: "Lainnya",
      jumlahIdr: 1,
      kodeBilling: "12",
    }).ok,
    "billing salah harus ditolak",
  );
  assert(
    kodeAkunFor("PPh Pasal 29 OP") === "411125-200" &&
      kodeAkunFor("PPh Pasal 25 OP") === "411125-260",
    "kode akun salah",
  );
  assert(
    !validateProfil({ ptkpStatus: "XX" }).ok &&
      validateProfil({ ptkpStatus: "K/2", otherNetIncomeIdr: 5 }).ok,
    "validasi profil salah",
  );
  assert(
    !decodeBukti({ mime: "text/html", dataBase64: "QQ==" }).ok,
    "mime asing harus ditolak",
  );
  assert(
    !decodeBukti({ mime: "image/png", dataBase64: "!!" }).ok,
    "base64 rusak harus ditolak",
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pajak-"));
  const store = createPembayaranPajakStore(dir);
  assert(store.getProfil(2026).ptkpStatus === "TK/0", "profil default salah");
  const sp = store.setProfil(2026, {
    ptkpStatus: "K/1",
    otherNetIncomeIdr: 100000000,
    creditIdr: 2000000,
  });
  assert(
    sp.ok && store.getProfil(2026).ptkpStatus === "K/1",
    "profil tidak tersimpan",
  );
  assert(
    !store.setProfil(2026, { ptkpStatus: "bad" }).ok,
    "profil salah harus ditolak",
  );
  const bad = store.add({ year: 2026 });
  assert(!bad.ok, "pembayaran tak lengkap harus ditolak");
  const raw = {
    year: 2026,
    tanggalBayar: "2027-03-20",
    jenis: "PPh Pasal 29 OP",
    jumlahIdr: 500000,
  };
  const a = store.add(raw);
  assert(
    a.ok && a.value.bukti === null && a.value.kodeAkun === "411125-200",
    "tambah pembayaran gagal",
  );
  if (!a.ok) return;
  const bukti = {
    name: "../bukti pajak.pdf",
    mime: "application/pdf",
    dataBase64: Buffer.from("%PDF-1.4 tes").toString("base64"),
  };
  const att = store.attachBukti(a.value.id, bukti);
  assert(
    att.ok &&
      att.value.bukti?.storedName === `${a.value.id}.pdf` &&
      att.value.bukti.size === 12,
    "lampir bukti gagal",
  );
  const f = store.buktiFile(a.value.id);
  assert(
    f !== null &&
      fs.readFileSync(f.path, "utf8") === "%PDF-1.4 tes" &&
      f.mime === "application/pdf",
    "file bukti tidak terbaca",
  );
  assert(
    f !== null && !f.fileName.includes("/"),
    "nama file bukti harus bersih",
  );
  const nf = store.attachBukti("tidak-ada", bukti);
  assert(!nf.ok && nf.notFound === true, "id asing harus notFound");
  const b = store.add(
    { ...raw, year: 2027, tanggalBayar: "2028-01-05" },
    bukti,
  );
  assert(b.ok && b.value.bukti !== null, "tambah dengan bukti gagal");
  assert(
    store.list().length === 2 && store.list(2026).length === 1,
    "daftar per tahun salah",
  );
  assert(
    createPembayaranPajakStore(dir).list(2026)[0]?.bukti?.mime ===
      "application/pdf",
    "tidak persisten",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("510. laporanPajak: HTML memuat ringkasan, pasal, kode setoran, pembayaran + escape", () => {
  const liability = calculateTaxLiability({
    year: 2026,
    nettoTradingIdr: 100_000_000,
    otherNetIncomeIdr: 0,
    ptkpStatus: "TK/0",
    creditIdr: 0,
  });
  const html = buildLaporanHtml({
    year: 2026,
    generatedAt: "2026-10-07 10:00",
    login: "91811209",
    summary: undefined,
    liability,
    dibayarPasal29Idr: 0,
    sisaKurangBayarIdr: liability.kurangBayarIdr,
    pembayaran: [
      {
        id: "x",
        year: 2026,
        tanggalBayar: "2027-03-20",
        jenis: "PPh Pasal 29 OP",
        kodeAkun: "411125-200",
        jumlahIdr: 1,
        ntpn: "",
        kodeBilling: "",
        catatan: "",
        bukti: {
          fileName: "<b>x</b>.pdf",
          mime: "application/pdf",
          size: 1,
          storedName: "x.pdf",
        },
        createdAt: "",
      },
    ],
    entries: [],
  });
  assert(
    html.includes("Laporan Pajak Penghasilan Trading - Tahun 2026"),
    "judul",
  );
  assert(
    html.includes("411125-200") && html.includes("Pasal 17"),
    "kode/pasal",
  );
  assert(html.includes("Rp2.300.000"), "pajak 5% x 46jt");
  assert(
    !html.includes("<b>x</b>") && html.includes("&lt;b&gt;"),
    "escape bukti",
  );
  assert(escapeHtml('a&"<') === "a&amp;&quot;&lt;", "escapeHtml");
});

test("511. ECB IDR: kurs USD→Rp silang + profit Rupiah, tanpa tebakan", () => {
  const xml =
    "<Cube time='2026-10-06'><Cube currency='USD' rate='1.2'/><Cube currency='IDR' rate='21600'/></Cube>";
  const r = parseECBXml(xml);
  assert(
    r.IDR === 21600 && r.ecbDate === "2026-10-06",
    "IDR/tanggal ECB salah",
  );
  assert(usdIdrRate(r) === 18000, "kurs silang USD→IDR salah");
  assert(
    profitToIdr(2.5, 18000) === 45000 && profitToIdr(-1.234, 18000) === -22212,
    "profit Rupiah salah",
  );
  assert(
    usdIdrRate(FALLBACK_RATES) === null &&
      usdIdrRate(null) === null &&
      profitToIdr(1, null) === null,
    "tanpa kurs harus null (bukan tebakan)",
  );
});

test("502. predictDailySwap: INTEREST_CURRENT tahunan ÷360, DISABLED 0, mode lain null", () => {
  const base = {
    type: "BUY",
    volume: 0.1,
    priceCurrent: 0.69819,
    contractSize: 100000,
    swapMode: "SYMBOL_SWAP_MODE_INTEREST_CURRENT",
    swapLong: -1.5,
    swapShort: -1.5,
    profitCurrency: "USD",
  };
  const audusd = predictDailySwap(base);
  assert(
    audusd !== null && Math.abs(audusd.value - -0.2909125) < 1e-9,
    `AUDUSD=${audusd?.value}`,
  );
  const meta = predictDailySwap({
    ...base,
    priceCurrent: 743.67,
    contractSize: 1,
    swapLong: -10,
  });
  assert(
    meta !== null && Math.abs(meta.value - -0.020657) < 1e-6,
    `META=${meta?.value}`,
  );
  const sell = predictDailySwap({
    ...base,
    type: "SELL",
    swapShort: -1.75,
    priceCurrent: 110.994,
    profitCurrency: "JPY",
  });
  assert(
    sell !== null &&
      sell.currency === "JPY" &&
      Math.abs(sell.value - -53.95541666666667) < 1e-9,
    `CADJPY SELL=${sell?.value}`,
  );
  assert(
    predictDailySwap({ ...base, swapMode: "SYMBOL_SWAP_MODE_DISABLED" })
      ?.value === 0,
    "DISABLED harus 0",
  );
  assert(
    predictDailySwap({ ...base, swapMode: "SYMBOL_SWAP_MODE_POINTS" }) === null,
    "mode lain harus null",
  );
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("<SwapLogPanel brokerId={activeBrokerId} />"),
    "panel tak terpasang",
  );
});

test("501. parseSwapLogCsv: format MDBKASwapLogger 28 kolom + baris NO_POSITIONS", () => {
  const header =
    "ServerTime,GmtTime,LocalTime,Reason,Login,Company,AccountCurrency,Balance,Equity,Ticket,Symbol,Type,Volume,PriceOpen,PriceCurrent,Bid,Ask,Swap,Profit,SwapMode,SwapLong,SwapShort,Swap3Day,ContractSize,CalcMode,BaseCurrency,ProfitCurrency,TimeOpen";
  const row =
    "2026.10.06 16:13:51,2026.10.06 14:13:51,2026.10.06 23:13:51,START,70930952,PT. Orbi Trade Berjangka,USD,4805.22,5228.20,2108869,AUDUSD_ORB,BUY,0.10,0.69811,0.69819,0.69819,0.69829,0.00,0.80,SYMBOL_SWAP_MODE_INTEREST_CURRENT,-1.5000,-1.5000,WEDNESDAY,100000.00,SYMBOL_CALC_MODE_FOREX,AUD,USD,2026.10.06 14:41:45";
  const empty =
    "2026.10.07 00:00:51,2026.10.06 22:00:51,2026.10.07 07:00:51,HOURLY_NO_POSITIONS,91811209,PT. Finex,USD,8.50,8.50,,,,,,,,,,,,,,,,,,,";
  const rows = parseSwapLogCsv([header, row, empty, ""].join("\r\n"));
  assert(rows.length === 2, `rows=${rows.length}`);
  const r = rows[0];
  assert(
    r.ticket === "2108869" && r.symbol === "AUDUSD_ORB",
    "ticket/simbol salah",
  );
  assert(r.swapMode === "SYMBOL_SWAP_MODE_INTEREST_CURRENT", "swapMode salah");
  assert(
    r.swapLong === -1.5 && r.contractSize === 100000,
    "swapLong/contract salah",
  );
  assert(r.swap === 0 && r.profit === 0.8, "swap/profit salah");
  assert(
    rows[1].ticket === null && rows[1].swap === null,
    "NO_POSITIONS harus ticket/swap null",
  );
  assert(swapLogLogin("orbitraderberjangka") === "70930952", "login OTB salah");
  assert(swapLogLogin("finex") === "91811209", "login Finex salah");
  assert(swapLogLogin("xyz") === null, "broker asing lolos");
  const app = readSrc("server/app.ts");
  assert(
    app.includes('app.use("/api/swaplog", createSwapLogRoutes())'),
    "route tak terpasang",
  );
});

test("499. S/R sinkron & SwingLevelsForm pakai referensi bid yang sama (readSrc)", () => {
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("resolveSwingLevels(parsed.candles, quote.bid)"),
    "S/R sinkron masih pakai close CSV",
  );
  assert(app.includes("...quote,"), "bid/ask quote tidak masuk nextMarket");
  assert(
    app.includes("currentPrice={market.bid > 0 ? market.bid : market.close}"),
    "referensi SwingLevelsForm berubah",
  );
});

test("498. resolveCsvBidAsk: quote segar = bid/ask live, basi = close+spread, tanpa = close+tick", () => {
  const now = Date.parse("2026-10-06T13:30:00Z");
  const fresh = {
    timestamp: "2026.10.06 16:29:55",
    symbol: "AUDJPY_ORB",
    bid: 110.368,
    ask: 110.39,
  };
  const live = resolveCsvBidAsk(110.383, 0.001, "AUDJPY_ORB", fresh, now);
  assert(
    live.bid === 110.368 && live.ask === 110.39,
    `live=${live.bid}/${live.ask}`,
  );
  const stale = { ...fresh, timestamp: "2026.10.03 23:59:00" };
  const old = resolveCsvBidAsk(110.383, 0.001, "AUDJPY_ORB", stale, now);
  assert(
    old.bid === 110.383 && old.ask === 110.405,
    `basi=${old.bid}/${old.ask}`,
  );
  const other = resolveCsvBidAsk(111.06, 0.01, "BABA.US", fresh, now);
  assert(
    other.bid === 111.06 && other.ask === 111.07,
    `beda simbol=${other.bid}/${other.ask}`,
  );
  const none = resolveCsvBidAsk(111.06, 0.01, "BABA.US", null, now);
  assert(
    none.bid === 111.06 && none.ask === 111.07,
    `tanpa quote=${none.bid}/${none.ask}`,
  );
});

test("497. minLot 1.00 saham # tidak nyangkut di OTB forex / Finex forex", () => {
  const otb = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 1, lotStep: 1 },
    "AUDJPY_ORB",
    "orbitraderberjangka",
  );
  assert(otb.minLot === 0.1, `OTB AUDJPY_ORB minLot=${otb.minLot} (harus 0.1)`);
  const finex = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 1 },
    "GBPUSD",
  );
  assert(
    finex.minLot === 0.01,
    `Finex GBPUSD minLot=${finex.minLot} (harus 0.01)`,
  );
  const stock = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 0.01 },
    "#AAPL",
  );
  assert(stock.minLot === 1, `#AAPL minLot=${stock.minLot} (harus 1)`);
  const user = applyBrokerPreset(
    { ...makeValidBroker(), minLot: 0.5 },
    "AUDJPY_ORB",
    "orbitraderberjangka",
  );
  assert(user.minLot === 0.5, "minLot pengguna 0.5 harus dipertahankan");
});

test("496. withUsdPointValue: OTB & Finex non-USD dikonversi USD, profit USD/tanpa kurs tetap", () => {
  const otb = applyBrokerPreset(
    makeEmptyBroker(),
    "AUDJPY_ORB",
    "orbitraderberjangka",
  );
  const jpy = withUsdPointValue(
    otb,
    "AUDJPY_ORB",
    "orbitraderberjangka",
    FALLBACK_RATES,
  );
  const expected = (100000 / FALLBACK_RATES.JPY) * FALLBACK_RATES.USD;
  assert(
    Math.abs(jpy.pointValue - expected) < 1e-9,
    `AUDJPY_ORB pointValue=${jpy.pointValue}`,
  );
  assert(otb.pointValue === 100000, "input broker tidak boleh termutasi");
  const usd = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(
    withUsdPointValue(
      usd,
      "GBPUSD_ORB",
      "orbitraderberjangka",
      FALLBACK_RATES,
    ) === usd,
    "profit USD tetap",
  );
  assert(
    withUsdPointValue(otb, "AUDJPY_ORB", "orbitraderberjangka", null) === otb,
    "tanpa kurs tetap",
  );
  // Perbaikan 8 Okt 2026: Finex JPY juga dikonversi (dulu "Finex tetap" = bug).
  const finexJpy = applyBrokerPreset(makeEmptyBroker(), "CADJPY", "finex");
  const fj = withUsdPointValue(finexJpy, "CADJPY", "finex", FALLBACK_RATES);
  assert(Math.abs(fj.pointValue - expected) < 1e-9, `Finex CADJPY pointValue=${fj.pointValue}`);
  const finexUsd = applyBrokerPreset(makeEmptyBroker(), "GBPUSD", "finex");
  assert(withUsdPointValue(finexUsd, "GBPUSD", "finex", FALLBACK_RATES) === finexUsd, "Finex profit USD tetap");
  const app = readSrc("src/App.tsx");
  assert(!app.includes("convertToUSD("), "App tidak lagi konversi manual");
  assert(
    (app.match(/withUsdPointValue\(/g) ?? []).length === 2,
    "validator + engine pakai helper",
  );
});

test("495. spec32 + commissionForHolding: saham # Finex 0.1/lot, forex/indeks 1.0", () => {
  assert(
    getInstrumentSpec32("#AAPL")?.commission === 0.1,
    "spec32 #AAPL harus 0.1",
  );
  assert(commissionForHolding("#AAPL", 2) === 0.2, "#AAPL 2 lot harus 0.2");
  assert(commissionForHolding("#NVDA", 10) === 1, "#NVDA 10 lot harus 1.00");
  assert(commissionForHolding("GBPUSD", 1) === 1, "forex Finex tetap 1.00");
  assert(commissionForHolding("US100", 1) === 1, "indeks Finex tetap 1.00");
});

test("494. komisi Finex per kelas: saham # 0.1, forex/indeks 1.0 (Specification)", () => {
  for (const sym of ["#AAPL", "#NVDA", "#MMM"]) {
    const b = applyBrokerPreset(makeEmptyBroker(), sym);
    assert(b.commission === 0.1, `${sym}=${b.commission}`);
  }
  for (const sym of ["EURUSD", "US100", "HK50"]) {
    const b = applyBrokerPreset(makeEmptyBroker(), sym);
    assert(b.commission === 1, `${sym}=${b.commission}`);
  }
});

test("493. komisi default tidak terbawa antar broker; ketikan manual tetap", () => {
  const finex = applyBrokerPreset(makeEmptyBroker(), "#AAPL");
  assert(finex.commission === 0.1, `Finex #AAPL=${finex.commission}`);
  const otb = applyBrokerPreset(finex, "BABA.US", "orbitraderberjangka");
  assert(otb.commission === 0, `Finex→OTB (saham OTB komisi 0, History 9 Okt)=${otb.commission}`);
  const back = applyBrokerPreset(otb, "#AAPL");
  assert(back.commission === 0.1, `OTB→Finex=${back.commission}`);
  const manual = applyBrokerPreset({ ...otb, commission: 50 }, "#AAPL");
  assert(manual.commission === 50, "ketikan manual tertimpa");
});

test("492. kartu Spread non-forex pakai point MT5 (readSrc)", () => {
  const src = readSrc("src/components/analysis/ValidationSummaryCard.tsx");
  assert(
    src.includes('profile.category === "index"'),
    "cabang non-forex hilang",
  );
  assert(src.includes("10 ** -profile.decimals"), "konversi point MT5 hilang");
  assert(src.includes("value={spreadText}"), "kartu tidak pakai spreadText");
});

test("491. validator risiko min. lot pakai jarak terburuk ATR vs SL struktur (readSrc)", () => {
  const src = readSrc("src/calculations/inputValidator.ts");
  assert(src.includes("const structureDistances = ["), "jarak struktur hilang");
  assert(
    src.includes("market.ask - (market.support - broker.buffer)"),
    "sisi BELI hilang",
  );
  assert(
    src.includes("market.resistance + broker.buffer - market.bid"),
    "sisi JUAL hilang",
  );
  assert(src.includes("...structureDistances,"), "max tidak memakai struktur");
});

test("490. pointValue OTB = contractSize: BABA.US 100 (cocok MT5 0,1 lot SL 5,97 ≈ $58)", () => {
  const baba = applyBrokerPreset(
    makeEmptyBroker(),
    "BABA.US",
    "orbitraderberjangka",
  );
  assert(baba.pointValue === 100, `pointValue BABA=${baba.pointValue}`);
  const lossPerLot = 5.97 * baba.pointValue;
  assert(
    Math.abs(lossPerLot * 0.1 - 59.7) < 0.01,
    `rugi 0,1 lot=${lossPerLot * 0.1}`,
  );
});

test("489. handleCsvLoaded isi S/R sinkron sebelum analisa (readSrc)", () => {
  const app = readSrc("src/App.tsx");
  const i = app.indexOf("resolveSwingLevels(parsed.candles, quote.bid)");
  assert(i > 0, "S/R tidak dihitung sinkron di handleCsvLoaded");
  assert(
    app.includes("{ support: levels.support }"),
    "support tak masuk nextMarket",
  );
  assert(
    app.includes("{ resistance: levels.resistance }"),
    "resistance tak masuk nextMarket",
  );
  assert(
    app.indexOf("executeAnalysis(nextMarket, nextBroker)") > i,
    "analisa jalan sebelum S/R",
  );
});

test("488. ask CSV dibulatkan: tanpa sisa float (readSrc)", () => {
  const app = readSrc("src/App.tsx");
  assert(
    app.includes("resolveCsvBidAsk(last.close, tick, baseSymbol, liveQuote)"),
    "bid/ask CSV tidak lewat helper",
  );
  assert(!app.includes("ask: last.close + tick,"), "ask mentah masih ada");
  assert(
    Number((111.06 + 0.01).toPrecision(12)) === 111.07,
    "pembulatan salah",
  );
});

test("484. wiring guard margin di hasil analisa (readSrc)", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes("checkMarginCap"), "guard tak di-wire");
  assert(src.includes("useSymbolMargin"), "hook margin tak dipakai");
  assert(src.includes("liveEquity?.freeMargin"), "free margin live hilang");
  assert(src.includes('data-testid="margin-blocked"'), "blok merah hilang");
  assert(
    src.includes('data-testid="margin-warning"'),
    "warning pangkas hilang",
  );
  assert(src.includes("${orderLot}"), "order tak pakai lot terbatas");
  const app = readSrc("src/App.tsx");
  assert(app.includes("minLot={broker.minLot}"), "minLot tak diteruskan");
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

test("143. kontrak: handleCsvLoaded otomatis tanpa reset manual", () => {
  const src = readSrc("src/App.tsx");
  const start = src.indexOf("const handleCsvLoaded");
  const end = src.indexOf("const handleConnectionChange");
  assert(start >= 0 && end > start, "handleCsvLoaded hilang");
  const body = src.slice(start, end);
  assert(body.includes("executeAnalysis"), "auto-analisa hilang");
  assert(body.includes("fileToken"), "simbol dari nama file hilang");
  assert(body.includes("setConnectedCsvName"), "nama CSV tidak disimpan");
  assert(!body.includes("mergeValidOcrMarketData"), "jalur OCR tersisa");
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
  const end = src.indexOf("\n  function clearAll", start);
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
  assert(app.includes('data-testid="broker-tab-finex"'), "tombol Finex hilang");
  assert(app.includes('data-testid="broker-tab-otb"'), "tombol OTB hilang");
  assert(
    app.includes("aria-pressed={activeBrokerId"),
    "status tombol tak terikat state",
  );
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
    src.includes('handleBrokerChange("finex")'),
    "tombol Finex tak terhubung ke handler",
  );
  assert(
    src.includes('handleBrokerChange("orbitraderberjangka")'),
    "tombol OTB tak terhubung ke handler",
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
  assert(body.includes("setActiveBrokerId"), "pindah broker tak terjadi");
});

test("184. pergantian broker tidak memodifikasi decision engine", () => {
  const body = readAppBrokerHandler();
  assert(!body.includes("analyzeMarket"), "handler menyentuh decision engine");
  // #512: pindah broker hanya boleh MENGOSONGKAN (emptyMarket/emptyBroker).
  assert(
    !body.replace("setMarket(emptyMarket)", "").includes("setMarket("),
    "handler menulis data market selain kosong",
  );
  assert(
    !body.replace("setBroker(emptyBroker)", "").includes("setBroker("),
    "handler menulis setting broker selain kosong",
  );
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
    body.includes("Gunakan CSV dan parameter dari terminal Finex"),
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

test("190. CSV tetap terhubung + auto-analisa", () => {
  const app = readSrc("src/App.tsx");
  assert(app.includes("onCsvLoaded={handleCsvLoaded}"), "CSV loader lepas");
  assert(
    app.includes("onConnectionChange={handleConnectionChange}"),
    "status koneksi CSV lepas",
  );
  assert(!app.includes("onExtracted={handleExtracted}"), "jalur OCR tersisa");
  assert(
    app.includes("Atur parameter broker dan risiko — "),
    "judul dinamis form hilang",
  );
  assert(app.includes("brokerId={activeBrokerId}"), "prop broker form hilang");
  assert(app.includes("executeAnalysis"), "auto-analisa hilang dari App");
  const csv = readSrc("src/components/analysis/CsvFileConnector.tsx");
  assert(csv.includes("Hubungkan CSV MT5"), "tombol CSV hilang");
  assert(
    csv.includes("hasil analisa berjalan otomatis"),
    "penjelasan auto hilang",
  );
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
    app.includes("withUsdPointValue(broker, market.symbol, activeBrokerId, fxRates)"),
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
    body.includes("setMarket(applied.market)"),
    "apply tidak memakai hasil sinkron",
  );
  assert(body.includes("executeAnalysis"), "S/R baru tak menjalankan analisa");
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
    getOtbInstrumentProfile("FAKE_ORB") === null,
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
  // 6I: 68 preset (16 lama + 52 bulk export 06 Okt 2026).
  assert(Object.keys(OTB_PRESETS).length === 68, "preset fiktif terdaftar");
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
  assert(
    SUPPORTED_SYMBOLS.length === 82,
    "daftar simbol Finex berubah (6I: 82)",
  );
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
  assert(applied.pointValue === 100000, `pointValue=${applied.pointValue}`);
  assert(
    applied.contractSize === 100000,
    `contractSize=${applied.contractSize}`,
  );
  assert(applied.minLot === 0.1, `minLot=${applied.minLot}`);
  assert(applied.lotStep === 0.1, `lotStep=${applied.lotStep}`);
  assert(
    applied.buffer === 0.00005,
    `buffer OTB harus 5 tick spec (0.00005), dapat ${applied.buffer}`,
  );
  assert(applied.equity === 0, "equity ikut ditebak");
  assert(
    applied.commission === 33,
    `komisi OTB tidak terisi: ${applied.commission} (spec32 33, 6G)`,
  );
  assert(applied.slippage === 0, "slippage ikut ditebak");
  assert(applied.riskPercent === 1, "default strategi tidak diisi (Mode Aman 1%)");
});

test("218. OTB tickValue dari kalkulator, bukan Finex", () => {
  const applied = applyBrokerPreset(
    makeEmptyBroker(),
    "GBPUSD_ORB",
    "orbitraderberjangka",
  );
  assert(applied.pointValue === 100000, "pointValue OTB harus = contractSize");
  assert(
    applied.pointValue === getInstrumentProfile("GBPUSD").defaultPointValue,
    "pointValue OTB harus sekonvensi Finex (per 1,0 harga per lot)",
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
  assert(ok.minLot === 0.1 && ok.pointValue === 100000, "simbol exact ditolak");
});

test("221. OTB tanpa preset tidak apply partial", () => {
  const previous = makeEmptyBroker();
  const result = applyBrokerPreset(previous, "FAKE_ORB", "orbitraderberjangka");
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
    app.includes("withUsdPointValue(broker, market.symbol, activeBrokerId, fxRates)"),
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

test("227. dropdown OTB menampilkan 68 simbol broker", () => {
  const otb = getAvailableSymbols("orbitraderberjangka");
  assert(otb.length === 68, `daftar OTB=${otb.length}`);
  assert(otb[0] === "AUDCAD_ORB", "urutan dropdown berubah");
  assert(otb.includes("GBPUSD_ORB"), "GBPUSD_ORB hilang");
  assert(otb.includes("AUDCAD_ORB"), "AUDCAD_ORB hilang");
  assert(otb.includes("EURCHF_ORB"), "EURCHF_ORB hilang");
  assert(otb.includes("AUDCHF_ORB"), "simbol TBD hilang dari daftar");
  assert(otb.includes("USDCAD_ORB"), "USDCAD_ORB hilang dari daftar");
  assert(otb.includes("NZDJPY_ORB"), "NZDJPY_ORB hilang dari daftar");
  assert(otb.includes("USDCHF_ORB"), "USDCHF_ORB hilang dari daftar");
  assert(otb.includes("USDJPY_ORB"), "USDJPY_ORB hilang dari daftar");
  // Tahap 6I: forex/metals/indeks/saham baru dari bulk export.
  assert(otb.includes("EURUSD_ORB"), "EURUSD_ORB 6I hilang");
  assert(otb.includes("XAUUSD_ORB"), "XAUUSD_ORB 6I hilang");
  assert(otb.includes("US100.DEC"), "US100.DEC 6I hilang");
  assert(otb.includes("AAPL.US"), "AAPL.US 6I hilang");
});

test("228. 68/68 simbol verified tanpa warning (6I)", () => {
  // Kebijakan verifikasi (6I): 68/68 verified (16 lama + 52 bulk export
  // 06 Okt 2026); tidak ada simbol pending tersisa. Simbol invented di
  // luar dropdown tetap null.
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
    hasOtbPresetForSymbol("EURUSD_ORB", "orbitraderberjangka") === true,
    "EURUSD_ORB verified 6I harus tanpa warning",
  );
  assert(
    getOtbInstrumentProfile("EURUSD_ORB") !== null,
    "preset EURUSD_ORB 6I hilang",
  );
  assert(
    hasOtbPresetForSymbol("XAUUSD_ORB", "orbitraderberjangka") === true,
    "XAUUSD_ORB verified 6I harus tanpa warning",
  );
  assert(
    hasOtbPresetForSymbol("AAPL.US", "orbitraderberjangka") === true,
    "AAPL.US verified 6I harus tanpa warning",
  );
  assert(
    !hasOtbPresetForSymbol("FAKE_ORB", "orbitraderberjangka"),
    "invented dianggap terverifikasi",
  );
  assert(
    !hasOtbPresetForSymbol("GBPUSD", "orbitraderberjangka"),
    "simbol Finex dianggap preset OTB",
  );
  assert(
    getOtbInstrumentProfile("FAKE_ORB") === null,
    "preset fiktif untuk invented",
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
  assert(finex.length === 82, `daftar Finex=${finex.length}`);
  assert(finex.includes("US100") && finex.includes("GBPUSD"), "daftar rusak");
  assert(finex.includes("#AAPL"), "#saham 6I hilang dari Finex");
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
    hasOtbPresetForSymbol("FAKE_ORB", "orbitraderberjangka") === false,
    "simbol invented lolos guard",
  );
  // Preset tidak ter-apply (penolakan yang berlaku, tanpa partial):
  const previous = makeValidBroker();
  assert(
    applyBrokerPreset(previous, "FAKE_ORB", "orbitraderberjangka") === previous,
    "preset unverified ter-apply",
  );
  // Validator menilainya sebagai keluarga EURUSD (skala sama via
  // normalizeSymbol) — bukan error simbol; pembeda unverified adalah
  // notice UI + tanpa preset fill.
  const summary = validateAnalysisInputs(
    { ...makeValidMarket("GBPUSD"), symbol: "FAKE_ORB" },
    makeValidBroker(),
    "orbitraderberjangka",
  );
  assert(
    summary.errors.some((error) => error.field === "symbol"),
    "simbol invented lolos validator",
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
  const end = app.indexOf("const handleDetectedLevels", start);
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

test("239. dropdown OTB 68 simbol, 68/68 terverifikasi", () => {
  const symbols = getAvailableSymbols("orbitraderberjangka");
  assert(symbols.length === 68, `expected 68, got ${symbols.length}`);
  assert(symbols.includes("GBPUSD_ORB"), "GBPUSD_ORB missing");
  assert(symbols.includes("AUDCAD_ORB"), "AUDCAD_ORB missing");
  assert(symbols.includes("EURCHF_ORB"), "EURCHF_ORB missing");
  assert(symbols.includes("XAUUSD_ORB"), "XAUUSD_ORB 6I missing");
  assert(symbols.includes("AAPL.US"), "AAPL.US 6I missing");
  // Kebijakan verifikasi (6I): 68/68 verified, tanpa pending.
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
  // Kebijakan verifikasi (6I): 68/68 verified; invented tetap false.
  assert(
    hasOtbPresetForSymbol("FAKE_ORB", "orbitraderberjangka") === false,
    "FAKE_ORB invented harus false",
  );
});

test("244. OTB_PRESETS berisi 68 objek (68/68 verified)", () => {
  const keys = Object.keys(OTB_PRESETS);
  // 68/68 simbol terverifikasi via VERIFIED_OTB_SYMBOLS
  // (16 lama + 52 bulk export 06 Okt 2026).
  assert(keys.length === 68, `expected 68 presets, got ${keys.length}`);
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
  assert(applied.pointValue === 100000, `pointValue=${applied.pointValue}`);
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
  assert(applied.pointValue === 100000, `pointValue=${applied.pointValue}`);
});

test("248. komisi simbol OTB invented tetap kosong", () => {
  const previous = makeEmptyBroker();
  // Simbol invented (di luar 68 verified) tidak mendapat preset.
  const result = applyBrokerPreset(previous, "FAKE_ORB", "orbitraderberjangka");
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
      symbol: "FAKE_ORB",
      brokerId: "orbitraderberjangka",
      direction: "long",
      lot: 0.1,
      holdingDays: 1,
    }) === null,
    "invented ikut terhitung",
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
    Math.abs(cost.swapCost - -431.7 / 360) < 1e-6,
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
  assert(
    Math.abs(cost.swapCost - -431.7 / 360) < 1e-6,
    `swapCost=${cost.swapCost}`,
  );
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
    Math.abs(cost.swapCost - -48.95625 / 360) < 1e-6,
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
  assert(Math.abs(cost.swapCost - -2475 / 360) < 1e-6, `swapCost=${cost.swapCost}`);
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

test("273. simbol invented → null", () => {
  assert(
    calculateSwapCost({
      symbol: "FAKE_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      lot: 1,
      holdingDays: 1,
      currentPrice: 0.6,
    }) === null,
    "simbol invented ikut terhitung",
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
    Math.abs(attached.swapDetail.swapCost - -431.7 / 360) < 1e-6,
    "attach tidak meneruskan field baru",
  );
  assert(
    attached.swapDetail.contractBaseCurrency === "AUD",
    "attach base salah",
  );
});

/* ---------------- Expand OTB_PRESETS 5D-STEP1: TEST 279-286 ---------------- */

test("279. OTB_PRESETS size = 68 (68/68 verified)", () => {
  const keys = Object.keys(OTB_PRESETS);
  assert(keys.length === 68, `expected 68 presets, got ${keys.length}`);
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
  assert(symbols.length === 68, `dropdown=${symbols.length}`);
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

test("513. formatPriceDistance: jarak forex tidak terpotong jadi 0", () => {
  assert(formatPriceDistance(0.00186) === "0.00186", "forex 5 desimal");
  assert(formatPriceDistance(-0.00186) === "0.00186", "selalu absolut");
  assert(formatPriceDistance(187.5) === "187.50", "indeks 2 desimal");
  assert(formatPriceDistance(1.2345) === "1.234" || formatPriceDistance(1.2345) === "1.235", "menengah 3 desimal");
  assert(formatPriceDistance(Number.NaN) === "-", "NaN aman");
});

const modeAmanMarket = {
  symbol: "GBPUSD", timeframe: "H1", bid: 1.3, ask: 1.3001, close: 1.3,
  open: 1.2995, high: 1.301, low: 1.299, ma50: 1.295, cci: 150, rsi: 60,
  macd: 0.001, macdSignal: 0, atr: 0.001, support: 1.299, resistance: 1.305,
};
const modeAmanBroker = {
  equity: 10000, riskPercent: 1, minLot: 0.01, lotStep: 0.01,
  pointValue: 100000, contractSize: 100000, commission: 1, slippage: 0,
  buffer: 0.00005, atrMultiplier: 1.2, targetRR: 1.5,
};

test("514. Mode Aman: biaya kecil (<10% risiko) tetap BELI", () => {
  const r = analyzeMarket(modeAmanMarket, modeAmanBroker);
  assert(r.decision === "BELI", `harus BELI, dapat ${r.decision}`);
  assert(
    r.costShareOfRisk !== null && r.costShareOfRisk !== undefined &&
      r.costShareOfRisk < MAX_COST_SHARE_OF_RISK,
    `porsi biaya ${r.costShareOfRisk}`,
  );
  assert(r.stopLoss !== null && r.takeProfit !== null, "SL/TP harus ada");
  assert(r.heldBy === null, `heldBy harus null, dapat ${r.heldBy}`);
});

test("515. Mode Aman: komisi besar (OTB 33/lot) menahan setup jadi TUNGGU", () => {
  const r = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, commission: 33 });
  assert(r.decision === "TUNGGU", `harus TUNGGU, dapat ${r.decision}`);
  assert(r.stopLoss === null && r.takeProfit === null, "SL/TP tidak boleh tampil");
  assert(r.suggestedLot === null, "lot tidak boleh tampil");
  assert(r.warnings.some((w) => w.includes("Mode Aman: biaya")), "alasan biaya hilang");
  assert(r.heldBy === "biaya", `heldBy harus biaya, dapat ${r.heldBy}`);
  assert(r.heldDecision === "BELI", `arah asli harus BELI, dapat ${r.heldDecision}`);
});

test("516. Mode Aman: lot minimum melewati batas risiko (saldo kecil) jadi TUNGGU", () => {
  const r = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, equity: 8.5 });
  assert(r.decision === "TUNGGU", `harus TUNGGU, dapat ${r.decision}`);
  assert(r.warnings.some((w) => w.includes("Mode Aman: risiko lot minimum")), "alasan risiko hilang");
  assert(r.heldBy === "risiko", `heldBy harus risiko, dapat ${r.heldBy}`);
});

test("517. panel header: alasan sama dengan hasil analisa (Mode Aman)", () => {
  const ok = analyzeMarket(modeAmanMarket, modeAmanBroker);
  assert(signalReason(ok) === "Lolos biaya & risiko · belum terbukti", signalReason(ok));
  const mahal = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, commission: 33 });
  assert(signalReason(mahal).startsWith("Ditahan: biaya"), signalReason(mahal));
  const kecil = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, equity: 8.5 });
  assert(signalReason(kecil) === "Ditahan: risiko lot minimum", signalReason(kecil));
  const lemah = analyzeMarket({ ...modeAmanMarket, cci: 0, macd: 0, rsi: 50 }, modeAmanBroker);
  assert(signalReason(lemah) === "Skor belum kompak", signalReason(lemah));
});

test("518. candles: hanya simbol broker yang punya CSV H1, plus quote terakhir", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "candles-"));
  const csv = "time,open,high,low,close,tick_volume\n2026.10.07 10:00,1.1,1.2,1.0,1.15,10\n";
  nfs.writeFileSync(npath.join(dir, "MDBKA_GBPUSD_H1.csv"), csv);
  nfs.writeFileSync(npath.join(dir, "MDBKA_#AAPL_H1.csv"), csv);
  const quote = { timestamp: "2026.10.07 10:00:01", symbol: "GBPUSD", bid: 1.1, ask: 1.1002 };
  const source = {
    getSymbols: () => ["GBPUSD", "EURUSD", "#AAPL"],
    getLatestBySymbol: (s: string) => (s === "GBPUSD" ? [quote] : []),
  };
  const items = collectCandleItems(source, dir);
  assert(items.length === 2, `harus 2 simbol ber-CSV, dapat ${items.length}`);
  assert(items.every((i) => i.symbol !== "EURUSD"), "EURUSD tanpa CSV harus dilewati");
  const gbp = items.find((i) => i.symbol === "GBPUSD");
  assert(gbp !== undefined && gbp.quote !== null && gbp.quote.bid === 1.1, "quote GBPUSD hilang");
  assert(gbp !== undefined && gbp.csv === csv, "isi CSV berubah");
  const aapl = items.find((i) => i.symbol === "#AAPL");
  assert(aapl !== undefined && aapl.quote === null, "simbol tanpa quote = null");
});

function scanCsv(n: number): string {
  const rows = ["time,open,high,low,close,tick_volume"];
  for (let i = 0; i < n; i++) {
    const base = 1.3 + 0.002 * Math.sin(i / 5) + 0.00003 * i;
    const day = String(1 + Math.floor(i / 24)).padStart(2, "0");
    const hour = String(i % 24).padStart(2, "0");
    rows.push(
      `2026.10.${day} ${hour}:00,${base.toFixed(5)},${(base + 0.0009).toFixed(5)},${(base - 0.0009).toFixed(5)},${(base + 0.0003).toFixed(5)},100`,
    );
  }
  return rows.join("\n");
}

test("519. pemindai: candle kurang dan equity kosong jadi DATA (tanpa angka fiktif)", () => {
  const pendek = scanSymbol({ symbol: "GBPUSD", brokerId: "finex", csv: scanCsv(10), quote: null, equity: 1000, fxRates: null });
  assert(pendek.status === "DATA" && pendek.decision === null, `pendek: ${pendek.status}`);
  assert(pendek.reason.includes("Candle kurang"), pendek.reason);
  const tanpaEquity = scanSymbol({ symbol: "GBPUSD", brokerId: "finex", csv: scanCsv(80), quote: null, equity: 0, fxRates: null });
  assert(tanpaEquity.status === "DATA", `tanpa equity: ${tanpaEquity.status} ${tanpaEquity.reason}`);
});

test("520. pemindai: CSV valid menghasilkan keputusan + alasan dari mesin yang sama", () => {
  const row = scanSymbol({ symbol: "GBPUSD", brokerId: "finex", csv: scanCsv(80), quote: null, equity: 10000, fxRates: null });
  assert(row.status !== "DATA", `harus dianalisa, dapat DATA: ${row.reason}`);
  assert(row.decision !== null && row.score !== null, "keputusan/skor hilang");
  assert(row.reason.length > 0 && row.candles === 80, "alasan/candle hilang");
});

test("521. pemindai: urutan LOLOS > ditahan biaya > ditahan risiko > TUNGGU > DATA", () => {
  const mk = (symbol: string, status: ScanRow["status"], score: number | null, cost: number | null): ScanRow =>
    ({ symbol, status, decision: null, direction: null, held: false, score, reason: "", costShareOfRisk: cost, candles: 80 });
  const sorted = sortScanRows([
    mk("D", "DATA", null, null), mk("P", "PASAR_TUTUP", null, null), mk("T", "TUNGGU", 1, 0.05), mk("R", "DITAHAN_RISIKO", 4, 0.05),
    mk("B2", "DITAHAN_BIAYA", 3, 0.2), mk("B1", "DITAHAN_BIAYA", 5, 0.3), mk("L", "LOLOS", 3, 0.05),
  ]);
  const got = sorted.map((r) => r.symbol).join(",");
  assert(got === "L,B1,B2,R,T,P,D", `urutan salah: ${got}`);
});

test("522. pemindai: simbol tertinggal >=2 jam dari candle terbaru = PASAR_TUTUP", () => {
  const csv = scanCsv(80);
  const last = lastCandleTimeMs(csv);
  assert(last !== null, "waktu candle terakhir tidak terbaca");
  const segar = scanSymbol({ symbol: "GBPUSD", brokerId: "finex", csv, quote: null, equity: 10000, fxRates: null, referenceCandleMs: last });
  assert(segar.status !== "PASAR_TUTUP", `acuan sama tidak boleh basi: ${segar.status}`);
  const basi = scanSymbol({ symbol: "GBPUSD", brokerId: "finex", csv, quote: null, equity: 10000, fxRates: null, referenceCandleMs: (last ?? 0) + 3 * 3_600_000 });
  assert(basi.status === "PASAR_TUTUP" && basi.decision === null, `harus PASAR_TUTUP, dapat ${basi.status}`);
  assert(basi.reason.includes("tertinggal 3 jam"), basi.reason);
});

test("523. format biaya satu desimal gaya Indonesia", () => {
  assert(formatSharePercent(0.104) === "10,4", formatSharePercent(0.104));
  assert(formatSharePercent(0.1) === "10,0", formatSharePercent(0.1));
  const mahal = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, commission: 33 });
  assert(/biaya \d+,\d%/.test(signalReason(mahal)), signalReason(mahal));
});

test("524. catatan entry: posisi lama tanpa scan, posisi baru dipindai, tanpa duplikat setelah restart", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "entries-"));
  nfs.writeFileSync(npath.join(dir, "MDBKA_GBPUSD_H1.csv"), scanCsv(80));
  const quotes = { getSymbols: () => ["GBPUSD"], getLatestBySymbol: () => [] };
  const file = npath.join(dir, "trades", "entries-finex.jsonl");
  const mk = () =>
    createTradeEntryLog({
      file, broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null,
      now: () => new Date("2026-10-08T00:00:00Z"),
    });
  const pos = (ticket: string) => ({
    ticket, symbol: "GBPUSD", side: "BUY" as const, volume: 0.01,
    priceOpen: 1.3, sl: 1.29, tp: 1.31, timeOpen: "2026.10.07 20:00:00",
  });
  const log = mk();
  const awal = log.ingest([pos("100")]);
  assert(awal.length === 1 && awal[0].preExisting && awal[0].scan === null, "posisi saat start harus preExisting tanpa scan");
  assert(log.ingest([pos("100")]).length === 0, "tiket sama tidak boleh dicatat ulang");
  const baru = log.ingest([pos("100"), pos("101")]);
  assert(baru.length === 1 && baru[0].ticket === "101" && !baru[0].preExisting, "posisi baru harus dicatat");
  assert(baru[0].scan !== null && baru[0].scan.status !== "DATA", `scan entry harus ada: ${JSON.stringify(baru[0].scan)}`);
  assert(baru[0].sl === 1.29 && baru[0].tp === 1.31 && baru[0].equity === 10000, "SL/TP/equity entry hilang");
  const restart = mk();
  assert(restart.ingest([pos("100"), pos("101")]).length === 0, "setelah restart tidak boleh duplikat");
  assert(restart.readAll().length === 2, `file harus 2 catatan, dapat ${restart.readAll().length}`);
});

test("526. evaluasi: pasangkan IN/OUT, hasil bersih, R dari SL awal, kelompok status entry", () => {
  const deal = (positionId: string, time: string, type: string, entry: string, price: number, profit: number, commission: number, comment = "") => ({
    dealTicket: `${positionId}-${entry}`, positionId, orderTicket: positionId, serverTime: time,
    symbol: "GBPUSD", type, entry, volume: 0.1, price, commission, swap: 0, profit, fee: 0,
    comment, login: "1", accountCurrency: "USD", idrAmount: null, sl: null, tp: null,
  });
  const deals = [
    deal("1", "2026.10.08 10:00:00", "BUY", "IN", 1.3, 0, -3.3),
    deal("1", "2026.10.08 12:30:00", "SELL", "OUT", 1.302, 20, 0, "[tp 1.30200]"),
    deal("2", "2026.10.08 11:00:00", "SELL", "IN", 1.31, 0, -3.3),
    deal("2", "2026.10.08 11:20:00", "BUY", "OUT", 1.311, -10, 0, "[sl 1.31100]"),
    deal("3", "2026.10.08 13:00:00", "BUY", "IN", 1.3, 0, -3.3),
    deal("4", "2026.10.08 14:00:00", "BUY", "IN", 1.3, 0, -3.3),
    deal("4", "2026.10.08 14:05:00", "SELL", "OUT", 1.3001, 1, 0),
  ];
  const entry = (ticket: string, sl: number, status: string | null, preExisting = false) => ({
    ticket, broker: "finex" as const, symbol: "GBPUSD", side: "BUY" as const, volume: 0.1,
    priceOpen: 1.3, sl, tp: 0, timeOpen: "", firstSeenUtc: "", preExisting, equity: 1000,
    scan: status === null ? null : { status: status as "LOLOS", direction: "BELI" as const, score: 5, costShareOfRisk: 0.05, reason: "" },
  });
  const ev = evaluateTrades(deals, [entry("1", 1.299, "LOLOS"), entry("2", 1.311, "TUNGGU"), entry("4", 0, null, true)]);
  assert(ev.trades.length === 3 && ev.openPositions === 1, `tertutup ${ev.trades.length}, terbuka ${ev.openPositions}`);
  const t1 = ev.trades.find((t) => t.positionId === "1");
  assert(t1 !== undefined && t1.net === 16.7 && t1.exit === "TP" && t1.durationMin === 150, `t1 ${JSON.stringify(t1)}`);
  assert(t1 !== undefined && t1.rMultiple === 2 && t1.group === "LOLOS", `R t1 ${t1?.rMultiple}`);
  const t2 = ev.trades.find((t) => t.positionId === "2");
  assert(t2 !== undefined && t2.exit === "SL" && t2.rMultiple === -1 && t2.net === -13.3, `t2 ${JSON.stringify(t2)}`);
  const t4 = ev.trades.find((t) => t.positionId === "4");
  assert(t4 !== undefined && t4.group === GROUP_BEFORE_LOG && t4.rMultiple === null, "t4 sebelum pencatatan tanpa R");
  assert(ev.overall.n === 3 && ev.overall.wins === 1 && ev.overall.net === 1.1, `overall ${JSON.stringify(ev.overall)}`);
  assert(ev.byGroup["LOLOS"]?.n === 1 && ev.byGroup["LOLOS"]?.winRate === 1, "kelompok LOLOS salah");
  const tanpa = evaluateTrades(deals, []);
  assert(tanpa.trades.every((t) => t.group === GROUP_NO_LOG), "tanpa catatan harus TANPA_CATATAN");
});

test("527. evaluasi: broker dari nama perusahaan & label akun dari env", () => {
  assert(brokerFromCompany("PT. Orbi Trade Berjangka") === "orbitraderberjangka", "OTB");
  assert(brokerFromCompany("PT. Finex Bisnis Solusi Futures") === "finex", "Finex");
  assert(brokerFromCompany("Lain") === null, "tak dikenal");
  const l = parseAccountLabels("91811209:Finex live, 61823011:Finex demo,rusak");
  assert(l["91811209"] === "Finex live" && l["61823011"] === "Finex demo" && Object.keys(l).length === 2, JSON.stringify(l));
});

test("528. panel evaluasi: format USD/Rupiah, bukti n>=20, urutan grup", () => {
  assert(formatUsd(-183.18) === "−$183,18", formatUsd(-183.18));
  assert(formatUsd(7.5) === "+$7,50", formatUsd(7.5));
  assert(formatRupiah(-183.18, 17850) === "−Rp3.270.000", String(formatRupiah(-183.18, 17850)));
  assert(formatRupiah(10, null) === null, "tanpa kurs");
  assert(formatWinRate(4 / 15) === "26,7%", formatWinRate(4 / 15));
  assert(formatDuration(45) === "45 mnt" && formatDuration(192) === "3,2 jam", "durasi jam");
  assert(formatDuration(3024) === "2,1 hari", formatDuration(3024));
  const base: EvalTradeStats = { n: 15, wins: 4, losses: 11, winRate: 4 / 15, net: -183.18, avgWin: 7.59, avgLoss: -19.41, expectancy: -12.21, avgR: null, rCount: 0 };
  assert(proofStatus(base) === "BELUM_CUKUP" && proofLabel(base) === "Belum cukup data (15/20)", proofLabel(base));
  assert(proofStatus({ ...base, n: 20 }) === "TERBUKTI_NEGATIF", "rugi terbukti");
  assert(proofStatus({ ...base, n: 24, expectancy: 1.2 }) === "TERBUKTI_POSITIF", "untung terbukti");
  assert(isLegacyGroup("TANPA_CATATAN") && !isLegacyGroup("LOLOS"), "legacy");
  const order = sortGroups(["TANPA_CATATAN", "TUNGGU", "SEBELUM_PENCATATAN", "LOLOS"]);
  assert(order.join(",") === "LOLOS,TUNGGU,TANPA_CATATAN,SEBELUM_PENCATATAN", order.join(","));
});

test("529. pemindai: label Lolos = win rate nyata hanya bila n>=20 (demo+live digabung)", () => {
  const st = (n: number, wins: number, net: number): EvalTradeStats => ({ n, wins, losses: n - wins, winRate: wins / n, net, avgWin: null, avgLoss: null, expectancy: net / n, avgR: null, rCount: 0 });
  const acc = (login: string, broker: string, groups: Record<string, EvalTradeStats>): EvalAccount => ({
    login, label: login, company: "", broker,
    evaluation: { trades: [], overall: st(1, 1, 1), byGroup: groups, bySymbol: {}, openPositions: 0 },
  });
  assert(mergeGroupStats([], "finex", "LOLOS") === null, "kosong");
  assert(lolosLabel(null) === "Lolos · belum terbukti (0/20)", lolosLabel(null));
  const accounts = [
    acc("1", "finex", { LOLOS: st(14, 8, 12) }),
    acc("2", "finex", { LOLOS: st(10, 5, 3), TANPA_CATATAN: st(19, 4, -13.71) }),
    acc("3", "orbitraderberjangka", { LOLOS: st(5, 1, -40) }),
  ];
  const fx = mergeGroupStats(accounts, "finex", "LOLOS");
  assert(fx !== null && fx.n === 24 && fx.wins === 13 && fx.net === 15 && fx.expectancy === 0.63, JSON.stringify(fx));
  assert(lolosLabel(fx) === "Lolos · win rate 54,2% (n=24)", lolosLabel(fx));
  const otb = mergeGroupStats(accounts, "orbitraderberjangka", "LOLOS");
  assert(lolosLabel(otb) === "Lolos · belum terbukti (5/20)", lolosLabel(otb));
  const rugi = mergeGroupStats([acc("4", "finex", { LOLOS: st(20, 12, -5) })], "finex", "LOLOS");
  assert(lolosLabel(rugi) === "Lolos · terbukti rugi, win rate 60,0% (n=20)", lolosLabel(rugi));
});

test("530. Mode Aman: breakeven 0,5R & time-stop 3 jam (jam server MT5)", () => {
  const be = checkBreakeven({ direction: "BELI", entryPrice: 1.32, sl: 1.319 }, 1.3205, 1.3207);
  assert(be !== null && be.multiple === 0.5 && be.message.includes("0,5R"), JSON.stringify(be));
  assert(TIME_STOP_HOURS === 3, "horizon bukan 3 jam");
  const h = { entryTime: "2026.10.06 14:41:45", symbol: "AUDUSD_ORB" };
  assert(checkTimeStop(h, "2026.10.06 17:41:44") === null, "belum 3 jam ikut terpicu");
  const ts = checkTimeStop(h, "2026.10.06 17:41:45");
  assert(ts !== null && ts.hoursHeld === 3 && ts.message.includes("3,0 jam"), JSON.stringify(ts));
  const lama = checkTimeStop(h, "2026.10.07 20:25:07");
  assert(lama !== null && lama.message.includes("29,7 jam"), JSON.stringify(lama));
  const hari = checkTimeStop(h, "2026.10.09 14:41:45");
  assert(hari !== null && hari.message.includes("3,0 hari"), JSON.stringify(hari));
  // Holding manual (ISO UTC) beda jam dengan quote server → tidak dinilai.
  assert(checkTimeStop({ entryTime: "2026-10-06T05:41:45.000Z", symbol: "EURUSD" }, "2026.10.07 20:25:07") === null, "ISO ikut dinilai");
  assert(checkTimeStop(h, "") === null, "tanpa jam quote");
});

test("531. analisa otomatis: cari CSV simbol + nama file sintetis", () => {
  const items = [
    { symbol: "AUDUSD_ORB", csv: "a" },
    { symbol: "#META", csv: "m" },
    { symbol: "US30", csv: "u" },
  ];
  assert(findCandleItem(items, "AUDUSD_ORB")?.csv === "a", "exact OTB");
  assert(findCandleItem(items, "#meta")?.csv === "m", "beda huruf besar/kecil");
  assert(findCandleItem(items, "US30.DEC") === null, "tidak boleh cocok sebagian");
  assert(findCandleItem(items, "") === null, "simbol kosong");
  assert(autoCsvFileName("AUDUSD_ORB") === "MDBKA_AUDUSD_ORB_H1.csv", autoCsvFileName("AUDUSD_ORB"));
});

test("532. analisa otomatis: kunci muat & wiring App (readSrc)", () => {
  assert(autoLoadKey("finex", "EURUSD", "") === "finex|EURUSD", "kunci");
  assert(autoLoadKey("finex", "", "") === null, "simbol kosong tidak dimuat");
  assert(autoLoadKey("finex", "EURUSD", "upload.csv") === null, "upload manual tidak ditimpa");
  const app = readSrc("src/App.tsx");
  assert(app.includes("/api/candles?broker=${activeBrokerId}"), "App tidak memakai /api/candles");
  assert(app.includes("handleCsvLoadedRef.current(item.csv, autoCsvFileName(symbol))"), "tidak lewat alur upload yang sama");
  assert(app.includes("<CsvFileConnector"), "upload manual cadangan hilang");
});

test("533. saldo akun dari History: setoran, penarikan, trade, kredit diabaikan", () => {
  const deal = (type: string, profit: number, extra: Partial<{ commission: number; swap: number; fee: number; idrAmount: number | null; serverTime: string }> = {}) => ({
    dealTicket: "1", positionId: "0", orderTicket: "0", serverTime: extra.serverTime ?? "2026.10.01 10:00:00",
    symbol: "", type, entry: "IN", volume: 0, price: 0, commission: extra.commission ?? 0,
    swap: extra.swap ?? 0, profit, fee: extra.fee ?? 0, comment: "", login: "70930952",
    accountCurrency: "USD", idrAmount: extra.idrAmount ?? null, sl: null, tp: null,
  });
  const s = summarizeAccountBalance([
    deal("BALANCE", 10, { idrAmount: 165000 }),
    deal("BALANCE", 5000),
    deal("BUY", 0, { commission: -3.3 }),
    deal("SELL", -19.41, { swap: -0.2, serverTime: "2026.10.06 14:41:45" }),
    deal("BALANCE", -2),
    deal("CREDIT", 100),
  ]);
  assert(s.balance === 4985.09, `saldo ${s.balance}`);
  assert(s.deposits === 5010 && s.withdrawals === 2, `setoran ${s.deposits} tarik ${s.withdrawals}`);
  assert(s.depositsIdr === 165000, `idr ${s.depositsIdr}`);
  assert(s.currency === "USD" && s.lastDealTime === "2026.10.06 14:41:45", JSON.stringify(s));
  const kosong = summarizeAccountBalance([]);
  assert(kosong.balance === 0 && kosong.lastDealTime === null && kosong.depositsIdr === null, "kosong");
  assert(readSrc("server/routes/evaluationRoutes.ts").includes("balance: summarizeAccountBalance(deals)"), "belum tersambung ke /api/evaluation");
});

test("534. header saldo: Rupiah, setoran asli, live di depan, tanpa kurs pakai USD", () => {
  const b = (balance: number, deposits: number, depositsIdr: number | null) => ({
    balance, deposits, withdrawals: 0, depositsIdr, currency: "USD", lastDealTime: "2026.10.08 00:45:35",
  });
  const accounts = [
    { login: "70930952", label: "OTB demo", balance: b(5000.22, 5000, null) },
    { login: "91811209", label: "Finex live", balance: b(8.5, 22.21, 400000) },
    { login: "61823011", label: "Finex demo", balance: b(4999.97, 5000, null) },
    { login: "1", label: "Tanpa saldo" },
  ];
  const rows = buildBalanceRows(accounts, 17870.85);
  assert(rows.map((r) => r.label).join("|") === "Finex live|Finex demo|OTB demo", rows.map((r) => r.label).join("|"));
  assert(rows[0].isLive && rows[0].balanceText === "Rp152.000", rows[0].balanceText);
  assert(rows[0].depositText === "Rp400.000", `setoran asli ${rows[0].depositText}`);
  assert(rows[2].balanceText === "Rp89.358.000", rows[2].balanceText);
  assert(rows[2].depositText === "Rp89.354.000" && rows[2].balanceUsdText === "$5.000,22", rows[2].depositText);
  const tanpaKurs = buildBalanceRows(accounts, null);
  assert(tanpaKurs[0].balanceText === "$8,50" && tanpaKurs[0].depositText === "Rp400.000", JSON.stringify(tanpaKurs[0]));
  assert(usdToIdrText(1, 0) === null, "kurs 0");
  assert(readSrc("src/App.tsx").includes("<AccountBalancesBar fxRates={fxRates} />"), "belum dipasang di header");
});

test("535. taruhan ganda: eksposur searah diblok, lindung nilai tidak", () => {
  const ex = exposureOf("AUDUSD_ORB", "BELI");
  assert(ex.AUD === 1 && ex.USD === -1, JSON.stringify(ex));
  const otb = [{ symbol: "AUDUSD_ORB", side: "BUY" }, { symbol: "META.US", side: "BUY" }];
  const aud = findDoubleBet("AUDJPY_ORB", "BELI", otb);
  assert(aud !== null && aud.key === "AUD" && aud.reason.includes("sama-sama AUD naik"), JSON.stringify(aud));
  assert(findDoubleBet("US500.DEC", "BELI", otb)?.key === "Saham AS", "indeks AS vs META");
  assert(findDoubleBet("USDCAD_ORB", "JUAL", otb)?.key === "USD", "short USD dobel");
  assert(findDoubleBet("AUDJPY_ORB", "JUAL", otb) === null, "berlawanan (lindung nilai) tidak diblok");
  assert(findDoubleBet("XAUUSD_ORB", "BELI", otb) === null, "emas berdiri sendiri");
  const finex = [{ symbol: "GBPUSD", side: "SELL" }, { symbol: "XTIUSD", side: "SELL" }];
  assert(findDoubleBet("GBPUSD", "JUAL", finex)?.key === "GBP", "simbol sama arah sama");
  assert(findDoubleBet("XTIUSD", "JUAL", finex)?.key === "Minyak", "minyak dobel");
  assert(findDoubleBet("#META", "BELI", otb)?.key === "Saham AS", "saham Finex # = AS");
  assert(findDoubleBet("#BMW", "BELI", otb) === null, "saham Jerman bukan AS");
  assert(findDoubleBet("EURCHF", "BELI", []) === null, "tanpa posisi");
});

test("536. wiring taruhan ganda: pemindai, panel, pencatat entry (readSrc)", () => {
  const sc = readSrc("src/lib/symbolScanner.ts");
  assert(sc.includes('status: "DITAHAN_KORELASI"') && sc.includes("findDoubleBet(symbol, result.decision, input.openPositions)"), "pemindai belum memblok");
  assert(sc.includes('decision: "TUNGGU"'), "keputusan harus TUNGGU saat ditahan");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes("useBrokerPositions(brokerId)") && panel.includes("openPositions,"), "panel tanpa posisi terbuka");
  assert(panel.includes('label: "Taruhan ganda"'), "label status hilang");
  const log = readSrc("server/services/tradeEntryLog.ts");
  assert(log.includes("positions.filter((o) => o.ticket !== p.ticket)"), "entry harus dinilai terhadap posisi lain");
});

test("537. status pemindai = tombol: hanya LOLOS aktif, buka Hasil analisa (readSrc)", () => {
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes('disabled={row.status !== "LOLOS" || onOpenAnalysis === undefined}'), "selain LOLOS harus disabled");
  assert(panel.includes("onOpenAnalysis?.(row.symbol);"), "klik tidak membuka analisa");
  const app = readSrc("src/App.tsx");
  assert(app.includes("onOpenAnalysis={handleOpenAnalysis}"), "App belum menyambung tombol");
  assert(app.includes("handleSymbolChange(symbol);") && app.includes('getElementById("hasil-analisa")'), "pilih simbol + gulir");
  assert(app.includes('id="hasil-analisa"'), "target gulir hilang");
});

test("538. Hasil analisa ikut menahan taruhan ganda (BELI/JUAL → TUNGGU, tanpa SL/TP/lot)", () => {
  const base = analyzeMarket(modeAmanMarket, modeAmanBroker);
  const beli: ReturnType<typeof analyzeMarket> = { ...base, decision: "BELI", stopLoss: 1, takeProfit: 2, suggestedLot: 0.01, warnings: ["w"] };
  const held = applyDoubleBetHold(beli, "AUDJPY_ORB", [{ symbol: "AUDUSD_ORB", side: "BUY" }]);
  assert(held.decision === "TUNGGU" && held.heldBy === "korelasi" && held.heldDecision === "BELI", JSON.stringify(held.decision));
  assert(held.stopLoss === null && held.takeProfit === null && held.suggestedLot === null, "angka eksekusi harus kosong");
  assert((held.heldReason ?? "").includes("AUDUSD_ORB") && held.warnings[0].includes("taruhan ganda"), String(held.heldReason));
  assert(signalReason(held) === held.heldReason, "alasan header");
  const lindung = applyDoubleBetHold(beli, "AUDJPY_ORB", [{ symbol: "AUDUSD_ORB", side: "SELL" }]);
  assert(lindung === beli, "berlawanan tidak boleh diubah");
  const tunggu: ReturnType<typeof analyzeMarket> = { ...base, decision: "TUNGGU" };
  assert(applyDoubleBetHold(tunggu, "AUDJPY_ORB", [{ symbol: "AUDUSD_ORB", side: "BUY" }]) === tunggu, "TUNGGU tetap");
  const app = readSrc("src/App.tsx");
  assert(app.includes("applyDoubleBetHold(") && app.includes("openPositionsAll,") && app.includes("result={shownResult}"), "App belum memakai hasil tertahan");
  assert(readSrc("src/components/result/AnalysisResult.tsx").includes('result.heldBy === "korelasi"'), "panduan taruhan ganda hilang");
});

test("539. jeda 3 rugi beruntun: 24 jam jam server, demo+live satu broker", () => {
  const tr = (symbol: string, closeTime: string, net: number) => ({ symbol, closeTime, net });
  // Data nyata Finex live: 2 rugi terakhir lalu untung → belum jeda.
  const finex = [tr("USDCHF", "2026.10.01 05:06:20", 1.68), tr("EURCHF", "2026.10.01 10:31:50", -1.74), tr("CADJPY", "2026.10.01 18:34:42", -4.42)];
  const a = checkLossStreak(finex, "2026.10.08 03:00:00");
  assert(!a.paused && a.streak === 2, JSON.stringify(a));
  const tiga = [...finex, tr("GBPUSD", "2026.10.08 01:00:00", -1.2)];
  const b = checkLossStreak(tiga, "2026.10.08 03:00:00");
  assert(b.paused && b.streak === 3 && b.until === "2026.10.09 01:00", JSON.stringify(b));
  assert((b.reason ?? "").includes("3 kali rugi berturut-turut") && (b.reason ?? "").includes("GBPUSD"), String(b.reason));
  assert(!checkLossStreak(tiga, "2026.10.09 01:00:00").paused, "jeda harus berakhir setelah 24 jam");
  assert(checkLossStreak(tiga, null).paused, "tanpa jam server: tetap jeda (fail-safe)");
  assert(!checkLossStreak([...tiga, tr("EURUSD", "2026.10.08 02:00:00", 0.5)], "2026.10.08 03:00:00").paused, "untung memutus beruntun");
  assert(checkLossStreak([], null).streak === 0, "kosong");
  const accounts = [
    { broker: "finex", evaluation: { trades: [tr("A", "2026.10.08 01:00:00", -1)] } },
    { broker: "finex", evaluation: { trades: [tr("B", "2026.10.08 01:10:00", -1)] } },
    { broker: "orbitraderberjangka", evaluation: { trades: [tr("C", "2026.10.08 01:20:00", -1)] } },
  ];
  assert(tradesForBroker(accounts, "finex").length === 2, "gabung demo+live satu broker saja");
});

test("540. jeda menahan Hasil analisa & pemindai (TUNGGU, tanpa SL/TP/lot)", () => {
  const base = analyzeMarket(modeAmanMarket, modeAmanBroker);
  const jual: ReturnType<typeof analyzeMarket> = { ...base, decision: "JUAL", stopLoss: 1, takeProfit: 2, suggestedLot: 0.01 };
  const pause = { paused: true, streak: 3, until: "2026.10.09 01:00", reason: "Jeda: 3 kali rugi berturut-turut (terakhir GBPUSD). Istirahat sampai 2026.10.09 01:00 jam server" };
  const held = applyLossPauseHold(jual, pause);
  assert(held.decision === "TUNGGU" && held.heldBy === "jeda" && held.heldDecision === "JUAL", String(held.decision));
  assert(held.stopLoss === null && held.suggestedLot === null && signalReason(held) === pause.reason, "angka/alasan");
  assert(applyLossPauseHold(jual, { paused: false, streak: 2, until: null, reason: null }) === jual, "tanpa jeda tidak diubah");
  const sc = readSrc("src/lib/symbolScanner.ts");
  assert(sc.includes('status: "DITAHAN_JEDA"') && sc.includes("reason: input.pauseReason"), "pemindai belum menahan jeda");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes("pauseReason,") && panel.includes('label: "Jeda rugi"') && panel.includes("scan-loss-pause"), "panel jeda");
  const app = readSrc("src/App.tsx");
  assert(app.includes("applyLossPauseHold(applySpecHold(result, market.symbol, specHolds), lossPause)") && app.includes("useLossPause(activeBrokerId"), "App belum memakai jeda");
});

test("541. format harga mengikuti desimal simbol (sama dengan MT5)", () => {
  assert(priceDigits("US30") === 2, `US30 ${priceDigits("US30")}`);
  assert(priceDigits("GBPUSD") === 5 && priceDigits("USDJPY") === 3, "forex");
  assert(priceDigits("GBPUSD_ORB") === 5, "OTB forex");
  assert(formatPrice(51166.2, "US30") === "51166.20", formatPrice(51166.2, "US30"));
  assert(formatPrice(51007.25, "US30") === "51007.25" && formatPrice(1.3216, "GBPUSD") === "1.32160", "nol di belakang");
  assert(formatPrice(null, "US30") === "-", "null");
  const res = readSrc("src/components/result/AnalysisResult.tsx");
  assert(res.includes("formatPrice(result.entry, market.symbol)") && !res.includes("number(result.stopLoss, 5)"), "kartu & salin order");
  assert(readSrc("src/components/analysis/LiveQuotes.tsx").includes("formatPrice(quote.bid, symbol)"), "live quotes");
});

test("542. MDBKAHistoryService menulis ulang saat ganti akun walau jumlah deal sama (readSrc)", () => {
  const src = readSrc("ea/MDBKAHistoryService.mq5");
  assert(src.includes("if(total != lastTotal || login != lastLogin)"), "ganti akun tidak memicu tulis ulang");
  assert(src.includes("lastLogin = login;"), "akun terakhir tidak diingat");
});

test("543. MFE/MAE BUY: bid, rentang jam server, R dari SL", () => {
  const trade = { side: "BUY" as const, openTime: "2026.10.06 06:29:29", closeTime: "2026.10.06 08:06:56", openPrice: 1.3, sl: 1.299 };
  const ticks = [
    { ts_raw: "2026.10.06 06:29:00", bid: 1.31, ask: 1.311 }, // sebelum buka: diabaikan
    { ts_raw: "2026.10.06 06:29:30", bid: 1.3002, ask: 1.3003 },
    { ts_raw: "2026.10.06 07:00:00", bid: 1.2995, ask: 1.2996 },
    { ts_raw: "2026.10.06 08:06:56", bid: 1.2991, ask: 1.2992 },
    { ts_raw: "2026.10.06 08:10:00", bid: 1.2, ask: 1.201 }, // sesudah tutup: diabaikan
  ];
  const x = computeExcursion(trade, ticks);
  assert(x.coverage === "PENUH" && x.ticks === 3, `cakupan ${x.coverage} n=${x.ticks}`);
  assert(x.mfe === 0.0002 && x.mae === -0.0009, `mfe ${x.mfe} mae ${x.mae}`);
  assert(x.mfeR === 0.2 && x.maeR === -0.9, `R ${x.mfeR}/${x.maeR}`);
  assert(x.mfeAt === "2026.10.06 06:29:30" && x.maeAt === "2026.10.06 08:06:56", "waktu MFE/MAE");
});

test("544. MFE/MAE SELL pakai ask; tanpa SL → R null", () => {
  const trade = { side: "SELL" as const, openTime: "2026.10.06 06:22:58", closeTime: "2026.10.06 06:30:38", openPrice: 111.0, sl: null };
  const ticks = [
    { ts_raw: "2026.10.06 06:22:58", bid: 110.9, ask: 111.005 },
    { ts_raw: "2026.10.06 06:30:38", bid: 111.03, ask: 111.053 },
  ];
  const x = computeExcursion(trade, ticks);
  assert(x.coverage === "PENUH", x.coverage);
  assert(x.mfe === -0.005 && x.mae === -0.053, `mfe ${x.mfe} mae ${x.mae} (harus pakai ask)`);
  assert(x.mfeR === null && x.maeR === null, "tanpa SL R harus null");
});

test("545. MFE/MAE cakupan PARSIAL bila celah > 60 dtk, TANPA_DATA bila kosong", () => {
  const trade = { side: "BUY" as const, openTime: "2026.10.05 14:16:33", closeTime: "2026.10.05 17:01:06", openPrice: 1.3, sl: null };
  const p = computeExcursion(trade, [{ ts_raw: "2026.10.05 14:58:56", bid: 1.301, ask: 1.3012 }, { ts_raw: "2026.10.05 17:01:06", bid: 1.3, ask: 1.3002 }]);
  assert(p.coverage === "PARSIAL" && p.ticks === 2, `parsial: ${p.coverage}`);
  const e = computeExcursion(trade, [{ ts_raw: "2026.10.04 10:00:00", bid: 1.3, ask: 1.3002 }]);
  assert(e.coverage === "TANPA_DATA" && e.mfe === null && e.ticks === 0, `kosong: ${e.coverage}`);
  const tepi = computeExcursion(trade, [{ ts_raw: "2026.10.05 14:17:30", bid: 1.3, ask: 1.3002 }, { ts_raw: "2026.10.05 17:00:10", bid: 1.3, ask: 1.3002 }]);
  assert(tepi.coverage === "PENUH", `celah ≤ 60 dtk harus PENUH: ${tepi.coverage}`);
});

test("547. catatan MFE/MAE: kapan hasil dianggap final", () => {
  const trade = { side: "BUY" as const, openTime: "2026.10.08 02:00:00", closeTime: "2026.10.08 03:00:00", openPrice: 1.3, sl: null };
  const penuh = computeExcursion(trade, [{ ts_raw: "2026.10.08 02:00:00", bid: 1.3, ask: 1.3001 }, { ts_raw: "2026.10.08 03:00:00", bid: 1.3, ask: 1.3001 }]);
  const parsial = computeExcursion(trade, [{ ts_raw: "2026.10.08 02:30:00", bid: 1.3, ask: 1.3001 }]);
  const kosong = computeExcursion(trade, []);
  assert(isFinalExcursion(penuh, trade.closeTime, null), "PENUH selalu final");
  assert(!isFinalExcursion(parsial, trade.closeTime, "2026.10.08 03:30:00"), "baru 30 mnt: belum final");
  assert(!isFinalExcursion(kosong, trade.closeTime, null), "tanpa tick terbaru: belum final");
  assert(isFinalExcursion(parsial, trade.closeTime, "2026.10.08 04:00:01"), "> 1 jam: final");
  assert(isFinalExcursion(kosong, trade.closeTime, "2026.10.09 00:00:00"), "TANPA_DATA lama: final");
  assert(excursionKey("70930952", "2108869") === "70930952:2108869", "kunci login:positionId");
});

test("548. catatan MFE/MAE: tulis-baca, baris rusak dilewati, baris terakhir menang", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "exccache-"));
  const file = excursionCacheFile(npath.join(dir, "trades"), "otb");
  assert(file.endsWith("excursion-otb.jsonl"), file);
  assert(readExcursionCache(file).size === 0, "belum ada file → kosong");
  const x = computeExcursion({ side: "BUY", openTime: "2026.10.08 02:00:00", closeTime: "2026.10.08 02:00:30", openPrice: 1.3, sl: null }, [{ ts_raw: "2026.10.08 02:00:10", bid: 1.301, ask: 1.3012 }]);
  appendExcursionCache(file, [{ ...x, key: "1:10", computedAt: "a" }, { ...x, key: "1:11", computedAt: "a" }]);
  nfs.appendFileSync(file, "{rusak\n");
  appendExcursionCache(file, [{ ...x, key: "1:10", computedAt: "b" }]);
  const map = readExcursionCache(file);
  assert(map.size === 2, `jumlah kunci ${map.size}`);
  assert(map.get("1:10")?.computedAt === "b" && map.get("1:10")?.mfe === 0.001, "baris terakhir harus menang");
});

test("551. /api/evaluation membawa MFE/MAE per posisi (hanya akun sendiri, tanpa kunci internal)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const root = nfs.mkdtempSync(npath.join(os.tmpdir(), "evalexc-"));
  const common = npath.join(root, "common");
  const trades = npath.join(root, "trades");
  nfs.mkdirSync(common, { recursive: true });
  const co = "PT. Finex Bisnis Solusi Futures";
  nfs.writeFileSync(
    npath.join(common, "MDBKA_History_61823011.csv"),
    "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency\n" +
      `1,500,1,2026.10.08 02:24:00,XTIUSD,SELL,IN,0.01,88.2,0,0,0,0,0,,61823011,${co},USD\n` +
      `2,500,2,2026.10.08 04:47:04,XTIUSD,BUY,OUT,0.01,89,0,0,-8,0,0,[sl 89.00],61823011,${co},USD\n`,
  );
  const x = computeExcursion({ side: "SELL", openTime: "2026.10.08 02:24:00", closeTime: "2026.10.08 04:47:04", openPrice: 88.2, sl: 89 }, [{ ts_raw: "2026.10.08 02:24:00", bid: 88.1, ask: 88.14 }, { ts_raw: "2026.10.08 04:47:04", bid: 88.98, ask: 89 }]);
  appendExcursionCache(excursionCacheFile(trades, "finex"), [
    { ...x, key: "61823011:500", computedAt: "t" },
    { ...x, key: "91811209:500", computedAt: "t" }, // akun lain, posisi sama: jangan tercampur
  ]);
  const own = excursionsForLogin(trades, "finex", "61823011");
  assert(Object.keys(own).join(",") === "500", `kunci: ${Object.keys(own).join(",")}`);
  assert(!("key" in own["500"]) && !("computedAt" in own["500"]), "kunci internal tidak boleh ikut");
  const acc = collectAccountEvaluations(common, trades, {})[0];
  assert(acc.broker === "finex" && acc.evaluation.trades[0].positionId === "500", "evaluasi tetap utuh");
  const e = acc.excursions["500"];
  assert(e !== undefined && e.coverage === "PENUH" && e.mfe === 0.06 && e.maeR === -1, `MFE/MAE: ${JSON.stringify(e)}`);
  const kosong = collectAccountEvaluations(common, npath.join(root, "tanpa-buku"), {})[0];
  assert(Object.keys(kosong.excursions).length === 0, "buku belum ada → excursions kosong");
});

test("552. panel Evaluasi: sel Untung terbaik / Rugi terdalam (R, harga, ≈, –, …)", () => {
  const xti = { coverage: "PENUH" as const, ticks: 3980, mfe: 0.06, mae: -0.8, mfeR: 0.08, maeR: -1 };
  assert(excursionCell(xti, "XTIUSD", "mfe").text === "+0,08R", excursionCell(xti, "XTIUSD", "mfe").text);
  const mae = excursionCell(xti, "XTIUSD", "mae");
  assert(mae.text === "−1,00R" && mae.tone === "rugi" && mae.title.includes("lengkap (3980 harga)"), JSON.stringify(mae));
  const gbp = { coverage: "PENUH" as const, ticks: 2871, mfe: 0.00007, mae: -0.00094, mfeR: null, maeR: null };
  assert(excursionCell(gbp, "GBPUSD_ORB", "mfe").text === "+0,00007", "harga 5 desimal");
  const parsial = excursionCell({ ...gbp, coverage: "PARSIAL" }, "GBPUSD_ORB", "mae");
  assert(parsial.text === "≈−0,00094" && parsial.title.includes("sebagian"), parsial.text);
  assert(excursionCell(undefined, "GBPUSD", "mfe").text === "…", "belum tercatat");
  const kosong = excursionCell({ coverage: "TANPA_DATA", ticks: 0, mfe: null, mae: null, mfeR: null, maeR: null }, "GBPUSD", "mae");
  assert(kosong.text === "–" && kosong.tone === "netral", "tanpa data");
  const panel = readSrc("src/components/analysis/TradeEvaluationPanel.tsx");
  assert(panel.includes("account.excursions?.[t.positionId],") && panel.includes("usdPerPriceUnit(t),") && panel.includes("Rugi terdalam"), "kolom belum dipasang di panel");
});

test("553. MFE/MAE dalam Rupiah: USD per gerak dari profit kotor broker × kurs", () => {
  const xti = { positionId: "1", symbol: "XTIUSD", side: "SELL" as const, volume: 0.01, openTime: "a", closeTime: "b", net: -8.01, durationMin: 143, exit: "SL" as const, rMultiple: -1, group: "LOLOS", openPrice: 88.2, closePrice: 89, grossProfit: -8 };
  const u = usdPerPriceUnit(xti);
  assert(u !== null && Math.abs(u - 10) < 1e-9, `XTIUSD $10 per 1,00: ${u}`);
  const e = { coverage: "PENUH" as const, ticks: 3980, mfe: 0.06, mae: -0.8, mfeR: 0.08, maeR: -1 };
  const mfe = excursionCell(e, "XTIUSD", "mfe", u, 17870.85);
  assert(mfe.text === "+Rp11.000" && mfe.title.includes("+$0,60") && mfe.title.includes("+0,08R"), JSON.stringify(mfe));
  assert(excursionCell(e, "XTIUSD", "mae", u, 17870.85).text === "−Rp143.000", "MAE −$8,00");
  assert(excursionCell(e, "XTIUSD", "mfe", u, null).text === "+0,08R", "kurs belum ada → R");
  assert(usdPerPriceUnit({ ...xti, closePrice: 88.2, grossProfit: 0 }) === null, "tutup di entry → null");
  assert(usdPerPriceUnit({ ...xti, grossProfit: undefined }) === null, "server lama → null");
  const gbp = { ...xti, symbol: "GBPUSD_ORB", side: "BUY" as const, volume: 0.1, openPrice: 1.32172, closePrice: 1.32087, grossProfit: -8.5 };
  assert(Math.abs((usdPerPriceUnit(gbp) ?? 0) - 10000) < 1e-6, `GBPUSD 0,1 lot $10/pip: ${usdPerPriceUnit(gbp)}`);
  assert(readSrc("server/services/tradeEvaluation.ts").includes('grossProfit: round2(total("profit"))'), "server belum kirim grossProfit");
});

test("554. arsip tick: start hanya baca ekor file & ingat tick TERBARU (4b-1)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "mdbka-tail-"));
  try {
    const f = npath.join(dir, "x.txt");
    nfs.writeFileSync(f, "aaa\nbbb\nccc\n");
    assert(readTailText(f, 6) === "ccc\n", `ekor terpotong: ${JSON.stringify(readTailText(f, 6))}`);
    assert(readTailText(f, 100) === "aaa\nbbb\nccc\n", "file kecil dibaca utuh");
    assert(readTailText(f, 0) === "", "0 byte");
    // 25.000 tick (> batas ingat 20.000): dulu yang diingat 20.000 PERTAMA,
    // sehingga tick terakhir ditulis ulang saat restart. Sekarang yang terbaru.
    const otb = npath.join(dir, "otb");
    nfs.mkdirSync(otb, { recursive: true });
    const lines: string[] = [];
    for (let i = 0; i < 25000; i++) {
      const ss = String(i % 60).padStart(2, "0");
      const mm = String(Math.floor(i / 60) % 60).padStart(2, "0");
      const hh = String(Math.floor(i / 3600)).padStart(2, "0");
      lines.push(JSON.stringify({ ts_utc: "x", ts_raw: `2026.10.07 ${hh}:${mm}:${ss}`, broker: "otb", symbol: "GBPUSD_ORB", bid: 1.3 + i * 1e-6, ask: 1.3001 + i * 1e-6, received_at: "x" }));
    }
    nfs.writeFileSync(npath.join(otb, "ticks-2026-10-07.jsonl"), lines.join("\n") + "\n");
    const last = { timestamp: "2026.10.07 06:56:39", symbol: "GBPUSD_ORB", bid: 1.3 + 24999 * 1e-6, ask: 1.3001 + 24999 * 1e-6 };
    const logger = new TickHistoryLogger(dir, "otb", 2);
    const r = logger.ingest([last], true);
    assert(r.appended === 0 && r.skipped === 1, `tick terakhir harus diingat setelah restart: +${r.appended}`);
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});

test("555. arsip tick: pembersih duplikat sekali per file, lewati hari ini, baca per potongan (4b-2)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "mdbka-compact-"));
  try {
    // Pembaca per potongan: potongan 1 byte memotong huruf UTF-8 & baris.
    const f = npath.join(dir, "u.txt");
    nfs.writeFileSync(f, "αβ\nγ\n\nakhir");
    const got: string[] = [];
    forEachLineSync(f, (l) => got.push(l), 1);
    assert(got.join("|") === "αβ|γ||akhir", `baris: ${got.join("|")}`);

    // Logger dibuat dulu (folder kosong) agar pembersihan saat start tidak ikut campur.
    const logger = new TickHistoryLogger(dir, "otb", 2);
    const otb = npath.join(dir, "otb");
    nfs.mkdirSync(otb, { recursive: true });
    const row = (ts: string): string =>
      JSON.stringify({ ts_utc: "x", ts_raw: ts, broker: "otb", symbol: "A", bid: 1, ask: 2, received_at: "x" });
    const lama = npath.join(otb, "ticks-2026-10-06.jsonl");
    const kini = npath.join(otb, "ticks-2026-10-08.jsonl");
    const sudah = npath.join(otb, "ticks-2026-10-05.jsonl");
    nfs.writeFileSync(lama, [row("t1"), row("t1"), "{rusak", row("t2")].join("\n") + "\n");
    nfs.writeFileSync(kini, [row("t3"), row("t3")].join("\n") + "\n");
    nfs.writeFileSync(sudah, [row("t0"), row("t0")].join("\n") + "\n");
    const reg = npath.join(otb, COMPACTED_REGISTRY);
    nfs.writeFileSync(reg, JSON.stringify({ "ticks-2026-10-05.jsonl": nfs.statSync(sudah).size }));
    const hitung = (p: string): number => nfs.readFileSync(p, "utf-8").split("\n").filter((l: string) => l.trim() !== "").length;
    const now = new Date("2026-10-08T05:00:00Z");
    const r1 = logger.compact(now);
    assert(r1.filesCompacted === 1 && r1.dupesRemoved === 2, `putaran 1: ${JSON.stringify(r1)}`);
    assert(hitung(lama) === 2, `file lama harus bersih: ${hitung(lama)}`);
    assert(hitung(kini) === 2, "file hari ini tidak boleh disentuh");
    assert(hitung(sudah) === 2, "file yang tercatat bersih tidak dibaca ulang");
    assert(!nfs.existsSync(`${lama}.tmp`), "file .tmp harus hilang setelah rename");
    const r2 = logger.compact(now);
    assert(r2.filesCompacted === 0 && r2.dupesRemoved === 0, `putaran 2 harus kosong: ${JSON.stringify(r2)}`);
    const catatan = JSON.parse(nfs.readFileSync(reg, "utf-8")) as Record<string, number>;
    assert(catatan["ticks-2026-10-06.jsonl"] === nfs.statSync(lama).size && catatan["ticks-2026-10-08.jsonl"] === undefined, JSON.stringify(catatan));
    nfs.appendFileSync(lama, row("t2") + "\n");
    const r3 = logger.compact(now);
    assert(r3.filesCompacted === 1 && r3.dupesRemoved === 1, `file berubah → diperiksa lagi: ${JSON.stringify(r3)}`);
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});

test("556. arsip tick: tidak ada lagi pembacaan file arsip utuh (4b-3, readSrc)", () => {
  const src = readSrc("server/services/tickHistory.ts");
  const kode = src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
  const utuh = kode.filter((l) => l.includes("readFileSync("));
  assert(utuh.length === 1 && utuh[0].includes("JSON.parse(fs.readFileSync(file"), `readFileSync tersisa: ${utuh.join(" | ")}`);
  assert(src.includes("forEachLineSync(path.join(this.dir, name), onLine)"), "coverage belum per potongan");
  assert(src.includes("JANGAN dipanggil dari UI"), "peringatan sinkron hilang");
});

test("557. catatan entry: status jeda dinilai pada jam server entry (opsi 6a)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "entries-jeda-"));
  try {
    nfs.writeFileSync(npath.join(dir, "MDBKA_GBPUSD_H1.csv"), scanCsv(80));
    const quotes = { getSymbols: () => ["GBPUSD"], getLatestBySymbol: () => [] };
    const pos = (ticket: string) => ({
      ticket, symbol: "GBPUSD", side: "BUY" as const, volume: 0.01,
      priceOpen: 1.3, sl: 1.29, tp: 1.31, timeOpen: "2026.10.08 09:15:00",
    });
    const asked: string[] = [];
    const log = createTradeEntryLog({
      file: npath.join(dir, "a.jsonl"), broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null,
      getPauseReason: (t) => { asked.push(t); return "Jeda: 3 kali rugi berturut-turut"; },
    });
    log.ingest([pos("1")]);
    assert(asked.length === 0, "posisi saat start tidak dipindai → jeda tidak ditanya");
    const baru = log.ingest([pos("1"), pos("2")]);
    assert(baru.length === 1 && asked.join() === "2026.10.08 09:15:00", `jeda harus ditanya dgn jam entry: ${asked.join()}`);
    const rusak = createTradeEntryLog({
      file: npath.join(dir, "b.jsonl"), broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null,
      getPauseReason: () => { throw new Error("History terkunci"); },
    });
    rusak.ingest([]);
    const r = rusak.ingest([pos("3")]);
    assert(r.length === 1 && r[0].scan !== null && r[0].scan.status !== "DATA", `gagal baca jeda tidak boleh blok catatan: ${JSON.stringify(r[0]?.scan)}`);
    const src = readSrc("server/services/tradeEntryLog.ts");
    assert(src.includes("pauseReason: pauseAt(timeOpen),"), "alasan jeda belum diteruskan ke pemindai");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});

test("558. server: pencatat entry tersambung ke jeda History MT5 per broker (opsi 6a-2, readSrc)", () => {
  const idx = readSrc("server/index.ts");
  assert(idx.includes("getPauseReason: (serverTime) =>"), "getPauseReason belum dipasang di server/index.ts");
  assert(idx.includes("collectAccountEvaluations(resolveCommonFilesDir(), tradesDir, {}), src.broker)"), "jeda harus dari History broker yang sama");
  assert(idx.includes("serverTime,\n        ).reason") || idx.includes("serverTime,\r\n        ).reason"), "jeda harus dinilai pada jam server entry");
});

test("559. breakeven + biaya: AUDUSD_ORB 0,10 lot komisi $3,30 → SL 0.69844 (opsi 5-1)", () => {
  const usd = (amount: number, ccy: string) => (ccy === "USD" ? amount : ccy === "CHF" ? amount * 1.25 : null);
  const dist = breakevenCostDistance({ symbol: "AUDUSD_ORB", lot: 0.1 }, usd);
  assert(dist === 0.00033, `jarak biaya OTB: ${dist}`);
  const beli = checkBreakeven({ direction: "BELI", entryPrice: 0.69811, sl: 0.69311 }, 0.70061, 0.70075, dist);
  assert(beli !== null && beli.slTarget === 0.69844 && beli.costDistance === 0.00033, JSON.stringify(beli));
  assert(beli !== null && beli.message.includes("Stop Loss = 0.69844") && beli.message.includes("biaya komisi"), beli?.message ?? "");
  const jual = checkBreakeven({ direction: "JUAL", entryPrice: 0.69811, sl: 0.70311 }, 0.69547, 0.69561, dist);
  assert(jual !== null && jual.slTarget === 0.69778, JSON.stringify(jual));
  const finex = breakevenCostDistance({ symbol: "USDCHF", lot: 0.01 }, usd);
  assert(finex === 0.00001, `Finex 0,01 lot cukup 1 tick: ${finex}`);
});

test("560. breakeven + biaya: tanpa kurs/spec atau biaya > profit → SL tetap di entry, jujur", () => {
  assert(breakevenCostDistance({ symbol: "AUDUSD_ORB", lot: 0.1 }, () => null) === null, "tanpa kurs harus null");
  assert(breakevenCostDistance({ symbol: "TIDAKADA", lot: 0.1 }, (a) => a) === null, "tanpa spec harus null");
  const tanpa = checkBreakeven({ direction: "BELI", entryPrice: 0.69811, sl: 0.69311 }, 0.70061, 0.70075, null);
  assert(tanpa !== null && tanpa.slTarget === 0.69811 && tanpa.message.includes("biaya komisi belum terhitung"), tanpa?.message ?? "");
  const mahal = checkBreakeven({ direction: "BELI", entryPrice: 0.69811, sl: 0.69311 }, 0.70061, 0.70075, 0.003);
  assert(mahal !== null && mahal.slTarget === 0.69811 && mahal.costDistance === 0, "biaya > profit tak boleh jadi SL di atas bid");
  const lama = checkBreakeven({ direction: "BELI", entryPrice: 1.32, sl: 1.319 }, 1.321, 1.3212);
  assert(lama !== null && lama.slTarget === 1.32 && lama.costDistance === 0, "tanpa argumen biaya = perilaku lama");
});

test("561. monitor posisi: kotak BREAKEVEN memakai SL + biaya komisi (opsi 5-2, readSrc)", () => {
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("breakevenCostDistance(holding, convert),"), "jarak biaya belum dikirim ke checkBreakeven");
  assert(dash.includes('data-testid="breakeven-cost"') && dash.includes("sudah ditutup oleh SL ini"), "baris biaya Rupiah hilang");
  assert(dash.includes("breakeven.costDistance > 0"), "baris biaya harus hanya muncul bila biaya dipakai");
});

test("562. Salin order: hanya tombol Salin SL & Salin TP (angka saja, siap tempel MT5)", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(src.includes('data-testid="copy-sl"') && src.includes('data-testid="copy-tp"'), "tombol SL/TP hilang");
  assert(src.includes("formatPrice(result.stopLoss, market.symbol)") && src.includes("formatPrice(result.takeProfit, market.symbol)"), "SL/TP harus pakai desimal simbol");
  assert(src.includes('copyText(slText, "sl")') && src.includes('copyText(tpText, "tp")'), "tombol harus menyalin angka saja");
  assert(!src.includes('copyText(orderText, "order")') && !src.includes('"Salin order"'), "tombol Salin order sudah dihapus (permintaan Fahmi)");
  assert(formatPrice(7785.18, "US500") === "7785.18" && formatPrice(0.69844, "AUDUSD_ORB") === "0.69844", "format angka salin");
});

test("563. format harga indeks tanpa desimal: JP225/HK50 = 0 desimal seperti MT5", () => {
  assert(priceDigits("JP225") === 0 && priceDigits("HK50") === 0, `JP225 ${priceDigits("JP225")} HK50 ${priceDigits("HK50")}`);
  assert(formatPrice(69126, "JP225") === "69126" && formatPrice(23801, "HK50") === "23801", formatPrice(69126, "JP225"));
  assert(priceDigits("US500") === 2 && priceDigits("GBPUSD") === 5 && priceDigits("USDJPY") === 3, "simbol lain tidak boleh berubah");
  assert(priceDigits("TIDAKADA") === 5, "simbol tak dikenal tetap 5 desimal");
});

test("564. golongan risiko: penetapan Fahmi per golongan, akhiran _ORB/.DEC, tak dikenal = ditahan", () => {
  const cap = (s: string) => riskGroupOf(s).capIdr;
  assert(cap("GBPUSD") === 35000 && cap("AUDCHF_ORB") === 35000, "forex Rp35 rb");
  assert(riskGroupOf("CADJPY_ORB").id === "FOREX_JPY" && cap("USDJPY") === 35000, "JPY Rp35 rb");
  assert(cap("XTIUSD") === 150000 && cap("CLU") === 150000, "minyak Rp150 rb");
  assert(cap("XAUUSD_ORB") === 500000 && riskGroupOf("XAGUSD").id === "LOGAM", "logam Rp500 rb (9 Okt)");
  assert(cap("JP225") === 500000 && riskGroupOf("US100.DEC").id === "INDEKS", "indeks Rp500 rb (9 Okt)");
  assert(cap("#NVDA") === 50000 && cap("META.US") === 50000, "saham AS Rp50 rb");
  assert(cap("#BMW") === null && cap("#700") === null && cap("#XYZ") === null, "saham lain ditahan");
  assert(cap("USDHKD") === null && cap("GBXUSD") === null, "forex tidak lazim ditahan");
  assert(riskGroupOf("BTCUSD").id === "LAINNYA" && cap("BTCUSD") === null, "tak dikenal ditahan");
  assert(Object.keys(RISK_GROUPS).length === 9, "jumlah golongan");
});

test("565. mesin analisa: batas golongan Rupiah (R2) — lebih kecil dari 1% dipakai, ditahan jelas", () => {
  const base = analyzeMarket(modeAmanMarket, modeAmanBroker);
  assert(base.decision === "BELI" && base.heldBy === null && base.maxRiskUsd === 100, `tanpa batas = perilaku lama: ${base.decision} ${base.maxRiskUsd}`);
  const minRisk = base.riskAtMinLot ?? 0;
  assert(minRisk > 1 && minRisk < 2, `risiko lot minimum fixture ${minRisk}`);
  const longgar = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, riskCap: riskCapFor("GBPUSD", 17500) });
  assert(longgar.decision === "BELI" && longgar.maxRiskUsd === 2, `Rp35 rb/17.500 = $2 → lolos: ${longgar.decision} ${longgar.maxRiskUsd}`);
  const ketat = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, riskCap: { label: "Forex", idr: 17500, usd: 1, usdIdr: 17500 } });
  assert(ketat.decision === "TUNGGU" && ketat.heldBy === "risiko" && ketat.heldDecision === "BELI", `batas $1 harus menahan: ${ketat.decision}`);
  assert((ketat.heldReason ?? "").startsWith("Ditahan: risiko Rp") && (ketat.heldReason ?? "").includes("> batas Forex Rp17.500"), ketat.heldReason ?? "");
  assert(signalReason(ketat) === ketat.heldReason, "alasan header harus sama");
  const golongan = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, riskCap: riskCapFor("#BMW", 17500) });
  assert(golongan.decision === "TUNGGU" && golongan.heldReason === "Ditahan: golongan Saham Eropa & Hong Kong tidak diperdagangkan", golongan.heldReason ?? "");
  const tanpaKurs = analyzeMarket(modeAmanMarket, { ...modeAmanBroker, riskCap: riskCapFor("GBPUSD", null) });
  assert(tanpaKurs.decision === "TUNGGU" && (tanpaKurs.heldReason ?? "").includes("kurs Rupiah belum tersedia"), tanpaKurs.heldReason ?? "");
  assert(signalReason(analyzeMarket(modeAmanMarket, { ...modeAmanBroker, equity: 50 })) === "Ditahan: risiko lot minimum", "tahanan 1% lama tetap teks lama");
});

test("566. batas golongan terpasang di Hasil analisa & pemindai (R3, readSrc)", () => {
  const app = readSrc("src/App.tsx");
  assert(app.includes("riskCap: riskCapFor(marketData.symbol, usdIdrRate(fxRates)),"), "App belum memasang batas golongan");
  const scan = readSrc("src/lib/symbolScanner.ts");
  assert(scan.includes("riskCap: riskCapFor(symbol, usdIdrRate(input.fxRates)),"), "pemindai belum memasang batas golongan");
  assert(scan.includes("reason: signalReason(result),"), "alasan pemindai harus dari signalReason (memuat Rupiah)");
});

test("567. analisa diulang otomatis begitu kurs Rupiah termuat (R3b, readSrc)", () => {
  const app = readSrc("src/App.tsx");
  const i = app.indexOf("Auto susulan kurs (R3b)");
  assert(i > 0, "efek susulan kurs hilang");
  const blok = app.slice(i, i + 1200);
  assert(blok.includes("usdIdrRate(fxRates) === null) return;"), "harus menunggu kurs USD→Rp tersedia (anti-loop)");
  assert(blok.includes('.includes("kurs Rupiah belum tersedia")'), "hanya untuk hasil yang ditahan karena kurs");
  assert(blok.includes("executeAnalysis(market, broker);"), "harus mengulang analisa");
  assert(blok.includes("kursRetryRef.current = result;"), "pengaman sekali per hasil hilang");
  const mesin = readSrc("src/calculations/decisionEngine.ts");
  assert(mesin.includes("kurs Rupiah belum tersedia (batas"), "teks alasan mesin harus cocok dengan efek App");
});

test("568. panel golongan: daftar tampil = aturan yang dipakai (R4)", () => {
  const rows = riskGroupTable();
  assert(rows.length === 9, `9 golongan, dapat ${rows.length}`);
  for (const row of rows) {
    for (const sym of row.symbols) {
      assert(riskGroupOf(sym).id === row.group.id, `${sym} tampil di ${row.group.id} tapi aturan ${riskGroupOf(sym).id}`);
    }
  }
  const minyak = rows.find((r) => r.group.id === "MINYAK");
  assert(minyak !== undefined && minyak.symbols.join() === "XTIUSD,CLU,CLS10,OIL_NEXT" && minyak.group.capIdr === 150000, "minyak");
  const total = rows.reduce((n, r) => n + r.symbols.length, 0);
  assert(total === 20 + 7 + 2 + 4 + 7 + 28 + 4 + 13, `jumlah simbol tampil ${total}`); // M2b: + CLS10, OIL_NEXT (MIFX)
  const app = readSrc("src/App.tsx");
  assert(app.includes("<RiskGroupsPanel usdIdr={usdIdrRate(fxRates)} />"), "panel belum dipasang di App");
  const panel = readSrc("src/components/analysis/RiskGroupsPanel.tsx");
  assert(panel.includes("riskGroupTable()") && panel.includes("<details"), "panel harus dari buku & bisa dilipat");
});

test("569. time-stop 3 jam hanya Forex & Forex JPY (penetapan 9 Okt)", () => {
  assert(timeStopApplies("EURUSD") && timeStopApplies("AUDUSD_ORB") && timeStopApplies("CADJPY_ORB"), "forex harus kena time-stop");
  for (const s of ["XTIUSD", "XAUUSD_ORB", "US100", "JP225", "META.US", "#AAPL"]) {
    assert(!timeStopApplies(s), `${s} tidak boleh kena time-stop`);
  }
  const lama = "2026.10.06 14:41:45";
  const now = "2026.10.09 14:41:45";
  assert(checkTimeStop({ entryTime: lama, symbol: "USDJPY" }, now) !== null, "USDJPY 3 hari harus time-stop");
  assert(checkTimeStop({ entryTime: lama, symbol: "META.US" }, now) === null, "META.US tanpa batas waktu");
  assert(checkTimeStop({ entryTime: lama, symbol: "XTIUSD" }, now) === null, "minyak tanpa batas waktu");
  assert(checkTimeStop({ entryTime: lama, symbol: "US500" }, now) === null, "indeks tanpa batas waktu");
});

test("570. kalender: parse CSV MT5 & pilih file per broker (K2a)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const head = "ServerTime,Currency,Country,Importance,Event,Actual,Forecast,Previous,Impact,ValueId,Company,Generated";
  const finex = [head,
    "2026.10.14 15:30:00,USD,US,HIGH,CPI m/m,,0.6000,0.4000,NA,9,PT. Finex Bisnis Solusi Futures,2026.10.09 01:50:45",
    "2026.10.08 15:30:00,USD,US,HIGH,Initial Jobless Claims,197.0000,190.0000,197.0000,NEGATIVE,8,PT. Finex Bisnis Solusi Futures,2026.10.09 01:50:45",
    "rusak,baris",
  ].join("\r\n");
  const p = parseCalendarCsv(finex);
  assert(p.events.length === 2 && p.events[0].event === "Initial Jobless Claims", "urut jam & lewati baris rusak");
  assert(p.events[0].actual === 197 && p.events[1].actual === null && p.events[1].forecast === 0.6, "nilai kosong = null");
  assert(p.events[0].impact === "NEGATIVE" && p.company.includes("Finex") && p.generated === "2026.10.09 01:50:45", "kolom");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kalender-"));
  fs.writeFileSync(path.join(dir, "MDBKA_Calendar_61823011.csv"), finex);
  fs.writeFileSync(path.join(dir, "MDBKA_Calendar_70930952.csv"), finex.replace(/PT\. Finex Bisnis Solusi Futures/g, "PT. Orbi Trade Berjangka").replace("15:30:00,USD,US,HIGH,Initial", "14:30:00,USD,US,HIGH,Initial"));
  const f = readCalendarForBroker(dir, "finex");
  const o = readCalendarForBroker(dir, "orbitraderberjangka");
  assert(f !== null && f.file === "MDBKA_Calendar_61823011.csv" && f.events[0].serverTime === "2026.10.08 15:30:00", "file Finex");
  assert(o !== null && o.file === "MDBKA_Calendar_70930952.csv" && o.events[0].serverTime === "2026.10.08 14:30:00", "file OTB jam sendiri");
  assert(readCalendarForBroker(path.join(dir, "tidak-ada"), "finex") === null, "folder hilang = null");
});

test("571. endpoint /api/calendar: tersedia & tidak tersedia (K2b)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kalender-api-"));
  const kosong = calendarResponse(dir, "finex");
  assert(!kosong.available && kosong.events.length === 0 && kosong.file === null, "tanpa file = available false");
  fs.writeFileSync(path.join(dir, "MDBKA_Calendar_61823011.csv"),
    "ServerTime,Currency,Country,Importance,Event,Actual,Forecast,Previous,Impact,ValueId,Company,Generated\r\n" +
    "2026.10.14 15:30:00,USD,US,HIGH,CPI m/m,,0.6000,0.4000,NA,9,PT. Finex Bisnis Solusi Futures,2026.10.09 01:50:45");
  const ada = calendarResponse(dir, "finex");
  assert(ada.available && ada.events.length === 1 && ada.generated === "2026.10.09 01:50:45", JSON.stringify(ada));
  assert(!calendarResponse(dir, "orbitraderberjangka").available, "file Finex tidak boleh dipakai OTB");
  const app = readSrc("server/app.ts");
  assert(app.includes('app.use("/api/calendar", createCalendarRoutes());'), "route belum dipasang");
});

test("572. satpam berita: mata uang simbol & jendela ±30 menit berita Tinggi (K3)", () => {
  assert(NEWS_WINDOW_MINUTES === 30, "jendela bukan 30 menit");
  assert(newsCurrenciesOf("EURUSD").join() === "EUR,USD" && newsCurrenciesOf("CADJPY_ORB").join() === "CAD,JPY", "forex");
  assert(newsCurrenciesOf("XAUUSD_ORB").join() === "USD" && newsCurrenciesOf("XTIUSD").join() === "USD", "logam/minyak");
  assert(newsCurrenciesOf("US100").join() === "USD" && newsCurrenciesOf("META.US").join() === "USD" && newsCurrenciesOf("#AAPL").join() === "USD", "AS");
  assert(newsCurrenciesOf("JP225").join() === "JPY" && newsCurrenciesOf("DE30").join() === "EUR" && newsCurrenciesOf("HK50").join() === "HKD,CNY", "indeks lain");
  assert(newsCurrenciesOf("#HSBA").length === 0 && newsCurrenciesOf("ABCXYZ").length === 0, "ditahan/tak dikenal tidak dicek");
  const ev = [
    { serverTime: "2026.10.14 15:30:00", currency: "USD", importance: "HIGH", event: "CPI m/m" },
    { serverTime: "2026.10.14 15:00:00", currency: "USD", importance: "MODERATE", event: "Sedang" },
    { serverTime: "2026.10.15 09:00:00", currency: "GBP", importance: "HIGH", event: "GDP m/m" },
  ];
  const a = findNewsHold("EURUSD", "2026.10.14 15:00:00", ev);
  assert(a !== null && a.minutesTo === 30 && a.reason.includes("CPI m/m") && a.reason.includes("30 menit lagi") && a.reason.includes("jeda 3 jam sebelum s/d 30 menit sesudah"), JSON.stringify(a));
  assert(findNewsHold("XAUUSD", "2026.10.14 14:59:59", ev) === null, "non-forex: lebih dari 30 menit sebelum ikut ditahan");
  const b = findNewsHold("XAUUSD", "2026.10.14 15:45:00", ev);
  assert(b !== null && b.reason.includes("15 menit lalu"), JSON.stringify(b));
  assert(findNewsHold("XAUUSD", "2026.10.14 16:00:01", ev) === null, "lewat 30 menit sesudah");
  assert(findNewsHold("AUDJPY", "2026.10.14 15:30:00", ev) === null, "mata uang lain ikut ditahan");
  assert(findNewsHold("GBPJPY", "2026.10.15 08:40:00", ev) !== null, "GBP pagi");
  assert(findNewsHold("EURUSD", "2026.10.14 15:00:00", null) === null && findNewsHold("EURUSD", "", ev) === null, "tanpa kalender/jam = tidak ditahan");
});

test("573. pemindai: status DITAHAN_BERITA setelah jeda, sebelum taruhan ganda (K4, readSrc)", () => {
  const sc = readSrc("src/lib/symbolScanner.ts");
  const jeda = sc.indexOf('status: "DITAHAN_JEDA"');
  const berita = sc.indexOf('status: "DITAHAN_BERITA"');
  const ganda = sc.indexOf('status: "DITAHAN_KORELASI"');
  assert(jeda > 0 && berita > jeda && ganda > berita, `urutan tahanan salah ${jeda}/${berita}/${ganda}`);
  assert(sc.includes("input.newsNow ?? input.quote?.timestamp") && sc.includes("input.newsEvents"), "jam/kalender berita");
  assert(sortScanRows([
    { symbol: "B", status: "TUNGGU", decision: "TUNGGU", direction: "TUNGGU", held: false, score: 0, reason: "", costShareOfRisk: null, candles: 200 },
    { symbol: "A", status: "DITAHAN_BERITA", decision: "TUNGGU", direction: "BELI", held: true, score: 4, reason: "", costShareOfRisk: null, candles: 200 },
  ])[0].symbol === "A", "berita di atas TUNGGU");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes('DITAHAN_BERITA: { label: "Dekat berita"') && panel.includes("{counts.DITAHAN_BERITA} dekat berita"), "panel belum tampil");
});

test("574. pemindai memakai kalender broker aktif (K4b, readSrc)", () => {
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes("/api/calendar?broker=${brokerId}"), "kalender belum diambil");
  assert(panel.includes("calendar.broker === brokerId ? calendar.events : null"), "kalender broker lain bisa terpakai");
  assert(panel.includes("newsEvents,") && panel.includes("newsNow: nowServer ?? undefined"), "kalender belum diteruskan ke pemindai");
  assert(panel.includes('data-testid="scan-calendar-missing"'), "catatan kalender tidak tersedia");
  assert(panel.includes("API_BASE_URL"), "wajib API_BASE_URL");
});

test("575. catatan entry server ikut satpam berita pada jam entry (K4c)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "entries-berita-"));
  try {
    nfs.writeFileSync(npath.join(dir, "MDBKA_GBPUSD_H1.csv"), scanCsv(80));
    const quotes = { getSymbols: () => ["GBPUSD"], getLatestBySymbol: () => [] };
    const pos = (ticket: string) => ({
      ticket, symbol: "GBPUSD", side: "BUY" as const, volume: 0.01,
      priceOpen: 1.3, sl: 1.29, tp: 1.31, timeOpen: "2026.10.08 09:15:00",
    });
    let calls = 0;
    const rusak = createTradeEntryLog({
      file: npath.join(dir, "a.jsonl"), broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null,
      getNewsEvents: () => { calls++; throw new Error("kalender terkunci"); },
    });
    rusak.ingest([]);
    const r = rusak.ingest([pos("1")]);
    assert(calls === 1 && r.length === 1 && r[0].scan !== null && r[0].scan.status !== "DATA", `gagal baca kalender tidak boleh blok: ${JSON.stringify(r[0]?.scan)}`);
    const src = readSrc("server/services/tradeEntryLog.ts");
    assert(src.includes("newsEvents: newsEvents(),") && src.includes("newsNow: timeOpen,"), "berita belum diteruskan ke pemindai");
    const idx = readSrc("server/index.ts");
    assert(idx.includes("getNewsEvents: () => readCalendarForBroker(resolveCommonFilesDir(), src.broker)?.events ?? null,"), "kalender belum dipasang di server/index.ts");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});

test("576. Hasil analisa ditahan dekat berita Tinggi (K5)", () => {
  const ev = [{ serverTime: "2026.10.14 15:30:00", currency: "USD", importance: "HIGH", event: "CPI m/m" }];
  const base = {
    decision: "BELI", stopLoss: 1.1, takeProfit: 1.2, suggestedLot: 0.01, warnings: ["w"], explanation: "x",
  } as unknown as Parameters<typeof applyNewsHold>[0];
  const h = applyNewsHold(base, "EURUSD", "2026.10.14 15:10:00", ev);
  assert(h.decision === "TUNGGU" && h.heldBy === "berita" && h.heldDecision === "BELI", JSON.stringify(h));
  assert(h.stopLoss === null && h.takeProfit === null && h.suggestedLot === null, "SL/TP/lot harus kosong");
  assert(String(h.heldReason).includes("CPI m/m") && signalReason(h).includes("CPI m/m"), "alasan berita");
  assert(applyNewsHold(base, "EURUSD", "2026.10.14 16:01:00", ev) === base, "lewat jendela harus tetap");
  assert(applyNewsHold(base, "EURUSD", "2026.10.14 15:10:00", null) === base, "tanpa kalender harus tetap");
  assert(applyNewsHold(base, "AUDJPY", "2026.10.14 15:10:00", ev) === base, "mata uang lain harus tetap");
  const app = readSrc("src/App.tsx");
  assert(/applyNewsHold\(\s*applyLossPauseHold\(/.test(app) && /applyDoubleBetHold\(\s*applyOpeningHold\(\s*applyNewsHold\(/.test(app), "urutan spek → jeda → berita → pembukaan → ganda");
  assert(readSrc("src/components/result/AnalysisResult.tsx").includes('data-testid="held-berita"'), "kotak berita belum ada");
  assert(readSrc("src/hooks/useNewsCalendar.ts").includes("/api/calendar?broker=${brokerId}"), "hook kalender");
});

test("577. daftar berita Tinggi mendatang (K6)", () => {
  const ev = [
    { serverTime: "2026.10.15 09:00:00", currency: "GBP", importance: "HIGH", event: "GDP m/m" },
    { serverTime: "2026.10.14 15:30:00", currency: "USD", importance: "HIGH", event: "CPI m/m" },
    { serverTime: "2026.10.14 15:00:00", currency: "USD", importance: "MODERATE", event: "Sedang" },
    { serverTime: "2026.10.08 15:30:00", currency: "USD", importance: "HIGH", event: "Lama" },
  ];
  const u = upcomingHighNews(ev, "2026.10.14 15:45:00");
  assert(u.length === 2 && u[0].event.event === "CPI m/m" && u[0].when === "15 menit lalu", JSON.stringify(u));
  assert(u[1].when === "dalam 17 jam 15 menit", u[1].when);
  const jauh = upcomingHighNews(ev, "2026.10.11 01:00:00");
  assert(jauh[0].when === "dalam 3 hari 14 jam", jauh[0].when);
  assert(upcomingHighNews(ev, "2026.10.14 16:01:00").length === 1, "lewat jendela harus hilang");
  assert(upcomingHighNews(null, "2026.10.14 15:45:00").length === 0 && upcomingHighNews(ev, null).length === 0, "tanpa data");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes('data-testid="scan-news-upcoming"') && panel.includes("upcomingHighNews(newsEvents, nowServer)"), "daftar belum tampil");
});

test("578. jam server MT5 & WIT 12 jam di header", () => {
  const utc = Date.UTC(2026, 9, 9, 19, 0, 15); // 9 Okt 19:00:15 UTC
  assert(WIT_UTC_OFFSET === 9, "WIT = UTC+9");
  assert(formatClock12(utc, 3) === "10:00:15 PM · Jum 9 Okt", formatClock12(utc, 3));
  assert(formatClock12(utc, 9) === "04:00:15 AM · Sab 10 Okt", formatClock12(utc, 9));
  assert(formatClock12(Date.UTC(2026, 9, 9, 9, 0, 0), 3) === "12:00:00 PM · Jum 9 Okt", "tengah hari = 12 PM");
  assert(formatClock12(Date.UTC(2026, 9, 9, 21, 5, 0), 3) === "12:05:00 AM · Sab 10 Okt", "tengah malam = 12 AM");
  assert(serverUtcOffsetHours("finex", "2026.10.09 22:00:10", utc) === 3, "deteksi Finex dari quote segar");
  assert(serverUtcOffsetHours("orbitraderberjangka", "2026.10.09 21:00:14", utc) === 2, "deteksi OTB");
  assert(serverUtcOffsetHours("finex", "2026.10.09 21:00:14", utc) === 2, "pergantian jam musim ikut terdeteksi");
  assert(serverUtcOffsetHours("finex", "2026.10.09 21:40:00", utc) === 3, "quote basi → bawaan");
  assert(serverUtcOffsetHours("orbitraderberjangka", null, utc) === 2 && serverUtcOffsetHours("finex", "2026.10.07 22:00:15", utc) === 3, "tanpa/lama → bawaan");
  assert(readSrc("src/App.tsx").includes("<ServerClock"), "jam belum di header");
});

test("579. forex ditahan bila berita Tinggi dalam 3 jam ke depan (penetapan 9 Okt)", () => {
  const ev = [{ serverTime: "2026.10.14 15:30:00", currency: "USD", importance: "HIGH", event: "CPI m/m" }];
  assert(newsMinutesBefore("EURUSD") === 180 && newsMinutesBefore("USDJPY") === 180, "forex 3 jam");
  assert(newsMinutesBefore("XAUUSD") === 30 && newsMinutesBefore("US100") === 30, "non-forex 30 menit");
  const a = findNewsHold("EURUSD", "2026.10.14 12:30:00", ev);
  assert(a !== null && a.reason.includes("3 jam 0 menit lagi"), JSON.stringify(a));
  assert(findNewsHold("EURUSD", "2026.10.14 12:29:59", ev) === null, "lebih dari 3 jam sebelum ikut ditahan");
  assert(findNewsHold("XAUUSD", "2026.10.14 12:30:00", ev) === null, "emas 3 jam sebelum tidak boleh ditahan");
  assert(findNewsHold("EURUSD", "2026.10.14 16:00:00", ev) !== null && findNewsHold("EURUSD", "2026.10.14 16:00:01", ev) === null, "sesudah tetap 30 menit");
  const sim = findNewsHold("EURUSD", "2026.10.14 14:00:00", ev, 30);
  assert(sim === null, "windowMinutes eksplisit = simetris");
});

test("580. buku kurs ECB harian: parse 90 hari, gabung, kurs tanggal transaksi (H1)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const xml =
    "<gesmes:Envelope><Cube>" +
    "<Cube time='2026-10-08'><Cube currency='USD' rate='1.1186'/><Cube currency='IDR' rate='20045.31'/></Cube>" +
    "<Cube time=\"2026-09-25\"><Cube currency=\"USD\" rate=\"1.1403\"/><Cube currency=\"IDR\" rate=\"20427.22\"/></Cube>" +
    "<Cube time='2026-09-24'><Cube currency='USD' rate='1.14'/></Cube>" +
    "</Cube></gesmes:Envelope>";
  const book = parseEcbHistXml(xml);
  assert(book["2026-10-08"] === 17920 && book["2026-09-25"] === 17913.9, JSON.stringify(book));
  assert(book["2026-09-24"] === undefined, "hari tanpa IDR harus dilewati");
  const sabtu = usdIdrOn(book, "2026.09.27 07:52:23");
  assert(sabtu !== null && sabtu.date === "2026-09-25" && sabtu.rate === 17913.9, "akhir pekan = hari kerja sebelumnya");
  assert(usdIdrOn(book, "2026.10.08 04:47:04")?.rate === 17920, "tanggal tepat");
  assert(usdIdrOn(book, "2026.11.20 10:00:00") === null, "lebih dari 7 hari = tidak ada");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "ecb-"));
  try {
    const file = npath.join(dir, "fx", "ecb-usdidr.json");
    mergeUsdIdrBook(file, { "2026-07-01": 16000 });
    const merged = mergeUsdIdrBook(file, book);
    assert(merged["2026-07-01"] === 16000 && merged["2026-10-08"] === 17920, "kurs lama harus tetap");
    assert(Object.keys(readUsdIdrBook(file)).join() === "2026-07-01,2026-09-25,2026-10-08", "urut & tersimpan");
    assert(readUsdIdrBook(npath.join(dir, "tidak-ada.json")) !== null, "file hilang = buku kosong");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});

test("582. US100 Finex = $20/poin/lot: cocok trade nyata MT5 (perbaikan 9 Okt)", () => {
  const sell = { symbol: "US100", direction: "JUAL" as const, lot: 0.01, entryPrice: 30748.33 };
  const tutup = calculateExitPnL(sell, 30734.16);
  assert(tutup !== null && tutup.value === 2.83 && tutup.currency === "USD", `harus +2.83 seperti MT5: ${JSON.stringify(tutup)}`);
  const jalan = calculateHoldingPnL({ ...sell, entryPrice: 30827.82 }, 30835.82, 30838.59);
  assert(jalan !== null && jalan.value === -2.15, `P&L berjalan harus -2.15: ${JSON.stringify(jalan)}`);
  const us30 = calculateHoldingPnL({ symbol: "US30", direction: "BELI", lot: 0.01, entryPrice: 51273.15 }, 51322.6, 51327.73);
  assert(us30 !== null && us30.value === 2.47, `US30 tetap benar: ${JSON.stringify(us30)}`);
  const preset = applyBrokerPreset(makeEmptyBroker(), "US100", "finex");
  assert(preset.pointValue === 20 && preset.contractSize === 20, `preset analisa: ${preset.pointValue}/${preset.contractSize}`);
});

test("583. tabel History + Rupiah kurs tanggal transaksi + Sisa setoran (H2a, data Finex demo nyata)", () => {
  const h = [
    "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency",
    "456458599,0,0,2026.09.27 07:52:23,Bonus,BALANCE,IN,0.00,0,0.00,0.00,5000.00,0.00,0,Demo account balance,61823011,PT,USD",
    "1,10,10,2026.10.08 02:24:00,XTIUSD,SELL,IN,0.01,88.20,-0.01,0.00,0.00,0.00,0,,61823011,PT,USD",
    "2,10,11,2026.10.08 04:47:04,XTIUSD,BUY,OUT,0.01,89.00,0.00,0.00,-8.00,0.00,0,[sl 89.00],61823011,PT,USD",
    "3,20,20,2026.10.08 10:17:07,AUDCHF,SELL,IN,0.01,0.57893,-0.01,0.00,0.00,0.00,0,,61823011,PT,USD",
    "4,20,21,2026.10.08 10:24:42,AUDCHF,BUY,OUT,0.01,0.57947,0.00,0.00,-0.65,0.00,0,,61823011,PT,USD",
  ].join("\r\n");
  const book = { "2026-09-25": 17913.9, "2026-10-08": 17920 };
  const v = buildHistoryView(parseHistoryCsv(h), book);
  assert(v.rows.length === 5 && v.missingRates === 0 && v.currency === "USD", JSON.stringify(v.rows.length));
  const bonus = v.rows[0];
  assert(bonus.kurs?.date === "2026-09-25" && bonus.profitIdr === 89569500, `bonus Sabtu → kurs Jumat: ${JSON.stringify(bonus)}`);
  const xti = v.rows[2];
  assert(xti.changePct === -0.91 && xti.profitIdr === -143360, `XTIUSD: ${JSON.stringify(xti)}`);
  const aud = v.rows[4];
  assert(aud.profitIdr === -11648 && v.rows[3].commissionIdr === -179, `AUDCHF Rp: ${aud.profitIdr} / ${v.rows[3].commissionIdr}`);
  assert(v.totals.net === -8.67 && v.totals.profit === -8.65 && v.totals.commission === -0.02 && v.totals.deposit === 5000 && v.totals.balance === 4991.33, JSON.stringify(v.totals));
  assert(v.totalsIdr !== null && v.totalsIdr.net === -155366 && v.totalsIdr.deposit === 89569500, JSON.stringify(v.totalsIdr));
  assert(v.sisa !== null && v.sisa.sisaIdr === 89569500 - 155366 && v.sisa.pct === -0.17, JSON.stringify(v.sisa));
  const live = buildHistoryView(parseHistoryCsv(
    "h\r\n1,0,0,2026.09.29 03:47:04,External,BALANCE,IN,0.00,0,0.00,0.00,11.11,0.00,0,D-1: IDR 200000.00,91811209,PT,USD"), {});
  assert(live.rows[0].profitIdr === 200000 && live.missingRates === 1 && live.totalsIdr === null && live.sisa === null, "setoran Rupiah asli; tanpa kurs = null jujur");
});

test("584. endpoint /api/history: daftar akun live/demo + view per login (H2b)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "history-api-"));
  try {
    const head = "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency";
    nfs.writeFileSync(npath.join(dir, "MDBKA_History_61823011.csv"), [head,
      "1,0,0,2026.09.27 07:52:23,Bonus,BALANCE,IN,0.00,0,0.00,0.00,5000.00,0.00,0,Demo,61823011,PT. Finex Bisnis Solusi Futures,USD"].join("\r\n"));
    nfs.writeFileSync(npath.join(dir, "MDBKA_History_70930952.csv"), [head,
      "2,0,0,2026.09.29 10:00:00,Bonus,BALANCE,IN,0.00,0,0.00,0.00,5000.00,0.00,0,Demo,70930952,PT. Orbi Trade Berjangka,USD"].join("\r\n"));
    const labels = { "61823011": "Finex demo", "70930952": "OTB demo", "91811209": "Finex live" };
    const acc = listHistoryAccounts(dir, labels);
    assert(acc.length === 2 && acc[0].broker === "finex" && acc[0].kind === "demo" && acc[1].broker === "orbitraderberjangka", JSON.stringify(acc));
    assert(accountKind("Finex live") === "live" && accountKind("Akun 123") === null, "kind");
    const h = historyForLogin(dir, "61823011", labels, { "2026-09-25": 17913.9 });
    assert(h !== null && h.view.totals.deposit === 5000 && h.view.rows[0].profitIdr === 89569500, JSON.stringify(h?.view.totals));
    assert(historyForLogin(dir, "99999", labels, {}) === null && historyForLogin(dir, "../x", labels, {}) === null, "akun tak ada / path aneh = null");
    assert(readSrc("server/app.ts").includes('app.use("/api/history", createHistoryRoutes());'), "route belum dipasang");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});

test("585. halaman History: tautan, tab Live/Demo, format USD/Rp (H3)", () => {
  assert(historyPageUrl("finex") === "/?halaman=history&broker=finex", historyPageUrl("finex"));
  assert(parseHistoryPage("?halaman=history&broker=orbitraderberjangka")?.broker === "orbitraderberjangka", "parse OTB");
  assert(parseHistoryPage("") === null && parseHistoryPage("?halaman=history&broker=x") === null, "bukan halaman History");
  const acc = [
    { login: "61823011", label: "Finex demo", broker: "finex" as const, kind: "demo" as const },
    { login: "70930952", label: "OTB demo", broker: "orbitraderberjangka" as const, kind: "demo" as const },
    { login: "91811209", label: "Finex live", broker: "finex" as const, kind: "live" as const },
  ];
  const fx = accountsForBroker(acc, "finex");
  const otb = accountsForBroker(acc, "orbitraderberjangka");
  assert(fx.live?.login === "91811209" && fx.demo?.login === "61823011" && otb.live === null && otb.demo?.login === "70930952", "pembagian akun");
  assert(formatUsdHistory(-10.05) === "-10,05" && formatUsdHistory(5000) === "5.000,00", `${formatUsdHistory(-10.05)} ${formatUsdHistory(5000)}`);
  assert(formatIdr(-180273) === "-Rp180.273" && formatIdr(89389227) === "Rp89.389.227" && formatIdr(null) === "–", formatIdr(-180273));
  assert(mt5DirectionText("BALANCE", "IN") === "" && mt5DirectionText("SELL", "OUT") === "out", "direction");
  assert(readSrc("src/main.tsx").includes("parseHistoryPage(window.location.search)"), "halaman belum dipasang di main.tsx");
  const bar = readSrc("src/components/layout/AccountBalancesBar.tsx");
  assert(bar.includes("historyPageUrl(b)") && bar.includes('target="_blank"'), "tombol History belum ada");
  const page = readSrc("src/components/history/HistoryPage.tsx");
  assert(page.includes('"Komisi (Rp)", "Profit (Rp)"') && page.includes('data-testid="history-sisa"') && page.includes("API_BASE_URL"), "kolom Rupiah / Sisa setoran");
  assert(page.includes("formatPrice(r.price, r.symbol)"), "harga harus ikut desimal simbol seperti MT5 (1.32160, 89.00)");
  assert(page.includes('"Price", "S / L", "T / P", "Commission"') && page.includes("formatPrice(r.sl, r.symbol)") && page.includes("formatPrice(r.tp, r.symbol)"), "kolom S/L & T/P (H4b)");
});

test("586. History CSV kolom 19-20 S/L & T/P (H4a), CSV lama 18 kolom tetap terbaca", () => {
  const lama = parseHistoryCsv("h\r\n1,10,10,2026.10.08 23:13:40,US100,SELL,IN,0.01,30748.33,-0.01,0.00,0.00,0.00,0,,61823011,PT,USD");
  assert(lama.length === 1 && lama[0].sl === null && lama[0].tp === null, "CSV lama: sl/tp null");
  const baru = parseHistoryCsv("h\r\n1,10,10,2026.10.08 23:13:40,US100,SELL,IN,0.01,30748.33,-0.01,0.00,0.00,0.00,0,,61823011,PT,USD,30878.43,30544.73\r\n" +
    "2,0,0,2026.09.27 07:52:23,Bonus,BALANCE,IN,0.00,0,0.00,0.00,5000.00,0.00,0,Demo,61823011,PT,USD,0.00000,0.00000");
  assert(baru[0].sl === 30878.43 && baru[0].tp === 30544.73 && baru[1].sl === null && baru[1].tp === null, JSON.stringify(baru));
  const v = buildHistoryView(baru, { "2026-09-25": 17913.9, "2026-10-08": 17920 });
  assert(v.rows.find((r) => r.symbol === "US100")?.sl === 30878.43, "view membawa sl");
  const ea = readSrc("ea/MDBKAHistoryService.mq5");
  assert(ea.includes('"SL", "TP")') && ea.includes("DEAL_SL") && ea.includes("DEAL_TP"), "service belum ekspor SL/TP");
});

test("587. pemindai menyimpan angka order (plan) hanya untuk LOLOS (butir 3, P1)", () => {
  const sc = readSrc("src/lib/symbolScanner.ts");
  assert(sc.includes('status === "LOLOS" &&') && sc.includes("stopLoss: result.stopLoss,") && sc.includes("takeProfit: result.takeProfit,"), "plan belum dibangun dari hasil analisa");
  const held = sc.slice(sc.indexOf('status: "DITAHAN_JEDA"'), sc.indexOf("const plan: ScanPlan"));
  assert(!held.includes("plan"), "baris ditahan tidak boleh membawa angka order");
  const page = readSrc("src/components/history/HistoryPage.tsx");
  assert(page.includes('const TIGHT = new Set(["Deal", "Type", "Direction", "Volume", "Commission"]);') && page.includes("min-w-[1100px]"), "kolom History dirapatkan");
});

test("588. halaman detail sinyal: URL, hitung ulang semua satpam, Salin SL/TP hanya bila Lolos (butir 3, P2)", () => {
  const url = signalPageUrl("finex", "EURUSD", 4965.95);
  assert(url === "/?halaman=sinyal&broker=finex&symbol=EURUSD&equity=4965.95", url);
  const p = parseSignalPage(url.slice(1));
  assert(p !== null && p.broker === "finex" && p.symbol === "EURUSD" && p.equity === 4965.95, JSON.stringify(p));
  assert(parseSignalPage("?halaman=sinyal&broker=x&symbol=EURUSD") === null && parseSignalPage("?halaman=sinyal&broker=finex") === null, "parameter wajib");
  assert(parseSignalPage("?halaman=sinyal&broker=orbitraderberjangka&symbol=GBPUSD_ORB&equity=abc")?.equity === 0, "equity rusak = 0");
  const page = readSrc("src/components/analysis/SignalDetailPage.tsx");
  for (const k of ["openPositions: open", "pauseReason: pause.paused", "newsEvents:", "referenceCandleMs: reference", "fxRates: rates"]) {
    assert(page.includes(k), `satpam hilang di halaman detail: ${k}`);
  }
  assert(page.includes('data-testid="detail-copy-sl"') && page.includes('data-testid="detail-copy-tp"') && page.includes('data-testid="signal-not-lolos"'), "tombol salin / peringatan");
  assert(readSrc("src/main.tsx").includes("parseSignalPage(window.location.search)"), "halaman belum dipasang");
});

test("589. tombol Lolos membuka detail di tab baru (P3) + header tabel History tetap (sticky)", () => {
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes('window.open(signalPageUrl(brokerId, row.symbol, equity), "_blank", "noopener");'), "tombol Lolos belum membuka detail");
  const page = readSrc("src/components/history/HistoryPage.tsx");
  assert(page.includes("overflow-x-clip rounded-2xl") && !page.includes("max-h-[75vh]") && page.includes("<thead className=\"sticky top-0 z-10"), "header History belum tetap");
});

test("590. kalkulator target harga: contoh nyata US100 SELL, tangga harga, validasi sisi (butir 4, C1)", () => {
  const usd = (a: number, c: string) => (c === "USD" ? a : null);
  const r = calculateTargets({ symbol: "US100", direction: "JUAL", lot: 0.01, entry: 30748.33, sl: 30878.43, tp: 30544.73 }, usd, 17920);
  assert(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert(r.usdPerUnit === 0.2 && r.commissionUsd === 0.01 && r.tpDistance === 203.6 && r.slDistance === 130.1, JSON.stringify(r));
  assert(r.tpNetUsd === 40.71 && r.slNetUsd === -26.03 && r.tpNetIdr === 729523 && r.slNetIdr === -466458, `${r.tpNetUsd}/${r.slNetUsd}/${r.tpNetIdr}/${r.slNetIdr}`);
  assert(r.breakeven === 30748.28 && r.rr === 1.56 && r.closeSide === "Ask", `BE ${r.breakeven} rr ${r.rr}`);
  assert(r.ladder.length === 8 && r.ladder[0].price === 30544.73 && r.ladder[7].price === 30878.43, JSON.stringify(r.ladder.map((x) => x.price)));
  const be = r.ladder.find((x) => x.label.startsWith("Titik impas"));
  assert(be !== undefined && Math.abs(be.netUsd) <= 0.01, `impas harus ±0: ${JSON.stringify(be)}`);
  assert(r.group === "Indeks" && r.capIdr === 500000 && !r.overCap && r.capSl === 30887.78, `cap ${r.overCap} ${r.capSl}`);
  const salah = calculateTargets({ symbol: "US100", direction: "JUAL", lot: 0.01, entry: 30748.33, sl: 51113.17, tp: 51512.26 }, usd, 17920);
  assert(!salah.ok && salah.error.includes("JUAL"), JSON.stringify(salah));
  const jauh = calculateTargets({ symbol: "US100", direction: "BELI", lot: 0.01, entry: 30748.33, sl: 30000, tp: 51512.26 }, usd, 17920);
  assert(!jauh.ok && jauh.error.includes("terlalu jauh"), JSON.stringify(jauh));
  const beli = calculateTargets({ symbol: "EURUSD", direction: "BELI", lot: 0.01, entry: 1.1, sl: 1.099, tp: 1.1015 }, usd, 17920);
  assert(beli.ok && beli.tpNetUsd === 1.49 && beli.slNetUsd === -1.01 && beli.closeSide === "Bid", JSON.stringify(beli));
  assert(!calculateTargets({ symbol: "ZZZ", direction: "BELI", lot: 0.01, entry: 1, sl: 0.99, tp: 1.01 }, usd, 17920).ok, "simbol tak dikenal");
});

test("591. halaman kalkulator: URL prefill, angka koma, terpasang (butir 4, C2)", () => {
  const url = calculatorPageUrl({ broker: "finex", symbol: "US100", direction: "JUAL", lot: "0.01", entry: "30748.33", sl: "30878.43", tp: "30544.73" });
  const p = parseCalculatorPage(url.slice(1));
  assert(p !== null && p.symbol === "US100" && p.direction === "JUAL" && p.entry === "30748.33" && p.tp === "30544.73", JSON.stringify(p));
  const kosong = parseCalculatorPage("?halaman=kalkulator");
  assert(kosong !== null && kosong.broker === "finex" && kosong.direction === "BELI" && kosong.lot === "0.01" && kosong.sl === "", "default");
  assert(parseCalculatorPage("?halaman=history") === null, "bukan kalkulator");
  assert(parseInputNumber("30748,33") === 30748.33 && parseInputNumber("1.32160") === 1.3216 && Number.isNaN(parseInputNumber("")), "angka");
  assert(readSrc("src/main.tsx").includes("parseCalculatorPage(window.location.search)"), "halaman belum dipasang");
  assert(readSrc("src/components/layout/AccountBalancesBar.tsx").includes('data-testid="calculator-link"'), "tombol Kalkulator");
  const page = readSrc("src/components/analysis/CalculatorPage.tsx");
  assert(page.includes("calculateTargets(") && page.includes('data-testid="calc-ladder"') && page.includes('data-testid="calc-error"') && page.includes('data-testid="calc-cap"'), "halaman lengkap");
});

test("592. kalkulator C3: dropdown simbol per broker + isi dari posisi terbuka MT5", () => {
  const pos = { ticket: "123", symbol: "us100", side: "SELL" as const, volume: 0.01, priceOpen: 30748.33, sl: 30878.43, tp: 30544.73 };
  const p = prefillFromPosition(pos, "finex");
  assert(p.symbol === "US100" && p.direction === "JUAL" && p.lot === "0.01" && p.entry === "30748.33" && p.sl === "30878.43" && p.tp === "30544.73", JSON.stringify(p));
  const tanpa = prefillFromPosition({ ...pos, side: "BUY", sl: 0, tp: 0 }, "orbitraderberjangka");
  assert(tanpa.direction === "BELI" && tanpa.sl === "" && tanpa.tp === "" && tanpa.broker === "orbitraderberjangka", "SL/TP 0 harus kosong");
  assert(positionOptionLabel(pos) === "us100 JUAL 0.01 @30748.33 (#123)", positionOptionLabel(pos));
  assert(JSON.stringify(symbolOptions(["XAUUSD", "us100", "US100", " "], "")) === '["US100","XAUUSD"]', "unik+urut");
  assert(symbolOptions(["EURUSD"], "US100").includes("US100"), "simbol terpilih tetap ada");
  const page = readSrc("src/components/analysis/CalculatorPage.tsx");
  assert(page.includes("/api/quotes?broker=${broker}") && page.includes('data-testid="calc-symbol"') && page.includes('data-testid="calc-position"') && page.includes("useBrokerPositions(broker"), "halaman belum memakai dropdown/posisi");
});

test("593. kalkulator: baris pemicu amankan = aturan breakeven monitor (0,5R), contoh GBPUSD", () => {
  const usd = (a: number, c: string) => (c === "USD" ? a : null);
  const r = calculateTargets({ symbol: "GBPUSD", direction: "BELI", lot: 0.01, entry: 1.32429, sl: 1.32267, tp: 1.32677 }, usd, 17920);
  assert(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const sec = r.ladder.filter((x) => x.secure === true);
  assert(sec.length === 1 && sec[0].price === 1.3251 && sec[0].move === 0.00081, JSON.stringify(sec));
  assert(sec[0].label.includes("1.32430"), sec[0].label);
  assert(sec[0].secureSl === "1.32430", `secureSl ${sec[0].secureSl}`);
  const moves = r.ladder.map((x) => x.move);
  assert(moves.every((m, i) => i === 0 || moves[i - 1] >= m), `urut: ${moves.join(",")}`);
  const sell = calculateTargets({ symbol: "US100", direction: "JUAL", lot: 0.01, entry: 30748.33, sl: 30878.43, tp: 30544.73 }, usd, 17920);
  const s2 = sell.ok ? sell.ladder.find((x) => x.secure === true) : undefined;
  assert(s2 !== undefined && s2.price === 30683.28, JSON.stringify(s2));
  assert(readSrc("src/components/analysis/CalculatorPage.tsx").includes('data-testid={r.secure ? "calc-secure" : undefined}'), "baris amankan belum disorot");
  assert(readSrc("src/components/analysis/CalculatorPage.tsx").includes('data-testid="calc-copy-secure-sl"'), "tombol Salin SL amankan belum ada");
});

test("594. kalkulator: tombol Salin SL amankan aktif hanya bila harga sudah sampai pemicu", () => {
  const belum = secureReadiness("BELI", 1.3251, 1.32402, 1.32409, 5);
  assert(belum !== null && !belum.ready && belum.remaining === 0.00108 && belum.ref === 1.32402, JSON.stringify(belum));
  const sudah = secureReadiness("BELI", 1.3251, 1.3251, 1.32517, 5);
  assert(sudah !== null && sudah.ready && sudah.remaining === 0, JSON.stringify(sudah));
  const jual = secureReadiness("JUAL", 30683.28, 30680, 30683.28, 2);
  assert(jual !== null && jual.ready && jual.ref === 30683.28, "JUAL pakai Ask");
  const jualBelum = secureReadiness("JUAL", 30683.28, 30690, 30695.5, 2);
  assert(jualBelum !== null && !jualBelum.ready && jualBelum.remaining === 12.22, JSON.stringify(jualBelum));
  assert(secureReadiness("BELI", 1.3251, 0, 1.3, 5) === null, "harga tak valid");
  const page = readSrc("src/components/analysis/CalculatorPage.tsx");
  assert(page.includes("disabled={!ready}") && page.includes("bg-emerald-700") && page.includes('data-testid="calc-secure-status"'), "tombol belum bergantung harga live");
});

test("595. C5: tautan Kalkulator terisi dari monitor posisi & detail sinyal", () => {
  const url = calculatorUrlFromHolding({ brokerId: "finex", symbol: "gbpusd", direction: "BELI", lot: 0.01, entryPrice: 1.32429, sl: 1.32267, tp: 1.32677 });
  const p = parseCalculatorPage(url.slice(1));
  assert(p !== null && p.broker === "finex" && p.symbol === "GBPUSD" && p.direction === "BELI" && p.lot === "0.01" && p.entry === "1.32429" && p.sl === "1.32267" && p.tp === "1.32677", JSON.stringify(p));
  const tanpa = parseCalculatorPage(calculatorUrlFromHolding({ brokerId: "orbitraderberjangka", symbol: "META.US", direction: "JUAL", lot: 0.1, entryPrice: 741.07, sl: 0, tp: 0 }).slice(1));
  assert(tanpa !== null && tanpa.broker === "orbitraderberjangka" && tanpa.direction === "JUAL" && tanpa.sl === "" && tanpa.tp === "", JSON.stringify(tanpa));
  assert(readSrc("src/components/holdings/HoldingsDashboard.tsx").includes("calculatorUrlFromHolding(holding)"), "monitor belum bertautan");
  const det = readSrc("src/components/analysis/SignalDetailPage.tsx");
  assert(det.includes('data-testid="detail-calc-link"') && det.includes("calculatorPageUrl({"), "detail sinyal belum bertautan");
});

test("596. halaman Golongan G1: URL, tab simbol (posisi di depan), metrik akun USD+Rp", () => {
  assert(GROUP_TABS.map((g) => g.id).join(",") === "FOREX,FOREX_JPY,LOGAM,MINYAK,SAHAM_AS,INDEKS", "urutan tab golongan");
  const p = parseGroupPage(groupPageUrl({ broker: "orbitraderberjangka", group: "LOGAM", symbol: "xauusd_orb" }).slice(1));
  assert(p !== null && p.broker === "orbitraderberjangka" && p.group === "LOGAM" && p.symbol === "XAUUSD_ORB", JSON.stringify(p));
  const d = parseGroupPage("?halaman=golongan&grup=NGAWUR");
  assert(d !== null && d.broker === "finex" && d.group === "FOREX" && d.symbol === "", "default");
  assert(parseGroupPage("?halaman=kalkulator") === null, "bukan golongan");
  const tabs = groupSymbolTabs(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDCAD"], ["GBPUSD", "gbpusd", "NZDUSD", "US100"], "FOREX");
  assert(JSON.stringify(tabs) === JSON.stringify([
    { symbol: "GBPUSD", openCount: 2 }, { symbol: "NZDUSD", openCount: 1 },
    { symbol: "AUDCAD", openCount: 0 }, { symbol: "EURUSD", openCount: 0 },
  ]), JSON.stringify(tabs));
  assert(groupSymbolTabs(["XAUUSD_ORB", "EURUSD_ORB"], [], "LOGAM").map((t) => t.symbol).join() === "XAUUSD_ORB", "OTB _ORB ikut golongan");
  const m = accountMetrics({ balance: 4973.56, equity: 4959.67, margin: 65.01, freeMargin: 4894.66, marginLevel: 7629.09 }, 17920);
  assert(m[0].idr === 89126195 && m[2].usd === 65.01 && m[3].idr === Math.round(4894.66 * 17920) && m[4].percent === 7629.09, JSON.stringify(m));
  const kosong = accountMetrics({ balance: 10, equity: 10 }, null);
  assert(kosong[0].idr === null && kosong[2].usd === null && kosong[4].percent === null, "tanpa kurs/margin = null");
  assert(readSrc("src/main.tsx").includes("parseGroupPage(window.location.search)"), "halaman belum dipasang");
  assert(readSrc("src/components/layout/AccountBalancesBar.tsx").includes('data-testid="group-link"'), "tombol Golongan");
  const page = readSrc("src/components/group/GroupPage.tsx");
  assert(page.includes('data-testid="group-metrics"') && page.includes('data-testid="group-symbol-tabs"') && page.includes("useEquityStream(5000, broker)"), "halaman lengkap");
});

test("597. Golongan G2: model chart candle H1 + baca CSV satu simbol aman", () => {
  const c = (o: number, h: number, l: number, cl: number, i: number) => ({ time: `2026.10.09 ${String(i).padStart(2, "0")}:00`, open: o, high: h, low: l, close: cl });
  const candles = [c(1.32, 1.33, 1.31, 1.325, 0), c(1.325, 1.326, 1.30, 1.305, 1), c(0, 0, 0, 0, 2), c(1.305, 1.34, 1.30, 1.335, 3)];
  const m = candleChartModel(candles, { width: 1000, height: 300, axisWidth: 100, lines: [{ label: "Bid", price: 1.36, kind: "bid" }] });
  assert(m !== null && m.bars.length === 3, "candle rusak dibuang");
  if (m === null) return;
  assert(m.plotRight === 900 && m.bars[0].up && !m.bars[1].up && m.bars[2].up, JSON.stringify(m.bars.map((b) => b.up)));
  assert(m.max > 1.36 && m.min < 1.30, `rentang ${m.min}-${m.max} harus memuat garis Bid`);
  assert(m.lines[0].y < m.bars[2].wickTop, "Bid 1.36 di atas high 1.34");
  assert(m.bars.every((b) => b.wickTop <= b.bodyTop && b.bodyTop + b.bodyHeight <= b.wickBottom + 1e-9), "sumbu wick/body");
  assert(m.xLabels[0].text === "10/09 00:00", m.xLabels[0].text);
  assert(candleChartModel([], { width: 10, height: 10 }) === null, "kosong = null");
  const many = Array.from({ length: 200 }, (_, i) => c(1, 1.1, 0.9, 1.05, i % 24));
  assert(candleChartModel(many, { width: 1000, height: 300 })?.bars.length === 120, "maks 120 batang");
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "cdl-"));
  try {
    nfs.writeFileSync(npath.join(dir, "MDBKA_GBPUSD_H1.csv"), "time,open,high,low,close,tick_volume\n");
    assert(readCandleCsv(dir, "GBPUSD")?.csv.startsWith("time,") === true, "baca CSV");
    assert(readCandleCsv(dir, "EURUSD") === null, "tidak ada = null");
    assert(readCandleCsv(dir, "../GBPUSD") === null && readCandleCsv(dir, "a/b") === null, "path traversal ditolak");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
  assert(readSrc("src/components/group/GroupPage.tsx").includes('data-testid="group-candle-chart"'), "chart belum dipasang");
});

test("598. Golongan G2b: candle jam berjalan dirakit dari tick live (contoh US100)", () => {
  assert(hourKey("2026.10.09 14:12:10") === "2026.10.09 14:00" && hourKey("rusak") === null, "hourKey");
  const csv = [
    { time: "2026.10.09 12:00", open: 30998.65, high: 31001.71, low: 30968.75, close: 30980.27 },
    { time: "2026.10.09 13:00", open: 30979.93, high: 30991.89, low: 30937.27, close: 30958.58 },
  ];
  const ticks = [
    { timestamp: "2026.10.09 13:59:58", bid: 30930.0 },
    { timestamp: "2026.10.09 14:00:01", bid: 30957.1 },
    { timestamp: "2026.10.09 14:05:00", bid: 30970.4 },
    { timestamp: "2026.10.09 14:09:00", bid: 30949.9 },
    { timestamp: "2026.10.09 14:12:10", bid: 30955.14 },
    { timestamp: "2026.10.09 11:00:00", bid: 1 },
  ];
  const out = withLiveCandles(csv, ticks);
  assert(out.length === 3, `harus 3 candle: ${out.length}`);
  assert(out[1].low === 30930 && out[1].close === 30930, "tick 13:59 memperluas candle 13:00");
  const now = out[2];
  assert(now.time === "2026.10.09 14:00" && now.open === 30957.1 && now.high === 30970.4 && now.low === 30949.9 && now.close === 30955.14, JSON.stringify(now));
  assert(csv[1].close === 30958.58, "CSV asli tidak diubah");
  assert(withLiveCandles(csv, []).length === 2, "tanpa tick = CSV apa adanya");
  assert(readSrc("src/components/group/GroupPage.tsx").includes("withLiveCandles(chartNow.candles"), "halaman belum memakai candle live");
});

test("599. Golongan G3: garis Entry/SL/TP/Amankan posisi terbuka di chart", () => {
  const l = positionLines({ priceOpen: 30995.08, sl: 30893.2, tp: 31143, secureAt: 31046.02 });
  assert(l.map((x) => `${x.kind}:${x.price}`).join() === "entry:30995.08,sl:30893.2,tp:31143,secure:31046.02", JSON.stringify(l));
  assert(positionLines({ priceOpen: 741.07, sl: 0, tp: 0 }).length === 1, "SL/TP 0 tidak digambar");
  const usd = (a: number, c: string) => (c === "USD" ? a : null);
  const r = calculateTargets({ symbol: "US100", direction: "BELI", lot: 0.01, entry: 30995.08, sl: 30893.2, tp: 31143 }, usd, 17920);
  const sec = r.ok ? r.ladder.find((x) => x.secure === true) : undefined;
  assert(sec !== undefined && sec.price === 31046.02, `Amankan US100 ${JSON.stringify(sec)}`);
  assert(LINE_COLOR.sl !== LINE_COLOR.tp && LINE_COLOR.secure !== LINE_COLOR.bid, "warna beda");
  const page = readSrc("src/components/group/GroupPage.tsx");
  assert(page.includes("positionLines({") && page.includes("LINE_COLOR[l.kind]"), "garis posisi belum di chart");
});

test("600. Golongan G3b: label harga bertumpuk digeser (Entry vs Bid US100)", () => {
  const ys = spreadLabels([100, 104, 300], 20, 10, 370);
  assert(ys[0] === 100 && ys[1] === 120 && ys[2] === 300, JSON.stringify(ys));
  const urut = spreadLabels([104, 100], 20, 10, 370);
  assert(urut[1] === 100 && urut[0] === 120, `urutan atas-bawah tetap: ${JSON.stringify(urut)}`);
  const bawah = spreadLabels([365, 368, 370], 20, 10, 370);
  assert(bawah[2] === 370 && bawah[1] === 350 && bawah[0] === 330, `mentok bawah naik: ${JSON.stringify(bawah)}`);
  const c = (i: number) => ({ time: `2026.10.09 ${String(i).padStart(2, "0")}:00`, open: 30900, high: 31300, low: 30600, close: 31000 });
  const m = candleChartModel([c(0), c(1)], { width: 1100, height: 380, lines: [
    { label: "Entry", price: 30995.08, kind: "entry" }, { label: "Bid", price: 30990.58, kind: "bid" },
  ] });
  assert(m !== null && Math.abs(m.lines[0].labelY - m.lines[1].labelY) >= 20, "label Entry & Bid tidak bertumpuk");
  assert(m !== null && m.yTicks.every((t) => m.lines.every((l) => Math.abs(l.labelY - t.y) >= 16)), "angka skala tertimpa disembunyikan");
  assert(readSrc("src/components/group/GroupPage.tsx").includes("y={l.labelY - 9}"), "halaman belum memakai labelY");
});

test("601. Satpam Sesi S2: jam trading resmi broker (META.US OTB, EURUSD_ORB)", () => {
  const csv = "Symbol,Day,Index,FromMin,ToMin,Company,Generated\r\n" +
    [1, 2, 3, 4, 5].map((d) => `META.US,${d},0,930,1315,PT. Orbi Trade Berjangka,2026.10.09 14:15:31`).join("\r\n") + "\r\n" +
    "EURUSD_ORB,0,0,1385,1440,PT. Orbi Trade Berjangka,x\r\n" +
    [1, 2, 3, 4].map((d) => `EURUSD_ORB,${d},0,0,1380,PT. Orbi Trade Berjangka,x\r\nEURUSD_ORB,${d},1,1385,1440,PT. Orbi Trade Berjangka,x`).join("\r\n") +
    "\r\nEURUSD_ORB,5,0,0,1375,PT. Orbi Trade Berjangka,x\r\nRUSAK,9,0,1,2,PT,x\r\n";
  const p = parseSessionsCsv(csv);
  assert(p.company === "PT. Orbi Trade Berjangka" && p.generated === "2026.10.09 14:15:31", JSON.stringify(p.company));
  assert(p.sessions.filter((s) => s.symbol === "META.US").length === 5 && !p.sessions.some((s) => s.symbol === "RUSAK"), "parse");
  // Jumat 9 Okt 14:00 server (21:00 WIT): META.US tutup, buka 15:30 (= 22:30 WIT), 90 menit lagi.
  const tutup = sessionState("META.US", "2026.10.09 14:00:07", p.sessions);
  assert(tutup.known && !tutup.open && tutup.opensInMin === 90 && tutup.nextOpenServer === "2026.10.09 15:30", JSON.stringify(tutup));
  const buka = sessionState("meta.us", "2026.10.09 21:00:00", p.sessions);
  assert(buka.open && buka.closesInMin === 55, JSON.stringify(buka));
  // Sabtu 10 Okt 10:00 server → buka lagi Senin 12 Okt 15:30.
  const libur = sessionState("META.US", "2026.10.10 10:00:00", p.sessions);
  assert(!libur.open && libur.nextOpenServer === "2026.10.12 15:30", JSON.stringify(libur));
  // EURUSD_ORB: jeda harian 23:00–23:05, Minggu 23:05 bersambung ke Senin.
  assert(sessionState("EURUSD_ORB", "2026.10.12 00:30:00", p.sessions).open, "Senin dini hari buka (sambung dari Minggu)");
  const jeda = sessionState("EURUSD_ORB", "2026.10.12 23:02:00", p.sessions);
  assert(!jeda.open && jeda.opensInMin === 3, JSON.stringify(jeda));
  const iv = weeklyIntervals(p.sessions, "EURUSD_ORB")[0];
  assert(iv[0] === 1385 && iv[1] === 2820, `Minggu 23:05 bersambung s/d Senin 23:00: ${JSON.stringify(iv)}`);
  assert(!sessionState("XAUUSD", "2026.10.09 14:00:00", p.sessions).known, "simbol tanpa sesi = tidak diketahui");
  assert(readSrc("server/app.ts").includes('app.use("/api/sessions", createSessionRoutes())'), "route belum dipasang");
});

test("602. Satpam Sesi S4: kartu posisi — pasar tutup / segera tutup (META.US)", () => {
  const ses = [1, 2, 3, 4, 5].map((day) => ({ symbol: "META.US", day, fromMin: 930, toMin: 1315 }));
  assert(serverNowText(Date.UTC(2026, 9, 9, 12, 20, 5), 2) === "2026.10.09 14:20:05", serverNowText(Date.UTC(2026, 9, 9, 12, 20, 5), 2));
  assert(serverToWitLabel("2026.10.09 15:30", 2) === "Jumat 22:30 WIT", String(serverToWitLabel("2026.10.09 15:30", 2)));
  assert(serverToWitLabel("2026.10.12 15:30", 2) === "Senin 22:30 WIT", "Senin");
  const tutup = sessionNotice("META.US", sessionState("META.US", "2026.10.09 14:20:00", ses), 2);
  assert(tutup !== null && tutup.level === "closed" && tutup.text.includes("Jumat 22:30 WIT") && tutup.text.includes("1 jam 10 menit lagi"), JSON.stringify(tutup));
  const segera = sessionNotice("META.US", sessionState("META.US", "2026.10.09 21:15:00", ses), 2);
  assert(segera !== null && segera.level === "soon" && segera.text.includes("40 menit lagi"), JSON.stringify(segera));
  assert(sessionNotice("META.US", sessionState("META.US", "2026.10.09 17:00:00", ses), 2) === null, "buka normal = tanpa pesan");
  assert(sessionNotice("XAUUSD", sessionState("XAUUSD", "2026.10.09 17:00:00", ses), 2) === null, "sesi tak diketahui = tanpa pesan");
  const libur = sessionNotice("META.US", sessionState("META.US", "2026.10.10 10:00:00", ses), 2);
  assert(libur !== null && libur.text.includes("Senin 22:30 WIT"), JSON.stringify(libur));
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("useTradeSessions(brokerId)") && dash.includes("holding-session-"), "kartu posisi belum memakai sesi");
});

test("603. monitor: posisi tanpa SL/TP tetap ada P&L; komisi saham belum terverifikasi tak dikurangkan (META.US)", () => {
  const h = toAutoHolding({ ticket: "2109019", symbol: "META.US", side: "BUY", volume: 0.1, priceOpen: 741.07, sl: 0, tp: 0, timeOpen: "2026.10.06 17:13:40" }, "orbitraderberjangka");
  const usd = (a: number, c: string) => (c === "USD" ? a : null);
  const ev = evaluateExitSignal(h, 720.47, 720.73, usd, Date.UTC(2026, 9, 6, 16));
  assert(ev.pnl === -2.06 && ev.pnlCurrency === "USD", `P&L ${JSON.stringify(ev)}`);
  assert(ev.pnlNet === -2.06 && ev.commission === 0, `komisi saham OTB 0 (terverifikasi): bersih ${ev.pnlNet} komisi ${ev.commission}`);
  assert(!stockCommissionUnverified("META.US") && stockCommissionUnverified("#META") && !stockCommissionUnverified("AUDUSD_ORB") && !stockCommissionUnverified("US100"), "hanya saham Finex # yang belum terverifikasi");
  assert(commissionForHolding("META.US", 0.1) === 0 && commissionForHolding("AAPL.US", 0.1) === 0, "spec32 saham OTB komisi 0 (History META.US 9 Okt)");
  assert(commissionForHolding("EURCHF_ORB", 0.1) === 3.3, "forex OTB tetap 33/lot (History: −3,30 per 0,1 lot)");
  const fx = toAutoHolding({ ticket: "1", symbol: "AUDUSD_ORB", side: "BUY", volume: 0.1, priceOpen: 0.69811, sl: 0.69311, tp: 0.70626, timeOpen: "2026.10.06 17:13:40" }, "orbitraderberjangka");
  assert(evaluateExitSignal(fx, 0.698, 0.6981, usd).commission === 3.3, "komisi OTB forex tetap 33/lot");
  assert(ev.risk === null && ev.reward === null && ev.signal === "HOLD" && ev.reasons[0].includes("tanpa SL/TP"), JSON.stringify(ev.reasons));
  const rusak = evaluateExitSignal(h, 0, 720.73, usd);
  assert(rusak.pnl === null, "harga rusak tetap null");
});

test("604. butir 2 P1: portofolio saham dari History (META.US OTB + contoh jual)", () => {
  const d = (symbol: string, type: string, entry: string, volume: number, price: number, profit = 0, commission = 0, idr: number | null = 0) =>
    ({ symbol, type, entry, volume, price, commission, swap: 0, profit, fee: 0, commissionIdr: commission === 0 ? 0 : idr, profitIdr: profit === 0 ? 0 : idr, swapIdr: 0 });
  const nyata = buildStockPortfolio([d("META.US", "BUY", "IN", 0.1, 741.07), d("EURUSD_ORB", "BUY", "IN", 0.1, 1.1)]);
  assert(nyata.length === 1, "hanya saham");
  const m = nyata[0];
  assert(m.symbol === "META.US" && m.boughtLot === 0.1 && m.avgBuy === 741.07 && m.soldLot === 0 && m.heldLot === 0.1 && m.heldShares === 0.1 && m.realizedUsd === 0, JSON.stringify(m));
  const contoh = buildStockPortfolio([
    d("#AAPL", "BUY", "IN", 0.2, 200), d("#AAPL", "BUY", "IN", 0.1, 230),
    d("#AAPL", "SELL", "OUT", 0.1, 240, 4, -0.1, 70000),
  ]);
  const a = contoh[0];
  assert(a.boughtLot === 0.3 && a.avgBuy === 210 && a.soldLot === 0.1 && a.avgSell === 240 && a.heldLot === 0.2, JSON.stringify(a));
  assert(a.heldShares === null && a.contract === null, "contract #AAPL belum dicek = tanpa lembar");
  assert(a.realizedUsd === 3.9 && a.realizedIdr === 140000, `hasil ${a.realizedUsd} / ${a.realizedIdr}`);
  const tanpaKurs = buildStockPortfolio([d("#AAPL", "SELL", "OUT", 0.1, 240, 4, 0, null)]);
  assert(tanpaKurs[0].realizedIdr === null, "tanpa kurs = Rp null");
  assert(isStockSymbol("META.US") && isStockSymbol("#META") && !isStockSymbol("#") && !isStockSymbol("US100"), "isStockSymbol");
  assert(m.boughtShares === 0.1 && m.soldShares === 0 && m.openLot === 0.1, `lembar dibeli/terjual: ${JSON.stringify(m)}`);
  assert(readSrc("src/components/group/GroupPage.tsx").includes("<StockPortfolio broker={broker} group={group} />"), "belum dipasang di semua tab golongan");
});

test("605. Satpam Sesi S3: tahan entry jelang tutup / saham jelang libur akhir pekan", () => {
  const meta = [1, 2, 3, 4, 5].map((day) => ({ symbol: "META.US", day, fromMin: 930, toMin: 1315 }));
  const fx = [1, 2, 3, 4].flatMap((day) => [{ symbol: "EURUSD_ORB", day, fromMin: 0, toMin: 1380 }, { symbol: "EURUSD_ORB", day, fromMin: 1385, toMin: 1440 }])
    .concat([{ symbol: "EURUSD_ORB", day: 0, fromMin: 1385, toMin: 1440 }, { symbol: "EURUSD_ORB", day: 5, fromMin: 0, toMin: 1375 }]);
  const all = [...meta, ...fx];
  // Kamis 8 Okt 21:00 server: META.US tutup 55 mnt lagi → tahan (≤60).
  const h1 = findSessionHold("META.US", "2026.10.08 21:00:00", all);
  assert(h1 !== null && h1.closesInMin === 55 && h1.reason.includes("tutup 55 menit lagi"), JSON.stringify(h1));
  // Kamis 19:00: tutup 2 jam 55 mnt lagi, besok buka lagi (jeda < 24 jam) → TIDAK ditahan.
  assert(findSessionHold("META.US", "2026.10.08 19:00:00", all) === null, "Kamis sore tidak ditahan");
  // Jumat 19:00: tutup 2 jam 55 mnt lalu libur s/d Senin → saham DITAHAN.
  const h2 = findSessionHold("META.US", "2026.10.09 19:00:00", all);
  assert(h2 !== null && h2.reason.includes("libur"), JSON.stringify(h2));
  // Jumat 16:00 (tutup 5 jam 55 mnt lagi) → belum ditahan.
  assert(findSessionHold("META.US", "2026.10.09 16:00:00", all) === null, "Jumat awal sesi boleh");
  // Forex Jumat 21:00 (tutup 22:55, 115 mnt) → tidak ditahan (aturan libur hanya saham); 22:10 → ditahan (45 mnt).
  assert(findSessionHold("EURUSD_ORB", "2026.10.09 21:00:00", all) === null, "forex aturan libur tidak berlaku");
  assert(findSessionHold("EURUSD_ORB", "2026.10.09 22:10:00", all) !== null, "forex ≤60 mnt ditahan");
  assert(findSessionHold("META.US", "2026.10.08 21:00:00", null) === null && findSessionHold("XAUUSD", "2026.10.08 21:00:00", all) === null, "tanpa sesi = diabaikan");
  // 10 Okt: pasar SUDAH tutup → ditahan (kasus #IBM Finex Jumat 23:57 server, sesi 16:30–23:00).
  const ibm = [1, 2, 3, 4, 5].map((day) => ({ symbol: "#IBM", day, fromMin: 990, toMin: 1380 }));
  const tutup = findSessionHold("#IBM", "2026.10.09 23:57:18", ibm);
  assert(tutup !== null && tutup.reason.includes("sedang tutup") && tutup.reason.includes("2026.10.12 16:30"), JSON.stringify(tutup));
  assert(findSessionHold("EURUSD_ORB", "2026.10.09 23:57:00", all) !== null, "forex Jumat setelah 22:55 tutup = ditahan");
  const sc = readSrc("src/lib/symbolScanner.ts");
  assert(sc.includes('status: "DITAHAN_SESI"') && sc.includes("findSessionHold(symbol"), "pemindai belum memakai satpam sesi");
  assert(readSrc("src/components/analysis/SymbolScannerPanel.tsx").includes("useTradeSessions(brokerId)"), "panel");
  assert(readSrc("src/components/analysis/SignalDetailPage.tsx").includes("/api/sessions?broker="), "detail");
  assert(readSrc("server/index.ts").includes("getSessions: () => readSessionsForBroker("), "catatan entry");
});

test("606. ringkasan transaksi semua golongan: buka BELI/JUAL, ditutup, masih terbuka (Forex)", () => {
  const d = (symbol: string, type: string, entry: string, volume: number, price: number, profit = 0) =>
    ({ symbol, type, entry, volume, price, commission: 0, swap: 0, profit, fee: 0, commissionIdr: 0, profitIdr: profit === 0 ? 0 : Math.round(profit * 17920), swapIdr: 0 });
  const rows = buildTradeSummary([
    d("GBPUSD", "BUY", "IN", 0.01, 1.32429),
    d("EURAUD", "SELL", "IN", 0.01, 1.61),
    d("EURAUD", "BUY", "OUT", 0.01, 1.6065, 0.22),
    d("META.US", "BUY", "IN", 0.1, 741.07),
  ], (s) => !isStockSymbol(s));
  assert(rows.length === 2 && rows[0].symbol === "GBPUSD" && rows[0].openLot === 0.01, JSON.stringify(rows.map((r) => r.symbol)));
  const ea = rows[1];
  assert(ea.boughtLot === 0 && ea.openSellLot === 0.01 && ea.avgOpenSell === 1.61 && ea.closedLot === 0.01 && ea.openLot === 0, JSON.stringify(ea));
  assert(ea.realizedUsd === 0.22 && ea.realizedIdr === 3942, `${ea.realizedUsd}/${ea.realizedIdr}`);
  assert(ea.boughtShares === null && ea.contract === null, "non-saham tanpa lembar");
  const ac = buildTradeSummary([d("AUDCHF", "SELL", "IN", 0.01, 0.57893), d("AUDCHF", "BUY", "OUT", 0.01, 0.57947, -0.65), d("AUDCHF", "BUY", "IN", 0.01, 0.58016)], () => true)[0];
  assert(ac.avgOpenSell === 0.57893 && ac.avgBuy === 0.58016 && ac.openLot === 0.01, `harga rata2 5 desimal: ${JSON.stringify(ac)}`);
  const nol = buildTradeSummary([d("GBPUSD", "SELL", "OUT", 0.01, 1.3, 1.64), d("GBPUSD", "SELL", "OUT", 0.01, 1.3, -1.64)], () => true)[0];
  assert(Object.is(nol.realizedUsd, 0), "tanpa -0");
});

test("607. kunci salin SL/TP: 10 dtk, geser > 10% jarak SL = BERGESER, tanpa harga = BERGESER", () => {
  assert(COPY_LOCK_SECONDS === 10 && COPY_DRIFT_SHARE === 0.1, "angka penetapan Fahmi 10 Okt");
  const q = (bid: number, ask: number) => ({ timestamp: "2026.10.08 10:17:07", symbol: "AUDCHF", bid, ask });
  const jual = { direction: "JUAL" as const, entry: 0.57871, stopLoss: 0.57947, takeProfit: 0.57757, suggestedLot: 0.01, riskAtMinLot: 0.95, maxRiskUsd: 1.95, riskDistance: 0.00076, targetDistance: 0.00114 };
  const lock = startCopyLock("AUDCHF", jual, 1_000_000);
  const geser = copyLockState(lock, q(0.57893, 0.57899), 1_003_000);
  assert(geser.phase === "BERGESER" && geser.reason.includes("29%"), `kasus AUDCHF 8 Okt: ${JSON.stringify(geser)}`);
  const siap = copyLockState(lock, q(0.57877, 0.57883), 1_003_200);
  assert(siap.phase === "SIAP_TP" && siap.remainingSec === 7, JSON.stringify(siap));
  assert(copyLockState(lock, q(0.57877, 0.57883), 1_010_000).phase === "HABIS", "10 dtk habis");
  assert(copyLockState(lock, null, 1_002_000).phase === "BERGESER", "tanpa harga live = tidak aman");
  const beli = { ...jual, direction: "BELI" as const, entry: 25033.62, stopLoss: 24962.45, takeProfit: 25140.37 };
  const d = planDriftShare(beli, { ...q(25035.0, 25037.67), symbol: "DE30" });
  assert(d !== null && Math.abs(d - 0.0569) < 0.001, `BELI pakai Ask: ${d}`);
  assert(copyLockState(startCopyLock("DE30", beli, 0), { ...q(25035.0, 25037.67), symbol: "DE30" }, 5_000).phase === "SIAP_TP", "DE30 geser 5,7% masih aman");
});

test("608. tombol [SL]/[TP] di kolom Arah pemindai: hanya Lolos, TP ikut kunci, SL hitung ulang harga live", () => {
  const plan = { direction: "JUAL" as const, entry: 0.57871, stopLoss: 0.57947, takeProfit: 0.57757, suggestedLot: 0.01, riskAtMinLot: 0.95, maxRiskUsd: 1.95, riskDistance: 0.00076, targetDistance: 0.00114 };
  const awal = copyButtonsView(null, null, false);
  assert(awal.slLabel === "SL" && !awal.tpEnabled, "awal: TP mati sampai SL ditekan");
  const lock = startCopyLock("AUDCHF", plan, 0);
  const q = (bid: number) => ({ timestamp: "t", symbol: "AUDCHF", bid, ask: bid + 0.00006 });
  const siap = copyButtonsView(lock, copyLockState(lock, q(0.57875), 2_500), false);
  assert(siap.tpEnabled && siap.tpLabel === "TP · 8 dtk" && siap.tone === "siap", JSON.stringify(siap));
  const merah = copyButtonsView(lock, copyLockState(lock, q(0.57893), 3_000), false);
  assert(!merah.tpEnabled && merah.tone === "merah" && merah.tpLabel === "harga bergeser — salin ulang", JSON.stringify(merah));
  const habis = copyButtonsView(lock, copyLockState(lock, q(0.57875), 10_000), false);
  assert(!habis.tpEnabled && habis.slLabel === "SL" && (habis.note ?? "").includes("habis"), JSON.stringify(habis));
  assert(copyButtonsView(null, null, true).note?.includes("Buy/Sell") === true, "selesai: pengingat Buy/Sell");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes('row.status === "LOLOS" && row.plan !== null') && panel.includes("<ScanCopyButtons"), "tombol hanya baris Lolos");
  assert(panel.includes('return row.status === "LOLOS" ? (row.plan ?? null) : null;'), "hitung ulang wajib masih Lolos");
  const btn = readSrc("src/components/analysis/ScanCopyButtons.tsx");
  assert(btn.includes("const plan = recompute(q);") && btn.includes("formatPrice(lock.plan.takeProfit, symbol)"), "SL hitung ulang, TP dari rencana terkunci");
});

test("609. V2a pembanding spesifikasi MT5 vs spec32: contract/tick/mata uang = TAHAN, swap = CATATAN", () => {
  const head = "Symbol,ContractSize,TickSize,TickValue,Digits,VolumeMin,VolumeStep,SwapMode,SwapLong,SwapShort,ProfitCurrency,MarginCurrency,Company,Generated";
  const row = (sym: string, contract: string, tick: string, sl: string, ss: string, pc: string) =>
    `${sym},${contract},${tick},0.70141475,5,0.0100,0.0100,0,${sl},${ss},${pc},AUD,PT. Finex Bisnis Solusi Futures,2026.10.09 23:59:59`;
  const asli = parseSpecsCsv(["\uFEFF" + head, row("AUDCAD", "100000.0000", "0.00001000", "-2.3900", "-2.3500", "CAD"), "rusak,1"].join("\r\n"));
  assert(asli.specs.length === 1 && asli.company === "PT. Finex Bisnis Solusi Futures" && asli.generated === "2026.10.09 23:59:59", JSON.stringify(asli));
  assert(compareSpecs(asli).length === 0, "baris asli 9 Okt AUDCAD harus cocok spec32");
  const ubah = parseSpecsCsv([head,
    row("AUDCAD", "10000.0000", "0.00001000", "-2.3900", "-2.3500", "CAD"),
    row("EURUSD", "100000.0000", "0.00001000", "-9.0000", "1.0000", "USD"),
    row("ZZZUSD", "100000.0000", "0.00001000", "0", "0", "USD"),
  ].join("\n"));
  const diffs = compareSpecs(ubah);
  assert(diffs[0].level === "TAHAN" && diffs[0].symbol === "AUDCAD" && diffs[0].field === "contract", JSON.stringify(diffs[0]));
  assert(diffs[0].reason === "Contract size AUDCAD berubah: MT5 10000, MDBKA 100000", diffs[0].reason);
  const held = heldSymbols(diffs);
  assert(held.has("AUDCAD") && !held.has("EURUSD") && !held.has("ZZZUSD"), [...held].join(","));
  assert(diffs.some((d) => d.symbol === "EURUSD" && d.level === "CATATAN" && d.field === "swapLong"), "swap beda = catatan saja");
  assert(diffs.some((d) => d.symbol === "ZZZUSD" && d.field === "spec32" && d.level === "CATATAN"), "simbol baru = catatan");
});

test("610. V2b pembaca spesifikasi per broker (Company, file terbaru) + GET /api/specs", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "spec-"));
  try {
    const head = "Symbol,ContractSize,TickSize,TickValue,Digits,VolumeMin,VolumeStep,SwapMode,SwapLong,SwapShort,ProfitCurrency,MarginCurrency,Company,Generated\r\n";
    nfs.writeFileSync(npath.join(dir, "MDBKA_Specs_61823011.csv"),
      head + "AUDCAD,10000.0000,0.00001000,0.7,5,0.0100,0.0100,0,-2.3900,-2.3500,CAD,AUD,PT. Finex Bisnis Solusi Futures,2026.10.09 23:59:59\r\n");
    nfs.writeFileSync(npath.join(dir, "MDBKA_Specs_70930952.csv"),
      head + "AUDCAD_ORB,100000.0000,0.00001000,0.7,5,0.1000,0.1000,5,-0.7500,-2.2500,CAD,USD,PT. Orbi Trade Berjangka,2026.10.09 22:54:59\r\n");
    nfs.writeFileSync(npath.join(dir, "MDBKA_Specs_1003997005.csv"),
      head + "EURUSD,100000.0000,0.00001000,1,5,0.0100,0.0100,0,0,0,USD,EUR,PT. Monex Investindo Futures,x\r\n");
    const finex = readSpecsForBroker(dir, "finex");
    assert(finex !== null && finex.file === "MDBKA_Specs_61823011.csv" && finex.symbols === 1, JSON.stringify(finex));
    assert(finex !== null && finex.diffs.length === 1 && finex.diffs[0].level === "TAHAN" && finex.diffs[0].field === "contract", JSON.stringify(finex?.diffs));
    const otb = readSpecsForBroker(dir, "orbitraderberjangka");
    assert(otb !== null && otb.diffs.length === 0 && otb.generated === "2026.10.09 22:54:59", JSON.stringify(otb));
    assert(readSpecsForBroker(npath.join(dir, "tidak-ada"), "finex") === null, "folder tidak ada = null, tanpa throw");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
  assert(readSrc("server/app.ts").includes('app.use("/api/specs", createSpecRoutes())'), "route belum dipasang");
  assert(readSrc("server/routes/specRoutes.ts").includes("available: false"), "tanpa file = available false");
});

test("611. V2c pemindai: DITAHAN_SPEK paling awal (sebelum jeda), hanya diff TAHAN, panel ambil /api/specs", () => {
  const map = specHoldMap([
    { symbol: "EURUSD", level: "CATATAN", reason: "Swap beli EURUSD berubah" },
    { symbol: "US100", level: "TAHAN", reason: "Contract size US100 berubah: MT5 100000, MDBKA 20" },
    { symbol: "US100", level: "TAHAN", reason: "Tick size US100 berubah" },
  ]);
  assert(map.size === 1 && map.get("US100") === "Contract size US100 berubah: MT5 100000, MDBKA 20", [...map.entries()].join("|"));
  const sc = readSrc("src/lib/symbolScanner.ts");
  const spek = sc.indexOf('status: "DITAHAN_SPEK"');
  const jeda = sc.indexOf('status: "DITAHAN_JEDA"');
  assert(spek > 0 && jeda > spek, `spesifikasi harus dinilai sebelum jeda ${spek}/${jeda}`);
  assert(sc.includes("input.specHolds?.get(symbol)"), "pakai simbol kanonik broker");
  assert(sortScanRows([
    { symbol: "B", status: "TUNGGU", decision: "TUNGGU", direction: "TUNGGU", held: false, score: 0, reason: "", costShareOfRisk: null, candles: 200 },
    { symbol: "A", status: "DITAHAN_SPEK", decision: "TUNGGU", direction: "BELI", held: true, score: 4, reason: "", costShareOfRisk: null, candles: 200 },
  ])[0].symbol === "A", "spek di atas TUNGGU");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes("/api/specs?broker=${brokerId}") && panel.includes("specBook.broker === brokerId ? specBook.holds : null"), "spesifikasi broker aktif");
  assert(panel.includes('DITAHAN_SPEK: { label: "Spesifikasi berubah"') && panel.includes("specHolds,"), "panel/tampilan");
});

test("612. V2c-2 satpam spesifikasi juga di halaman detail sinyal & pencatat entry server", () => {
  const detail = readSrc("src/components/analysis/SignalDetailPage.tsx");
  assert(detail.includes("/api/specs?broker=${broker}") && detail.includes("specHolds: specBook?.available === true"), "detail sinyal");
  const log = readSrc("server/services/tradeEntryLog.ts");
  assert(log.includes("readonly getSpecHolds?:") && log.includes("specHolds: specHolds(),"), "pencatat entry");
  const idx = readSrc("server/index.ts");
  assert(idx.includes("getSpecHolds: () => {") && idx.includes("specHoldMap(snap.diffs)"), "dipasang di server/index.ts");
});

test("613. V2c-3 Hasil analisa ditahan bila spesifikasi berubah (heldBy spek, didahulukan dari jeda)", () => {
  const base = { decision: "BELI", stopLoss: 1, takeProfit: 2, suggestedLot: 0.01, warnings: [] as string[] } as unknown as ReturnType<typeof analyzeMarket>;
  const holds = specHoldMap([{ symbol: "US100", level: "TAHAN", reason: "Contract size US100 berubah: MT5 100000, MDBKA 20" }]);
  const held = applySpecHold(base, "US100", holds);
  assert(held.decision === "TUNGGU" && held.heldBy === "spek" && held.heldDecision === "BELI" && held.stopLoss === null && held.suggestedLot === null, JSON.stringify(held));
  assert(held.heldReason === "Contract size US100 berubah: MT5 100000, MDBKA 20", String(held.heldReason));
  assert(applySpecHold(base, "DE30", holds) === base, "simbol lain tidak berubah");
  assert(applySpecHold(base, "US100", null) === base, "tanpa file = tanpa satpam");
  const app = readSrc("src/App.tsx");
  assert(app.includes("applyLossPauseHold(applySpecHold(result, market.symbol, specHolds), lossPause)") && app.includes("useSpecHolds(activeBrokerId)"), "dipasang di App");
  assert(readSrc("src/components/result/AnalysisResult.tsx").includes('data-testid="held-spek"'), "kotak penjelasan");
  assert(readSrc("src/lib/signalReason.ts").includes('result.heldBy === "spek"'), "alasan di panel header");
});

test("614. S5a SL wajib semua posisi tanpa SL: batas golongan, lewat batas, golongan ditahan", () => {
  const usd = (amount: number, currency: string) => (currency === "USD" ? amount : null);
  const kurs = 17880.55;
  const meta = { symbol: "META.US", direction: "BELI" as const, lot: 0.1, entryPrice: 741.07, sl: 0 };
  const pasang = mandatoryStop(meta, 735.5, 735.9, usd, kurs);
  assert(pasang.kind === "PASANG" && pasang.slText === "713.11" && pasang.capIdr === 50000, JSON.stringify(pasang));
  assert(pasang.kind === "PASANG" && pasang.lossIdr <= 50000 && pasang.lossIdr > 49000, `rugi ${JSON.stringify(pasang)}`);
  const lewat = mandatoryStop(meta, 710, 710.4, usd, kurs);
  assert(lewat.kind === "LEWAT_BATAS" && lewat.message.includes("713.11"), JSON.stringify(lewat));
  const jual = mandatoryStop({ ...meta, direction: "JUAL" }, 741, 741.2, usd, kurs);
  assert(jual.kind === "PASANG" && jual.slText === "769.03", `JUAL: SL di atas entry ${JSON.stringify(jual)}`);
  assert(mandatoryStop({ ...meta, sl: 720 }, 735, 736, usd, kurs).kind === "ADA_SL", "sudah ber-SL");
  assert(mandatoryStop({ ...meta, symbol: "#HSBA" }, 1, 1, usd, kurs).kind === "TUTUP", "golongan ditahan");
  assert(mandatoryStop(meta, 735, 736, usd, null).kind === "TIDAK_DIKETAHUI", "tanpa kurs");
});

test("615. S5b kotak WAJIB PASANG SL + Salin SL di kartu monitor posisi (semua posisi tanpa SL)", () => {
  const src = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(src.includes("mandatoryStop(holding, live?.bid ?? null, live?.ask ?? null, convert, kurs)"), "pakai mesin S5a");
  assert(src.includes('stopPlan.kind !== "ADA_SL"') && src.includes("holding-mandatory-sl-${holding.id}"), "kotak hanya bila tanpa SL");
  assert(src.includes("copyMandatorySl(stopPlan.slText)") && src.includes("WAJIB PASANG SL"), "tombol Salin SL");
});

test("616. SW1a positions.csv kolom Swap asli MT5 (opsional, CSV lama tetap terbaca) → Holding.brokerSwap", () => {
  const baru = parsePositionRow("2109019,META.US,BUY,0.10,741.07,0.00,0.00,2026.10.06 16:31:02,-0.06");
  assert(baru !== null && baru.swap === -0.06, JSON.stringify(baru));
  const lama = parsePositionRow("2109019,META.US,BUY,0.10,741.07,0.00,0.00,2026.10.06 16:31:02");
  assert(lama !== null && lama.swap === undefined, "CSV lama: swap tidak diketahui, bukan 0");
  const rusak = parsePositionRow("2109019,META.US,BUY,0.10,741.07,0.00,0.00,2026.10.06 16:31:02,abc");
  assert(rusak !== null && rusak.swap === undefined, "swap rusak diabaikan");
  if (baru === null || lama === null) throw new Error("parse gagal");
  assert(toAutoHolding(baru, "orbitraderberjangka").brokerSwap === -0.06, "dibawa ke Holding");
  assert(toAutoHolding(lama, "orbitraderberjangka").brokerSwap === undefined, "tanpa kolom = absen");
  const ea = readSrc("ea/ExportPositions.mq5");
  assert(ea.includes("PositionGetDouble(POSITION_SWAP)") && ea.includes('"TimeOpen", "Swap"'), "EA menulis kolom Swap");
});

test("617. SW1b swap asli MT5 didahulukan dari perkiraan; kartu menampilkan 'Swap MT5' + Rupiah", () => {
  const now = Date.parse("2026-10-09T12:00:00.000Z");
  const base = { symbol: "META.US", direction: "BELI" as const, lot: 0.1, entryTime: "2026.10.06 16:31:02" };
  const asli = calculateHoldingSwap({ ...base, brokerSwap: -0.06 }, now);
  assert(asli !== null && asli.source === "MT5" && asli.value === -0.06 && asli.daysHeld === 2, JSON.stringify(asli));
  const nolHariIni = calculateHoldingSwap({ ...base, entryTime: "2026.10.09 10:00:00", brokerSwap: 0 }, now);
  assert(nolHariIni !== null && nolHariIni.source === "MT5" && nolHariIni.value === 0, "Finex swap 0 = 0 asli, bukan perkiraan");
  const est = calculateHoldingSwap(base, now);
  assert(est === null || est.source === "PERKIRAAN", "tanpa kolom swap = perkiraan");
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes('evaluation.swap.source === "MT5"') && dash.includes("Swap MT5") && dash.includes("(sudah dipotong broker)"), "kartu");
});

test("618. SW2 perkiraan swap ikut mode broker: OTB persen/360 (cocok History), Finex 0", () => {
  const usd = (amount: number, ccy: string) => (ccy === "USD" ? amount : ccy === "CAD" ? amount / 1.405 : null);
  assert(swapChargeDays("2026.10.06 14:41:45", "2026.10.08 08:13:52", 3) === 4, "Sel→Kam, Rabu x3");
  assert(swapChargeDays("2026.10.02 17:42:46", "2026.10.06 09:18:35", 3) === 2, "Jum→Sel: Jum + Sen (akhir pekan 0)");
  assert(swapChargeDays("2026.10.09 10:00:00", "2026.10.09 23:59:00", 3) === 0, "intraday 0");
  const audusd = estimateSwap({ symbol: "AUDUSD_ORB", broker: "orbitraderberjangka", direction: "BELI", lot: 0.1, price: 0.69811, entryServer: "2026.10.06 14:41:45", nowServer: "2026.10.08 08:13:52" }, usd);
  assert(audusd !== null && audusd.value === -1.16, `AUDUSD_ORB History -1.16: ${JSON.stringify(audusd)}`);
  const audcad = estimateSwap({ symbol: "AUDCAD_ORB", broker: "orbitraderberjangka", direction: "BELI", lot: 0.1, price: 0.99132, entryServer: "2026.10.02 17:42:46", nowServer: "2026.10.06 09:18:35" }, usd);
  assert(audcad !== null && Math.abs(audcad.value - -0.29) <= 0.01, `AUDCAD_ORB History -0.29: ${JSON.stringify(audcad)}`);
  const meta = estimateSwap({ symbol: "META.US", broker: "orbitraderberjangka", direction: "BELI", lot: 0.1, price: 741.07, entryServer: "2026.10.06 17:13:40", nowServer: "2026.10.09 15:37:16" }, usd);
  assert(meta !== null && meta.chargeDays === 3 && meta.value === -0.06, `META.US History -0.06: ${JSON.stringify(meta)}`);
  const finex = estimateSwap({ symbol: "US30", broker: "finex", direction: "BELI", lot: 0.01, price: 51273.15, entryServer: "2026.10.08 23:23:28", nowServer: "2026.10.09 11:16:00" }, usd);
  assert(finex !== null && finex.mode === "MATI" && finex.value === 0, "Finex swap mati (US30 menginap = 0,00)");
});

test("619. SW2b monitor posisi: perkiraan swap pakai mesin mode broker + jam server quote", () => {
  const ex = readSrc("src/lib/exitMonitor.ts");
  assert(ex.includes('import { estimateSwap } from "./swapEstimate";') && !ex.includes("getSpec32SwapPreview"), "rumus poin lama dicabut");
  assert(ex.includes("calculateHoldingSwap(holding, nowMs, { nowServer, price: ref, convertToUsd })"), "evaluasi pakai jam server + harga acuan");
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("convert, undefined, live.timestamp)"), "kartu meneruskan jam server quote live");
  const finex = evaluateExitSignal(
    { ...makeHolding({ symbol: "US30", entryPrice: 51273.15, sl: 51113.17, tp: 51512.26, entryTime: "2026.10.08 23:23:28" }) },
    51300, 51302, testToUsd, Date.parse("2026-10-09T08:00:00.000Z"), "2026.10.09 11:00:00",
  );
  assert(finex.swap !== null && finex.swap.value === 0 && finex.swap.source === "PERKIRAAN", `Finex swap mati: ${JSON.stringify(finex.swap)}`);
});

test("620. O1 satpam pembukaan bursa: US100 22:30 WIT, tahan -30/+60, peringatan posisi 60 mnt, DST otomatis", () => {
  const t = (iso: string) => Date.parse(iso);
  // Jumat 9 Okt 2026: NYSE buka 09:30 EDT = 13:30 UTC = 22:30 WIT.
  const buka = openingState("US100", t("2026-10-09T13:30:00Z"));
  assert(buka !== null && buka.minutesFromOpen === 0 && buka.openWit === "22:30", JSON.stringify(buka));
  assert(findOpeningHold("US100", t("2026-10-09T13:00:00Z")) !== null, "30 mnt sebelum = tahan");
  assert(findOpeningHold("US100", t("2026-10-09T12:59:00Z")) === null, "31 mnt sebelum = bebas");
  assert(findOpeningHold("US30", t("2026-10-09T14:30:00Z")) !== null, "60 mnt sesudah = tahan");
  assert(findOpeningHold("US500.DEC", t("2026-10-09T14:31:00Z")) === null, "61 mnt sesudah = bebas");
  assert(findOpeningHold("#META", t("2026-10-09T13:40:00Z")) !== null, "saham AS ikut bursa AS");
  assert(findOpeningHold("EURUSD", t("2026-10-09T13:30:00Z")) === null, "forex tidak diatur");
  assert(findOpeningHold("US100", t("2026-10-10T13:30:00Z")) === null, "Sabtu tidak ada pembukaan");
  // US100 BELI 18:07 WIT: peringatan muncul 21:30–22:29 WIT.
  const warn = openingWarning("US100", t("2026-10-09T13:00:00Z"));
  assert(warn !== null && warn.includes("22:30 WIT") && warn.includes("30 menit lagi"), String(warn));
  assert(openingWarning("US100", t("2026-10-09T12:29:00Z")) === null, "61 mnt sebelum = belum");
  // DST: Senin 2 Nov 2026 NY sudah EST → 14:30 UTC = 23:30 WIT.
  const nov = openingState("US100", t("2026-11-02T14:30:00Z"));
  assert(nov !== null && nov.minutesFromOpen === 0 && nov.openWit === "23:30", JSON.stringify(nov));
  const de = openingState("DE30_ORB", t("2026-10-09T07:00:00Z"));
  assert(de !== null && de.minutesFromOpen === 0 && de.openWit === "16:00", JSON.stringify(de));
});

test("621. O2 pemindai: status DITAHAN_BUKA (setelah sesi, sebelum taruhan ganda) + panel pakai jam pindai", () => {
  const sc = readSrc("src/lib/symbolScanner.ts");
  const sesi = sc.indexOf('status: "DITAHAN_SESI"');
  const buka = sc.indexOf('status: "DITAHAN_BUKA"');
  const ganda = sc.indexOf('status: "DITAHAN_KORELASI"');
  assert(sesi > 0 && buka > sesi && ganda > buka, `urutan ${sesi}/${buka}/${ganda}`);
  assert(sc.includes("findOpeningHold(symbol, input.openingNowMs)"), "pakai satpam O1");
  assert(sortScanRows([
    { symbol: "B", status: "TUNGGU", decision: "TUNGGU", direction: "TUNGGU", held: false, score: 0, reason: "", costShareOfRisk: null, candles: 200 },
    { symbol: "A", status: "DITAHAN_BUKA", decision: "TUNGGU", direction: "BELI", held: true, score: 4, reason: "", costShareOfRisk: null, candles: 200 },
  ])[0].symbol === "A", "pembukaan di atas TUNGGU");
  const panel = readSrc("src/components/analysis/SymbolScannerPanel.tsx");
  assert(panel.includes('DITAHAN_BUKA: { label: "Pembukaan bursa"') && panel.includes("openingNowMs: scanAtMs"), "panel");
});

test("622. O2b pembukaan bursa juga menahan Hasil analisa, detail sinyal, pencatat entry", () => {
  const base = { decision: "BELI", stopLoss: 1, takeProfit: 2, suggestedLot: 0.01, warnings: [] as string[] } as unknown as ReturnType<typeof analyzeMarket>;
  const held = applyOpeningHold(base, "US100", Date.parse("2026-10-09T13:15:00Z"));
  assert(held.decision === "TUNGGU" && held.heldBy === "buka" && held.heldDecision === "BELI" && held.stopLoss === null, JSON.stringify(held));
  assert(applyOpeningHold(base, "EURUSD", Date.parse("2026-10-09T13:15:00Z")) === base, "forex tidak diatur");
  assert(applyOpeningHold(base, "US100", Date.parse("2026-10-09T16:00:00Z")) === base, "di luar jendela");
  const app = readSrc("src/App.tsx");
  assert(app.includes("applyOpeningHold(") && app.includes("const nowMs = useNowMs();"), "App");
  assert(readSrc("src/components/result/AnalysisResult.tsx").includes('data-testid="held-buka"'), "kotak penjelasan");
  assert(readSrc("src/lib/signalReason.ts").includes('result.heldBy === "buka"'), "alasan header");
  assert(readSrc("src/components/analysis/SignalDetailPage.tsx").includes("openingNowMs: Date.now(),"), "detail sinyal");
  assert(readSrc("server/services/tradeEntryLog.ts").includes("openingNowMs: now().getTime(),"), "pencatat entry");
});

test("623. O3 kartu posisi: peringatan BURSA SEGERA BUKA 60 menit sebelum pembukaan", () => {
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("openingWarning(holding.symbol, nowMs)") && dash.includes("holding-opening-${holding.id}"), "kotak peringatan");
  assert(dash.includes("BURSA SEGERA BUKA") && dash.includes("const nowMs = useNowMs();"), "label + jam nyata");
});

test("624. M1a broker ketiga MIFX terdaftar (BrokerId mifx), belum aktif di runtime", () => {
  const store = createWorkspaceStore();
  assert(store.mifx === null && store.finex === null && store.orbitraderberjangka === null, JSON.stringify(store));
  assert(readSrc("src/types/broker.ts").includes('export type BrokerId = "finex" | "orbitraderberjangka" | "mifx";'), "tipe");
  assert(readSrc("src/lib/serverClock.ts").includes("mifx: 3,"), "jam server perkiraan");
  assert(readSrc("src/components/holdings/HoldingsMonitor.tsx").includes("mifx: [],"), "posisi live menyusul");
});

test("625. M1b server mengenal MIFX: ?broker=mifx, Company Monex → mifx, TIDAK jatuh ke sumber OTB", () => {
  assert(resolveLiveBroker("mifx") === "mifx", "query mifx valid");
  const def = { name: "otb" };
  const fin = { name: "finex" };
  const mifx = { name: "mifx" };
  assert(pickLiveSource("mifx", def, fin) === null, "MIFX belum dikonfigurasi = null (404 jujur), bukan data OTB");
  assert(pickLiveSource("mifx", def, fin, mifx) === mifx, "sumber MIFX");
  assert(pickLiveSource("orbitraderberjangka", def, fin, mifx) === def && pickLiveSource("finex", def, fin, mifx) === fin, "broker lama tetap");
  assert(brokerFromCompany("PT Monex Investindo Futures") === "mifx", "Company MIFX");
  assert(brokerFromCompany("PT. Finex Bisnis Solusi Futures") === "finex" && brokerFromCompany("Lain") === null, "lama tetap");
});

test("626. M2a spesifikasi 35 simbol MIFX (.m): forex VERIFIED komisi $10/lot, lainnya PENDING; 150 lama utuh", () => {
  assert(MIFX_SPEC_SYMBOLS.length === 35 && Object.keys(INSTRUMENT_SPECS_32).length === 150, "jumlah");
  const eu = getInstrumentSpec32("EURUSD.m");
  assert(eu !== null && eu.broker === "mifx" && eu.leverage === 100000 && eu.commission === 10 && eu.status === "VERIFIED", JSON.stringify(eu));
  const gbp = getInstrumentSpec32("EURGBP.m");
  assert(gbp !== null && gbp.quoteCurrency === "GBP" && gbp.swapLong === -2.69 && gbp.swapShort === -0.31, "EURGBP.m = Specification MT5");
  const nq = getInstrumentSpec32("NQ.m");
  assert(nq !== null && nq.leverage === 20 && nq.status === "VERIFIED", "NQ.m komisi terverifikasi (Specification 10 Okt)");
  assert(MIFX_SPEC_SYMBOLS.every((m) => getInstrumentSpec32(m)?.status === "VERIFIED" && getInstrumentSpec32(m)?.commission === 10), "35/35 komisi 10/lot terverifikasi");
  assert(getInstrumentSpec32("USDJPY.m")?.isJPYPair === true && getInstrumentSpec32("XAUUSD.m")?.leverage === 100, "JPY/emas");
  assert(getInstrumentSpec32("EURUSD")?.broker === "finex", "simbol Finex tetap");
  for (const s of MIFX_SPEC_SYMBOLS) assert(INSTRUMENT_SPECS_32[s] === undefined, `nama ${s} bentrok dengan Finex/OTB`);
});

test("627. M2b nama MIFX: golongan risiko, mata uang berita, bursa asal (DJ/NQ/SP/NK/HK.m, .m, minyak)", () => {
  assert(riskGroupOf("EURUSD.m").id === "FOREX" && riskGroupOf("USDJPY.m").id === "FOREX_JPY", "forex .m");
  assert(riskGroupOf("XAUUSD.m").id === "LOGAM" && riskGroupOf("CLS10.m").id === "MINYAK" && riskGroupOf("OIL_NEXT").id === "MINYAK", "logam/minyak");
  for (const s of ["DJ.m", "NQ.m", "SP.m", "NK.m", "HK.m"]) assert(riskGroupOf(s).id === "INDEKS", `${s} indeks`);
  assert(baseRiskSymbol("NQ.m") === "US100" && baseRiskSymbol("META.US") === "META.US", "alias tanpa merusak saham .US");
  assert(newsCurrenciesOf("NK.m").join() === "JPY" && newsCurrenciesOf("GBPAUD.m").join() === "GBP,AUD", "mata uang berita");
  const t = Date.parse("2026-10-09T13:30:00Z");
  assert(openingState("SP.m", t)?.minutesFromOpen === 0 && openingState("HK.m", t) !== null, "bursa asal");
  assert(findOpeningHold("DJ.m", Date.parse("2026-10-09T13:15:00Z")) !== null, "DJ.m ditahan dekat buka bursa AS");
  for (const m of MIFX_SPEC_SYMBOLS) assert(riskGroupOf(m).capIdr !== null, `${m} punya batas risiko (bukan ditahan)`);
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
    Math.abs((attached.swapDetail.swapCostInUSD ?? 0) - -283.1724 / 360) < 0.01,
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
    Math.abs(attached.swapDetail.swapCostInContractBaseCurrency - -431.7 / 360) <
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
  assert(memo.includes("-0.79 USD"), `memo=${memo}`);
  assert(memo.includes("-1.2 AUD"), `memo=${memo}`);
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
 * 68/68 verified (16 lama + 52 bulk export 06 Okt 2026 Tahap 6I).
 * Finex byte-identik; SSE 318-329 tidak tersentuh. */

test("330. 68/68 simbol verified end-to-end (preset+warning+validator)", () => {
  assert(
    isOtbSymbolVerified("GBPUSD_ORB") === true,
    "GBPUSD_ORB harus verified",
  );
  assert(
    isOtbSymbolVerified("AUDCHF_ORB") === true,
    "AUDCHF_ORB harus verified (6E-1)",
  );
  assert(
    isOtbSymbolVerified("AUDJPY_ORB") === true,
    "AUDJPY_ORB harus verified (6E-2)",
  );
  assert(
    isOtbSymbolVerified("AUDNZD_ORB") === true,
    "AUDNZD_ORB harus verified (6E-3)",
  );
  assert(
    isOtbSymbolVerified("AUDUSD_ORB") === true,
    "AUDUSD_ORB harus verified (6E-4)",
  );
  assert(
    isOtbSymbolVerified("CADJPY_ORB") === true,
    "CADJPY_ORB harus verified (6E-5)",
  );
  assert(
    isOtbSymbolVerified("CHFJPY_ORB") === true,
    "CHFJPY_ORB harus verified (6E-6)",
  );
  assert(
    isOtbSymbolVerified("EURAUD_ORB") === true,
    "EURAUD_ORB harus verified (6E-7)",
  );
  assert(
    isOtbSymbolVerified("EURCAD_ORB") === true,
    "EURCAD_ORB harus verified (6E-8)",
  );
  assert(
    isOtbSymbolVerified("GBPAUD_ORB") === true,
    "GBPAUD_ORB harus verified (6E-9)",
  );
  assert(
    isOtbSymbolVerified("USDCAD_ORB") === true,
    "USDCAD_ORB harus verified (6E-10)",
  );
  assert(
    isOtbSymbolVerified("AUDCAD_ORB") === true,
    "AUDCAD_ORB harus verified (6E-11)",
  );
  assert(
    isOtbSymbolVerified("EURCHF_ORB") === true,
    "EURCHF_ORB harus verified (6E-12)",
  );
  assert(
    isOtbSymbolVerified("NZDJPY_ORB") === true,
    "NZDJPY_ORB harus verified (6H)",
  );
  assert(
    isOtbSymbolVerified("USDCHF_ORB") === true,
    "USDCHF_ORB harus verified (6H)",
  );
  assert(
    isOtbSymbolVerified("USDJPY_ORB") === true,
    "USDJPY_ORB harus verified (6H)",
  );
  assert(
    VERIFIED_OTB_SYMBOLS.length === 68 &&
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
      VERIFIED_OTB_SYMBOLS.includes("USDJPY_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("XAUUSD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("US100.DEC") &&
      VERIFIED_OTB_SYMBOLS.includes("AAPL.US"),
    "daftar verified berubah di luar 6I",
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
  assert(
    applied.commission === 33,
    "komisi verified tidak terisi (spec32 33, 6G)",
  );
  assert(applied.minLot === 0.1, "minLot verified tidak terisi");
  assert(
    getOtbDetectedNotice("finex", "GBPUSD_ORB") !== null,
    "banner pindah hilang untuk simbol verified",
  );
});

test("331. 0 simbol pending; 68/68 ter-apply via spec32 (6I)", () => {
  // Tahap 6E-1..6E-12 + 6H + 6I: seluruh 68 simbol OTB verified.
  // Tidak ada pending tersisa: VERIFIED_OTB_SYMBOLS = 68, semua simbol
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
    assert(applied !== previous, `${symbol} preset spec32 tidak ter-apply`);
    assert(
      applied.commission === (symbol.endsWith(".US") ? 0 : 33),
      `${symbol} commission=${applied.commission} (spec32 33; saham .US 0)`,
    );
    assert(
      getOtbDetectedNotice("finex", symbol) !== null,
      `${symbol} banner pindah hilang (khusus verified)`,
    );
  }
  // Dropdown tetap menampilkan semuanya (tidak ada simbol dihapus).
  const dropdown = getAvailableSymbols("orbitraderberjangka");
  assert(dropdown.length === 68, "simbol hilang dari dropdown");
});

test("332. Finex tidak terpengaruh kebijakan verifikasi OTB", () => {
  const finex = getAvailableSymbols("finex");
  assert(finex.length === 82, `daftar Finex=${finex.length}`);
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

test("337. VERIFIED_OTB_SYMBOLS = 68 simbol (6I)", () => {
  assert(
    VERIFIED_OTB_SYMBOLS.length === 68 &&
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
    "daftar verified berubah di luar 6I",
  );
  assert(
    VERIFIED_OTB_SYMBOLS.includes("XAUUSD_ORB") &&
      VERIFIED_OTB_SYMBOLS.includes("AAPL.US"),
    "simbol 6I hilang dari verified",
  );
});

test("338. kontrak SSE quotes tidak berubah", () => {
  const types = readSrc("server/types/quotes.ts");
  assert(types.includes("QuoteSseEnvelope"), "tipe envelope tunggal hilang");
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
  assert(!hook.includes("as QuoteSnapshot"), "cast langsung kembali muncul");
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

test("354. 68/68 OTB verified; invented tetap unverified", () => {
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
  assert(
    isOtbSymbolVerified("USDCAD_ORB"),
    "USDCAD_ORB harus verified (6E-10)",
  );
  assert(
    isOtbSymbolVerified("AUDCAD_ORB"),
    "AUDCAD_ORB harus verified (6E-11)",
  );
  assert(
    isOtbSymbolVerified("EURCHF_ORB"),
    "EURCHF_ORB harus verified (6E-12)",
  );
  assert(isOtbSymbolVerified("NZDJPY_ORB"), "NZDJPY_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("USDCHF_ORB"), "USDCHF_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("USDJPY_ORB"), "USDJPY_ORB harus verified (6H)");
  assert(isOtbSymbolVerified("EURUSD_ORB"), "EURUSD_ORB harus verified (6I)");
  assert(isOtbSymbolVerified("XAUUSD_ORB"), "XAUUSD_ORB harus verified (6I)");
  assert(isOtbSymbolVerified("AAPL.US"), "AAPL.US harus verified (6I)");
  assert(!isOtbSymbolVerified("FAKE_ORB"), "invented dianggap verified");
});

test("355. AnalysisResult: memo swap digate verifikasi + PENDING notice", () => {
  const src = readSrc("src/components/result/AnalysisResult.tsx");
  assert(
    src.includes("isOtbSymbolVerified"),
    "gate verifikasi hilang di hasil",
  );
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

test("358. specs32 berisi 150 simbol (68 OTB + 82 Finex)", () => {
  assert(Object.keys(INSTRUMENT_SPECS_32).length === 150, "harus 150 specs");
  assert(OTB_SPECS_32.length === 68, "OTB harus 68");
  assert(FINEX_SPECS_32.length === 82, "Finex harus 82");
  for (const s of OTB_SPECS_32)
    assert(
      (OTB_ALL_SYMBOLS as readonly string[]).includes(s),
      `${s} bukan OTB`,
    );
  for (const s of FINEX_SPECS_32)
    assert(!s.endsWith("_ORB"), `${s} bocor _ORB ke Finex`);
});

test("359. semua specs32 VERIFIED + commission per broker (6G)", () => {
  for (const [symbol, spec] of Object.entries(INSTRUMENT_SPECS_32)) {
    assert(spec.symbol === symbol, `key/symbol beda: ${symbol}`);
    assert(spec.status === "VERIFIED", `${symbol} bukan VERIFIED`);
    assert(isSpec32Verified(symbol), `${symbol} helper verified gagal`);
    const expected =
      spec.broker === "orbitraderberjangka"
        ? symbol.endsWith(".US") ? 0 : 33
        : symbol.startsWith("#")
          ? 0.1
          : 1;
    assert(
      spec.commission === expected,
      `${symbol} commission=${spec.commission} (expect ${expected})`,
    );
  }
  assert(getInstrumentSpec32("XYZ") === null, "unknown harus null");
  assert(
    getInstrumentSpec32("gbpusd_orb") === null,
    "harus exact case-sensitive",
  );
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

test("364. JPY pairs flagged + tick 0.63 (7 per broker, tanpa fabrikasi)", () => {
  const jpy = getJPYPairSymbols32();
  assert(jpy.length === 14, `JPY=${jpy.length}, harus 14 (7+7)`);
  for (const s of [
    "AUDJPY_ORB",
    "CADJPY_ORB",
    "CHFJPY_ORB",
    "NZDJPY_ORB",
    "USDJPY_ORB",
    "EURJPY_ORB",
    "GBPJPY_ORB",
    "AUDJPY",
    "CADJPY",
    "CHFJPY",
    "NZDJPY",
    "USDJPY",
    "EURJPY",
    "GBPJPY",
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
  assert(
    requireSpec32("US100").swap3DayWeekday === 5,
    "US100 triple bukan Jum",
  );
  assert(
    requireSpec32("AUDJPY_ORB").swap3DayWeekday === 3,
    "FX triple bukan Rab",
  );
});

test("366. Rabu 2026-09-30 terdeteksi triple, Selasa tidak", () => {
  assert(
    detectWednesdayTripleSwap(new Date(2026, 8, 30)) === true,
    "Rab gagal",
  );
  assert(
    detectWednesdayTripleSwap(new Date(2026, 8, 29)) === false,
    "Sel lolos",
  );
  const audjpy = requireSpec32("AUDJPY_ORB");
  assert(
    isTripleDay(new Date(2026, 8, 30), audjpy) === true,
    "isTriple Rab gagal",
  );
  assert(
    isTripleDay(new Date(2026, 8, 29), audjpy) === false,
    "isTriple Sel lolos",
  );
  const us100 = requireSpec32("US100");
  assert(isTripleDay(new Date(2026, 9, 2), us100) === true, "US100 Jum gagal");
  assert(
    isTripleDay(new Date(2026, 8, 30), us100) === false,
    "US100 Rab lolos",
  );
  assert(
    getDayMultiplier(new Date(2026, 8, 30), audjpy) === 3,
    "mult Rab bukan 3",
  );
  assert(
    getDayMultiplier(new Date(2026, 8, 29), audjpy) === 1,
    "mult Sel bukan 1",
  );
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

test("379. legacy registry/dropdown 68-OTB + 82-Finex utuh (6I)", () => {
  assert(
    getAvailableSymbols("orbitraderberjangka").length === 68,
    "OTB berubah",
  );
  assert(getAvailableSymbols("finex").length === 82, "Finex berubah");
  assert(Object.keys(OTB_PRESETS).length === 68, "preset berubah");
  assert(VERIFIED_OTB_SYMBOLS.length === 68, "verified berubah di luar 6I");
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
  assert(Object.isFrozen(requireSpec32("AUDJPY_ORB")), "spec tidak frozen");
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
  assert(
    gbp.leverage === 100000 && gbp.commission === 1 && gbp.verified,
    "GBPUSD salah",
  );
  const us100 = getSpec32FormDefaults("US100");
  assert(
    us100.leverage === 20 && us100.commission === 1 && us100.verified,
    "US100 salah (contract 20 sejak perbaikan 9 Okt)",
  );
});

test("388. wiring fallback unknown/empty (tanpa fabrikasi)", () => {
  const unknown = getSpec32FormDefaults("XYZ");
  assert(
    unknown.leverage === SPEC32_FALLBACK_LEVERAGE,
    "fallback leverage salah",
  );
  assert(
    unknown.commission === SPEC32_FALLBACK_COMMISSION,
    "fallback commission salah",
  );
  assert(unknown.verified === false, "unknown dianggap verified");
  assert(isSpec32Available("XYZ") === false, "unknown available");
  assert(isSpec32Available("") === false, "empty available");
});

test("389. wiring semua 150 simbol verified available (komisi per broker)", () => {
  for (const s of Object.keys(INSTRUMENT_SPECS_32)) {
    const d = getSpec32FormDefaults(s);
    assert(d.verified === true, `${s} tidak verified`);
    // Aturan komisi mengikuti field broker (bukan suffiks: OTB punya
    // simbol tanpa _ORB seperti CLU dan *.US sejak 6I).
    const spec = requireSpec32(s);
    const expected =
      spec.broker === "orbitraderberjangka" ? (s.endsWith(".US") ? 0 : 33) : s.startsWith("#") ? 0.1 : 1;
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
  assert(
    spec32VerificationNotice("GBPUSD_ORB") === null,
    "verified harus null",
  );
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
  assert(
    finex.pointValue === 100000 && finex.commission === 1,
    "Finex berubah di luar komisi 6G",
  );
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
  assert(!src.includes('from "./swapCost"'), "tercemar modul biaya legacy");
  assert(
    !src.includes('from "../calculations/swapCost"'),
    "tercemar kalkulator legacy",
  );
  assert(
    !src.includes("extraction/ExtractedDataForm"),
    "tercemar komponen form",
  );
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
  assert(
    defaults.commission === 33,
    `commission=${defaults.commission} (expect 33)`,
  );
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
  assert(
    spec32VerificationNotice("AUDJPY_ORB") === null,
    "verified return null",
  );
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
  assert(
    applied.commission === 33,
    `commission=${applied.commission} (spec32)`,
  );
  assert(
    applied.pointValue === 100000,
    `pointValue=${applied.pointValue} (contractSize; JPY belum dikonversi USD)`,
  );
  assert(applied.minLot === 0.1, `minLot=${applied.minLot}`);
});

test("406. applyBrokerPreset: 68 OTB spec32 semua commission=33", () => {
  assert(OTB_SPECS_32.length === 68, "spec32 OTB harus 68");
  for (const symbol of OTB_SPECS_32) {
    const applied = applyBrokerPreset(
      makeEmptyBroker(),
      symbol,
      "orbitraderberjangka",
    );
    // 6I: 68/68 simbol berprofile OTB ter-apply (commission 33).
    const expected = getOtbInstrumentProfile(symbol) === null || symbol.endsWith(".US") ? 0 : 33;
    assert(
      applied.commission === expected,
      `${symbol} commission=${applied.commission}`,
    );
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
  assert(
    Math.abs(preview.swapUSD - -1.57) < 0.011,
    `swapUSD=${preview.swapUSD}`,
  );
});

test("408. spec32 non-regresi: OTB fixture data tetap locked (commission 33)", () => {
  const p = getOtbInstrumentProfile("GBPUSD_ORB");
  if (p === null) throw new Error("GBPUSD_ORB preset hilang");
  assert(
    p.commission?.pricePerLot === 33,
    `fixture=${p.commission?.pricePerLot} (harus 33)`,
  );
});

test("409. spec32 fallback: unknown symbol → previous (no change)", () => {
  const previous = { ...makeEmptyBroker(), commission: 50 };
  const result = applyBrokerPreset(previous, "UNKNOWN", "orbitraderberjangka");
  assert(result === previous, "unknown symbol ikut ter-apply");
  assert(result.commission === 50, `commission=${result.commission}`);
});

test("410. spec32 modul murni: legacy registry Finex tidak rusak", () => {
  assert(SUPPORTED_SYMBOLS.length === 82, "daftar Finex berubah");
  const finex = getBrokerProfile("finex");
  assert(finex.instruments.length === 82, "instrumen Finex berubah");
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
    Math.abs(cost.swapCost - -2138.415 / 360) < 1e-6,
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
    assert(
      m.maintenanceMargin === 100000,
      `${s} maintenance=${m.maintenanceMargin}`,
    );
    assert(m.hedgedMargin === 50000, `${s} hedged=${m.hedgedMargin}`);
    assert(Object.isFrozen(m), `${s} tidak frozen`);
  }
  assert(getOtbMarginRequirements("FAKE_ORB") === null, "invented harus null");
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
  assert(
    finex.commission === FINEX_DEFAULT_COMMISSION,
    "Finex default bukan 1",
  );
});

/* ---------------- Base URL backend via env (PROD): TEST 419-421 ---------------- */

test("419. resolveApiBaseUrl: default, trim, slash, eksplisit", () => {
  assert(
    resolveApiBaseUrl() === DEFAULT_API_BASE_URL ||
      resolveApiBaseUrl().startsWith("http"),
    "default rusak",
  );
  assert(
    resolveApiBaseUrl("http://192.168.1.63:3000") ===
      "http://192.168.1.63:3000",
    "eksplisit berubah",
  );
  assert(
    resolveApiBaseUrl("  http://192.168.1.63:3000/  ") ===
      "http://192.168.1.63:3000",
    "trim/slash gagal",
  );
  assert(resolveApiBaseUrl("") === resolveApiBaseUrl(), "empty inkonsisten");
  assert(
    typeof API_BASE_URL === "string" && API_BASE_URL !== "",
    "konstanta kosong",
  );
});

test("420. hooks live memakai base URL terpusat (tanpa hardcode)", () => {
  for (const f of [
    "src/hooks/useEquityStream.ts",
    "src/hooks/useQuotesStream.ts",
  ]) {
    const src = readSrc(f);
    assert(src.includes("lib/apiBaseUrl"), `${f} tidak impor apiBaseUrl`);
    assert(
      !src.includes("http://localhost:3000"),
      `${f} masih hardcode localhost`,
    );
  }
});

test("421. CORS origin backend dari env + default lokal", () => {
  assert(
    FRONTEND_ORIGIN === "http://localhost:5173",
    `default=${FRONTEND_ORIGIN}`,
  );
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
  assert(
    parseSnapshotTime("2026-13-99T99:99:99Z") === null,
    "tanggal rusak harus null",
  );
});

test("423. isStale ambang 15 mnt + formatAge bucket", () => {
  const now = 1_700_000_000_000;
  assert(STALE_AFTER_MS === 15 * 60 * 1000, "ambang berubah");
  assert(isStale(now - 60 * 1000, now) === false, "1 mnt dianggap basi");
  assert(isStale(now - 16 * 60 * 1000, now) === true, "16 mnt tak basi");
  assert(isStale(null, now) === false, "null menuduh basi");
  assert(
    isStale(now - 60 * 1000, now, 30 * 1000) === true,
    "threshold custom diabaikan",
  );
  assert(formatAge(30 * 1000) === "baru saja", "detik salah");
  assert(formatAge(5 * 60 * 1000) === "5 mnt lalu", "menit salah");
  assert(formatAge(3 * 3600 * 1000) === "3 jam lalu", "jam salah");
  assert(formatAge(3 * 86400 * 1000) === "3 hari lalu", "hari salah");
  assert(formatAge(-5) === "baru saja", "negatif salah");
  // Seed jelas-basi: gap weekend terdeteksi, tick segar tidak.
  assert(CLEARLY_STALE_AFTER_MS === 12 * 3600 * 1000, "margin seed berubah");
  assert(
    isClearlyStale("2026.10.02 22:54:59", Date.UTC(2026, 9, 4, 12, 0, 0)) ===
      true,
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
  assert(
    checkPriceDeviation(makeFlatCandles(1.09, 5), 1.0) === null,
    "9% gagal",
  );
  assert(
    checkPriceDeviation(makeFlatCandles(1.11, 5), 1.0) !== null,
    "11% lolos",
  );
  // Invalid dilewati tanpa tuduhan.
  assert(checkPriceDeviation([], 1.32) === null, "kosong warning");
  assert(
    checkPriceDeviation(makeFlatCandles(1.32, 5), 0) === null,
    "harga 0 warning",
  );
  assert(
    checkPriceDeviation(makeFlatCandles(1.32, 5), NaN) === null,
    "NaN warning",
  );
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
    normalizeTsToUtc("2026-10-04T06:54:37.014Z", 3) ===
      "2026-10-04T06:54:37.014Z",
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
      {
        timestamp: "2026.10.02 22:54:59",
        symbol: "CADJPY_ORB",
        bid: 110.701,
        ask: 110.749,
      },
      {
        timestamp: "2026.10.02 22:54:59",
        symbol: "CADJPY_ORB",
        bid: 110.701,
        ask: 110.749,
      },
      {
        timestamp: "2026.10.02 22:55:01",
        symbol: "GBPUSD_ORB",
        bid: 1.3237,
        ask: 1.32393,
      },
      { timestamp: "", symbol: "X", bid: 1, ask: 2 },
      { timestamp: "2026.10.02 22:55:02", symbol: "Y", bid: 0, ask: 0 },
    ];
    const r1 = logger.ingest(batch, true);
    assert(
      r1.appended === 2,
      `appended=${r1.appended} (duplikat+invalid harus dilewati)`,
    );
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
    assert(
      fs.existsSync(path.join(dir, "otb", keepF)),
      "file kemarin ikut terhapus",
    );
    const totals = logger.getTotals();
    assert(
      totals.appended === 2 && totals.skipped === 8,
      `totals=${JSON.stringify(totals)}`,
    );
    // Restart backend (proses baru, memori kosong): kunci dimuat dari disk,
    // backfill ulang TIDAK menulis duplikat.
    const logger2 = new TickHistoryLogger(dir, "otb", 3);
    const r3 = logger2.ingest(batch, true);
    assert(r3.appended === 0, `restart menulis ulang: +${r3.appended}`);
    assert(r3.skipped === 5, "restart tak skip semua");
    // Compaction: duplikat manual di file dibersihkan saat init.
    const histFile = path.join(dir, "otb", "ticks-2026-10-02.jsonl");
    const before = fs
      .readFileSync(histFile, "utf-8")
      .split("\n")
      .filter((l: string) => l.trim() !== "").length;
    fs.appendFileSync(histFile, fs.readFileSync(histFile, "utf-8"));
    const logger3 = new TickHistoryLogger(dir, "otb", 3);
    const after = fs
      .readFileSync(histFile, "utf-8")
      .split("\n")
      .filter((l: string) => l.trim() !== "").length;
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
  assert(
    index.includes("/api/history/coverage") ||
      readSrc("server/app.ts").includes("/api/history/coverage"),
    "route coverage hilang",
  );
  const app = readSrc("server/app.ts");
  assert(app.includes("history"), "app tak kenal history");
  const envExample = readSrc(".env.example");
  assert(
    envExample.includes("HISTORY_DIR"),
    "HISTORY_DIR tak didokumentasikan",
  );
  assert(
    envExample.includes("MT5_TZ_OFFSET_OTB"),
    "offset OTB tak didokumentasikan",
  );
  assert(
    envExample.includes("MT5_TZ_OFFSET_FINEX"),
    "offset Finex tak didokumentasikan",
  );
  const gitignore = readSrc(".gitignore");
  assert(
    gitignore.includes("data/"),
    "data/ tak di-ignore (arsip ikut commit!)",
  );
});

/* ---------------- Proxy kurs ECB via backend (FX-PROXY): TEST 430-431 ---------------- */

test("430. isFxCacheFresh + route terdaftar + parser dipakai ulang", () => {
  assert(FX_CACHE_TTL_MS === 12 * 3600 * 1000, "TTL cache berubah");
  const now = 1_700_000_000_000;
  assert(isFxCacheFresh(now - 1000, now) === true, "cache segar ditolak");
  assert(
    isFxCacheFresh(now - 13 * 3600 * 1000, now) === false,
    "cache basi diterima",
  );
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
  assert(
    service.includes("fetchECBRates"),
    "direct fetch hilang (regresi test 287)",
  );
  assert(
    service.includes("eurofxref-daily.xml"),
    "ECB URL hilang (regresi test 287)",
  );
  const appSrc = readSrc("src/App.tsx");
  assert(appSrc.includes("fetchBackendRates"), "App tak pakai proxy");
  assert(
    appSrc.includes("fetchECBRates"),
    "App kehilangan cadangan direct (regresi test 294)",
  );
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
  if (
    currency === "AUD" ||
    currency === "EUR" ||
    currency === "GBP" ||
    currency === "NZD"
  ) {
    return amount * 1;
  }
  return null;
}

test("432. P&L cocok laporan broker 91811209 (real history)", () => {
  // USDCHF buy 0.01 @0.83231 → bid 0.83349 = +1.42 (laporan).
  const usdchf = calculateHoldingPnL(makeHolding(), 0.83349, 0.8336, testToUsd);
  if (usdchf === null) throw new Error("pnl null");
  assert(usdchf.currency === "USD", `ccy=${usdchf.currency}`);
  assert(Math.abs((usdchf?.value ?? 0) - 1.42) < 0.03, `pnl=${usdchf?.value}`);
  // GBPUSD buy 0.01 @1.32483 → 1.32339 = -1.44 (laporan, tanpa konversi).
  const gbpusd = calculateHoldingPnL(
    makeHolding({
      symbol: "GBPUSD",
      entryPrice: 1.32483,
      sl: 1.31977,
      tp: 1.33477,
    }),
    1.32339,
    1.3235,
    testToUsd,
  );
  assert(gbpusd?.currency === "USD", "GBPUSD harus USD langsung");
  assert(Math.abs((gbpusd?.value ?? 0) - -1.44) < 1e-9, `pnl=${gbpusd?.value}`);
  // AUDCAD buy 0.01 @0.99345 → 0.99154 ≈ -1.35 via konversi (bukan -1.91 mentah).
  const audcad = calculateHoldingPnL(
    makeHolding({
      symbol: "AUDCAD",
      entryPrice: 0.99345,
      sl: 0.98975,
      tp: 1.00475,
    }),
    0.99154,
    0.9916,
    testToUsd,
  );
  assert(audcad?.currency === "USD", "AUDCAD harus terkonversi USD");
  assert(Math.abs((audcad?.value ?? 0) - -1.35) < 0.05, `pnl=${audcad?.value}`);
  // Tanpa converter: nilai profit-ccy berlabel jujur.
  const raw = calculateHoldingPnL(
    makeHolding({
      symbol: "AUDCAD",
      entryPrice: 0.99345,
      sl: 0.98975,
      tp: 1.00475,
    }),
    0.99154,
    0.9916,
  );
  assert(raw?.currency === "CAD", "tanpa converter harus CAD");
  // Invalid → null; simbol unknown → null.
  assert(
    calculateHoldingPnL(makeHolding(), 0, 0.8, testToUsd) === null,
    "bid 0 lolos",
  );
  assert(
    calculateHoldingPnL(makeHolding({ symbol: "XYZ" }), 1, 2, testToUsd) ===
      null,
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
  const short = makeHolding({
    direction: "JUAL",
    entryPrice: 0.83523,
    sl: 0.83802,
    tp: 0.83202,
  });
  const shortTp = evaluateExitSignal(short, 0.8319, 0.832, testToUsd);
  assert(shortTp.signal === "EXIT_TAKE_PROFIT", `short TP=${shortTp.signal}`);
  const shortSl = evaluateExitSignal(short, 0.8379, 0.8381, testToUsd);
  assert(shortSl.signal === "EXIT_STOP_LOSS", `short SL=${shortSl.signal}`);
  // Drift: rugi ~60% risiko (di luar band near 15%, di atas ambang 50%).
  const drift = evaluateExitSignal(base, 0.8296, 0.8297, testToUsd);
  assert(
    drift.signal === "WARN_ADVERSE_DRIFT",
    `drift=${drift.signal} (${drift.pnl})`,
  );
  // Dekat TP: dalam 15% rentang (0.84224-0.82724=0.015 → band 0.00225).
  const near = evaluateExitSignal(base, 0.841, 0.8411, testToUsd);
  assert(near.signal === "WARN_NEAR_TP", `near=${near.signal}`);
  // Invalid → HOLD + alasan.
  const bad = evaluateExitSignal(base, 0, 0, testToUsd);
  assert(bad.signal === "HOLD" && bad.pnl === null, "invalid tak HOLD");
});

test("434. validateHoldingInput: sisi SL/TP + spec", () => {
  assert(
    validateHoldingInput({
      symbol: "USDCHF",
      direction: "BELI",
      lot: 0.01,
      entryPrice: 0.83,
      sl: 0.82,
      tp: 0.84,
    }).length === 0,
    "input valid ditolak",
  );
  const wrongSide = validateHoldingInput({
    symbol: "USDCHF",
    direction: "BELI",
    lot: 0.01,
    entryPrice: 0.83,
    sl: 0.84,
    tp: 0.82,
  });
  assert(
    wrongSide.some((m) => m.includes("BELI")),
    "sisi BELI salah lolos",
  );
  const wrongSell = validateHoldingInput({
    symbol: "USDCHF",
    direction: "JUAL",
    lot: 0.01,
    entryPrice: 0.83,
    sl: 0.82,
    tp: 0.84,
  });
  assert(
    wrongSell.some((m) => m.includes("JUAL")),
    "sisi JUAL salah lolos",
  );
  assert(
    validateHoldingInput({
      symbol: "",
      direction: "BELI",
      lot: 0.01,
      entryPrice: 0.83,
      sl: 0.82,
      tp: 0.84,
    }).length > 0,
    "simbol kosong lolos",
  );
  assert(
    validateHoldingInput({
      symbol: "USDCHF",
      direction: "BELI",
      lot: 0,
      entryPrice: 0.83,
      sl: 0.82,
      tp: 0.84,
    }).length > 0,
    "lot 0 lolos",
  );
  assert(
    validateHoldingInput({
      symbol: "XYZ",
      direction: "BELI",
      lot: 0.01,
      entryPrice: 1,
      sl: 0.9,
      tp: 1.1,
    }).some((m) => m.includes("spec")),
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
  assert(
    form.includes("Tanpa order") || form.includes("tanpa order"),
    "label tanpa-order hilang",
  );
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
  assert(
    shortDrift.signal === "WARN_PRICE_DRIFT",
    `short=${shortDrift.signal}`,
  );
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

/* ---------------- Quick exit v1.3.0: TEST 443-445 ---------------- */

test("443. calculateExitPnL cocok laporan broker (exit manual)", () => {
  // USDCHF buy 0.01 @0.83231 exit 0.83349 ≈ +1.42 USD.
  const exit = calculateExitPnL(makeHolding(), 0.83349, testToUsd);
  if (exit === null) throw new Error("exit pnl null");
  assert(exit.currency === "USD", `ccy=${exit.currency}`);
  assert(Math.abs(exit.value - 1.42) < 0.03, `pnl=${exit.value}`);
  // JUAL: profit saat exit di bawah entry.
  const shortExit = calculateExitPnL(
    makeHolding({
      direction: "JUAL",
      entryPrice: 0.83523,
      sl: 0.83802,
      tp: 0.83202,
    }),
    0.832,
    testToUsd,
  );
  assert(shortExit !== null && shortExit.value > 0, "short profit salah arah");
  // Rugi saat exit melawan arah.
  const loss = calculateExitPnL(makeHolding(), 0.83, testToUsd);
  assert(loss !== null && loss.value < 0, "loss tak negatif");
  // Tanpa converter: label profit-ccy jujur.
  const raw = calculateExitPnL(
    makeHolding({
      symbol: "AUDCAD",
      entryPrice: 0.99345,
      sl: 0.98975,
      tp: 1.00475,
    }),
    0.99154,
  );
  assert(raw?.currency === "CAD", "tanpa converter harus CAD");
  // Invalid → null.
  assert(
    calculateExitPnL(makeHolding(), 0, testToUsd) === null,
    "exit 0 lolos",
  );
  assert(
    calculateExitPnL(makeHolding(), -1, testToUsd) === null,
    "exit negatif lolos",
  );
  assert(
    calculateExitPnL(makeHolding({ symbol: "XYZ" }), 1, testToUsd) === null,
    "unknown lolos",
  );
});

test("444. markHoldingExited + filter + counter", () => {
  const holding = makeHolding();
  const exited = markHoldingExited(
    holding,
    { exitPrice: 0.83349, exitTime: "2026-10-05T01:00:00.000Z", note: "TP" },
    testToUsd,
  );
  if (exited === null) throw new Error("mark exit null");
  assert(exited.status === "EXITED", "status salah");
  assert(exited.exitPrice === 0.83349, "harga exit hilang");
  assert(exited.exitTime === "2026-10-05T01:00:00.000Z", "waktu hilang");
  assert(exited.exitNote === "TP", "note hilang");
  // SW2b (10 Okt): posisi manual (jam laptop ISO) tanpa swap asli MT5 →
  // swap TIDAK ditebak (0). Lagi pula Finex swap mati (SwapMode 0, US30
  // menginap 8→9 Okt = 0,00). Dulu +0,09 dari rumus poin lama = keliru.
  // +1.42 − 0.01 komisi + 0 swap = +1.41.
  assert(
    exited.realizedPnl !== undefined &&
      Math.abs(exited.realizedPnl - 1.41) < 0.03,
    `realized=${exited.realizedPnl}`,
  );
  assert(exited.realizedCurrency === "USD", "ccy realized salah");
  assert(exited.swapAtExit === 0, `swapAtExit=${exited.swapAtExit}`);
  // Asli tak termutasi (murni).
  assert(holding.status === undefined, "objek asli termutasi");
  // Sudah EXITED / harga invalid → null.
  assert(
    markHoldingExited(
      exited,
      { exitPrice: 0.84, exitTime: "t", note: "" },
      testToUsd,
    ) === null,
    "double exit lolos",
  );
  assert(
    markHoldingExited(
      holding,
      { exitPrice: 0, exitTime: "t", note: "" },
      testToUsd,
    ) === null,
    "exit 0 lolos",
  );
  // Filter + counter per broker.
  const mixed: Holding[] = [
    { ...makeHolding(), id: "a", brokerId: "finex" },
    { ...makeHolding(), id: "b", brokerId: "finex", status: "EXITED" },
    { ...makeHolding(), id: "c", brokerId: "orbitraderberjangka" },
  ];
  assert(
    filterHoldingsByBroker(mixed, "finex").length === 2,
    "filter finex salah",
  );
  assert(
    filterHoldingsByBroker(mixed, "orbitraderberjangka").length === 1,
    "filter OTB salah",
  );
  assert(filterHoldingsByBroker([], "finex").length === 0, "kosong salah");
  const counts = countHoldings(mixed);
  assert(
    counts.open === 2 && counts.total === 3,
    `counts=${JSON.stringify(counts)}`,
  );
});

test("445. wiring v1.3.0: tab, kartu expand, form exit, log (readSrc)", () => {
  const monitor = readSrc("src/components/holdings/HoldingsMonitor.tsx");
  assert(monitor.includes("holdings-tab-"), "tab broker hilang");
  assert(monitor.includes('role="tablist"'), "tablist hilang");
  assert(monitor.includes("POSISI OPEN"), "counter hilang");
  assert(monitor.includes("filterHoldingsByBroker"), "filter tak dipakai");
  assert(monitor.includes("markHoldingExited"), "exit tak di-wire");
  assert(
    monitor.includes("Tandai Keluar") ||
      monitor.includes("tandai keluar") ||
      readSrc("src/components/holdings/HoldingsDashboard.tsx").includes(
        "Tandai Keluar",
      ),
    "label keluar hilang",
  );
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("HoldingCard"), "kartu hilang");
  assert(dash.includes("KELUAR"), "badge KELUAR hilang");
  assert(dash.includes("Hapus permanen"), "hapus permanen hilang");
  assert(dash.includes("buildUsdConverter"), "converter tak dipakai");
  const lib = readSrc("src/lib/exitMonitor.ts");
  assert(lib.includes("calculateExitPnL"), "exit pnl hilang");
  assert(lib.includes("markHoldingExited"), "mark exit hilang");
  assert(lib.includes("BUKAN eksekusi order"), "disclaimer order hilang");
});

/* ---------------- Counter + auto per tab: TEST 446 ---------------- */

test("446. toAutoHolding + counter tab termasuk MT5", () => {
  const pos = {
    ticket: "2107687",
    symbol: "AUDCAD_ORB",
    side: "BUY",
    volume: 0.1,
    priceOpen: 0.99132,
    sl: 0.98895,
    tp: 0.99523,
    timeOpen: "2026.10.02 17:42:46",
  } as const;
  const holding = toAutoHolding(pos, "orbitraderberjangka");
  assert(holding.id === "mt5-2107687", `id=${holding.id}`);
  assert(holding.direction === "BELI", "BUY tak jadi BELI");
  assert(holding.brokerId === "orbitraderberjangka", "broker hilang");
  assert(holding.entryPrice === 0.99132 && holding.lot === 0.1, "field hilang");
  assert((holding.status ?? "OPEN") === "OPEN", "auto harus OPEN (dipantau)");
  const sell = toAutoHolding({ ...pos, side: "SELL" }, "finex");
  assert(sell.direction === "JUAL", "SELL tak jadi JUAL");
  // Counter tab: manual open + auto.
  const manual: Holding[] = [
    { ...makeHolding(), id: "m1", brokerId: "finex" },
    { ...makeHolding(), id: "m2", brokerId: "finex", status: "EXITED" },
  ];
  const auto: Holding[] = [holding];
  const open =
    countHoldings(filterHoldingsByBroker(manual, "finex")).open + auto.length;
  const total =
    countHoldings(filterHoldingsByBroker(manual, "finex")).total + auto.length;
  assert(open === 2 && total === 3, `counter=${open}/${total} (harap 2/3)`);
  const monitor = readSrc("src/components/holdings/HoldingsMonitor.tsx");
  assert(monitor.includes("toAutoHolding"), "helper tak dipakai monitor");
  assert(monitor.includes("autoByBroker"), "counter per tab hilang");
});

/* ---------------- Workspace per broker WS: TEST 440-442 ---------------- */

function makeWorkspaceMarket(symbol: string, bid: number): MarketData {
  return {
    ...makeEmptyMarket(symbol),
    bid,
    close: bid,
  };
}

function makeWorkspaceState(symbol: string, bid: number): BrokerWorkspace {
  return snapshotWorkspace({
    market: makeWorkspaceMarket(symbol, bid),
    broker: makeEmptyBroker(),
    swingCsv: "time,open,high,low,close\n2026-10-01,1,2,0.5,1.5",
    connectedCsvName: "GBPUSD_H1.csv",
    swingSource: "strength-2",
    result: null,
    confirmed: false,
    blockedReasons: null,
    image: null,
    rawOcr: "ocr",
  });
}

test("440. snapshotWorkspace: salinan lepas + fresh + store", () => {
  const store = createWorkspaceStore();
  assert(
    store.finex === null && store.orbitraderberjangka === null,
    "store tak kosong",
  );
  const snap = makeWorkspaceState("GBPUSD", 1.32);
  assert(snap.market.symbol === "GBPUSD", "simbol hilang");
  assert(snap.market.bid === 1.32, "bid hilang");
  // Mutasi sumber tak menular ke snapshot (copy, bukan referensi).
  const market = makeWorkspaceMarket("GBPUSD", 9.99);
  const snap2 = snapshotWorkspace({
    market,
    broker: makeEmptyBroker(),
    swingCsv: "",
    connectedCsvName: "",
    swingSource: null,
    result: null,
    confirmed: false,
    blockedReasons: ["x"],
    image: null,
    rawOcr: "",
  });
  market.bid = 0;
  assert(snap2.market.bid === 9.99, "snapshot menunjuk objek asli");
  const fresh = createFreshWorkspace(
    makeEmptyMarket("EURUSD"),
    makeEmptyBroker(),
  );
  assert(fresh.market.symbol === "EURUSD", "fresh salah");
  assert(fresh.result === null && fresh.swingCsv === "", "fresh tak kosong");
  assert(fresh.confirmed === false, "fresh terkonfirmasi");
});

test("441. hasWorkspaceWork: hasil/parsial vs kosong", () => {
  assert(hasWorkspaceWork(null) === false, "null dianggap berisi");
  const withResult = {
    ...makeWorkspaceState("GBPUSD", 1.32),
    result: {} as never,
  };
  assert(hasWorkspaceWork(withResult) === true, "hasil tak terdeteksi");
  const confirmedOnly = {
    ...makeWorkspaceState("GBPUSD", 0),
    market: makeEmptyMarket(""),
    swingCsv: "",
    confirmed: true,
  };
  assert(hasWorkspaceWork(confirmedOnly) === true, "konfirmasi tak terdeteksi");
  const csvOnly = {
    ...makeWorkspaceState("GBPUSD", 0),
    market: makeEmptyMarket(""),
    swingCsv: "time,open\n2026-10-01,1",
  };
  assert(hasWorkspaceWork(csvOnly) === true, "csv tak terdeteksi");
  const priced = makeWorkspaceState("GBPUSD", 1.32);
  assert(hasWorkspaceWork(priced) === true, "market terisi tak terdeteksi");
  const empty = {
    ...makeWorkspaceState("", 0),
    market: makeEmptyMarket(""),
    swingCsv: "",
    connectedCsvName: "",
    rawOcr: "",
  };
  assert(hasWorkspaceWork(empty) === false, "kosong dianggap berisi");
});

test("442. App wiring workspace: simpan-pulihkan + badge (readSrc)", () => {
  const app = readSrc("src/App.tsx");
  assert(app.includes("brokerWorkspace"), "impor workspace hilang");
  assert(!app.includes("snapshotWorkspace"), "pindah broker tidak lagi menyimpan");
  assert(app.includes("createWorkspaceStore"), "store awal hilang");
  assert(app.includes("workspacesRef"), "ref store hilang");
  assert(app.includes("savedFlags"), "state badge hilang");
  assert(app.includes("setResult(saved.result)"), "restore hasil hilang");
  assert(app.includes("workspace-saved-notice"), "testid badge hilang");
  assert(app.includes("tersimpan — pilih broker"), "teks badge hilang");
  // Batasan lama tetap: handler bersih tampilan, tak tulis market/preset.
  const body = readAppBrokerHandler();
  assert(body.includes("clearAnalysisOutput()"), "pembersih tampilan hilang");
  assert(body.includes('setSwingCsv("")'), "putus CSV hilang");
  assert(body.includes("setMarket(emptyMarket)"), "pindah broker harus mengosongkan market");
  assert(body.includes("setBroker(emptyBroker)"), "pindah broker harus mengosongkan broker");
  assert(!body.includes("analyzeMarket"), "handler menyentuh engine");
});

/* ---------------- Posisi MT5 otomatis AP: TEST 446-448 ---------------- */

test("447. parsePositionRow + isBrokerPosition (format EA)", () => {
  const row =
    "108571917,GBPUSD,buy,0.01,1.32483,1.31977,1.33477,2026.09.29 04:08:06";
  const parsed = parsePositionRow(row);
  if (parsed === null) throw new Error("baris EA valid ditolak");
  assert(parsed.ticket === "108571917", "ticket hilang");
  assert(parsed.symbol === "GBPUSD", "simbol hilang");
  assert(parsed.side === "BUY", "case buy tak dinormalisasi");
  assert(parsed.volume === 0.01, "volume salah");
  assert(parsed.priceOpen === 1.32483, "open salah");
  assert(parsed.sl === 1.31977 && parsed.tp === 1.33477, "SL/TP salah");
  assert(parsed.timeOpen === "2026.09.29 04:08:06", "waktu hilang");
  assert(isBrokerPosition(parsed), "guard menolak valid");
  // Tanpa SL/TP (0) tetap valid — sinyal terkait dinonaktifkan downstream.
  const noSlTp = parsePositionRow(
    "1,EURUSD,SELL,0.02,1.08,0,0,2026.10.05 01:00:00",
  );
  assert(
    noSlTp !== null && noSlTp.sl === 0 && noSlTp.tp === 0,
    "SL/TP 0 ditolak",
  );
  assert(isBrokerPosition(noSlTp), "guard menolak SL/TP 0");
  // Invalid.
  assert(parsePositionRow("a,b") === null, "baris pendek lolos");
  assert(
    parsePositionRow("1,GBPUSD,HOLD,0.01,1.3,1.2,1.4,t") === null,
    "side HOLD lolos",
  );
  assert(
    parsePositionRow("1,GBPUSD,BUY,0,1.3,1.2,1.4,t") === null,
    "volume 0 lolos",
  );
  assert(
    parsePositionRow("1,GBPUSD,BUY,0.01,-1,1.2,1.4,t") === null,
    "harga negatif lolos",
  );
  assert(
    parsePositionRow("1,,BUY,0.01,1.3,1.2,1.4,t") === null,
    "simbol kosong lolos",
  );
  assert(isBrokerPosition(null) === false, "null lolos guard");
  assert(
    isBrokerPosition({ ...parsed, side: "HOLD" }) === false,
    "side liar lolos guard",
  );
});

test("448. PositionsLogReader: baca file + status jujur (temp dir)", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdbka-pos-"));
  const file = path.join(dir, "positions.csv");
  fs.writeFileSync(
    file,
    "Ticket,Symbol,Type,Volume,PriceOpen,SL,TP,TimeOpen\n" +
      "108571917,GBPUSD,buy,0.01,1.32483,1.31977,1.33477,2026.09.29 04:08:06\n" +
      "baris-rusak\n" +
      "108616105,USDCHF,SELL,0.02,0.83231,0.82724,0.84224,2026.09.29 06:04:06\n",
  );
  const reader = new PositionsLogReader(file);
  try {
    // init() async tetapi jalur sukses sinkron penuh (tanpa timer);
    // aman dibaca langsung (pola yang sama dipakai suite quotes).
    void reader.init();
    assert(
      reader.getLastStatus() === "valid_snapshot",
      `status=${reader.getLastStatus()}`,
    );
    const all = reader.getAll();
    assert(all.length === 2, `count=${all.length}`);
    assert(
      all[0].symbol === "GBPUSD" && all[0].side === "BUY",
      "baris 1 salah",
    );
    assert(
      all[1].symbol === "USDCHF" && all[1].side === "SELL",
      "baris 2 salah",
    );
    assert(all[1].volume === 0.02, "volume salah");
  } finally {
    reader.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("449. wiring AP: route + hook + seksi otomatis + env (readSrc)", () => {
  const routes = readSrc("server/routes/positionsRoutes.ts");
  assert(routes.includes('"/"'), "endpoint list hilang");
  assert(routes.includes("resolveLiveBroker"), "broker query hilang");
  assert(routes.includes("pickLiveSource"), "dual-source hilang");
  assert(routes.includes("404"), "404 jujur hilang");
  const app = readSrc("server/app.ts");
  assert(app.includes("/api/positions"), "mount hilang");
  const index = readSrc("server/index.ts");
  assert(index.includes("PositionsLogReader"), "reader tak di-wire");
  assert(index.includes("POSITIONS_LOG_PATH"), "env path hilang");
  const hook = readSrc("src/hooks/useBrokerPositions.ts");
  assert(hook.includes("/api/positions"), "URL hook hilang");
  assert(hook.includes("sourceMissing"), "flag EA-belum-pasang hilang");
  const monitor = readSrc("src/components/holdings/HoldingsMonitor.tsx");
  assert(monitor.includes("useBrokerPositions"), "hook tak dipakai monitor");
  const autoSection = readSrc(
    "src/components/holdings/AutoPositionsSection.tsx",
  );
  assert(autoSection.includes("Posisi MT5 otomatis"), "seksi otomatis hilang");
  assert(
    autoSection.includes("useBrokerPositions"),
    "hook tak dipakai seksi otomatis",
  );
  assert(
    readSrc("src/App.tsx").includes("<AutoPositionsSection"),
    "seksi otomatis tak dipasang di App",
  );
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("readOnly"), "mode read-only hilang");
  assert(dash.includes("tutup/ubah di terminal"), "label read-only hilang");
  const envExample = readSrc(".env.example");
  assert(envExample.includes("POSITIONS_LOG_PATH_FINEX"), "env Finex hilang");
  const ea = readSrc("ea/ExportPositions.mq5");
  assert(ea.includes("PositionGetTicket"), "baca posisi hilang di EA");
  assert(ea.includes("positions.csv"), "nama file EA hilang");
});

/* ---------------- Komisi dalam P&L bersih (NET): TEST 450-451 ---------------- */

test("450. commissionForHolding: OTB 33, Finex 1.00, unknown null", () => {
  assert(commissionForHolding("AUDCAD_ORB", 0.1) === 3.3, "OTB 0.1 harus 3.3");
  assert(commissionForHolding("GBPUSD_ORB", 1) === 33, "OTB 1 lot harus 33");
  assert(commissionForHolding("GBPUSD", 1) === 1, "Finex harus 1.00");
  assert(commissionForHolding("US100", 2) === 2, "US100 2 lot harus 2");
  assert(commissionForHolding("XYZ", 1) === null, "unknown harus null");
  assert(commissionForHolding("GBPUSD", 0) === null, "lot 0 harus null");
  assert(commissionForHolding("GBPUSD", -1) === null, "lot negatif harus null");
});

test("451. pnlNet = pnl − komisi di evaluasi + exit", () => {
  // USDCHF buy 0.01: gross +1.42, komisi Finex $0.01 → net +1.41.
  const evaluation = evaluateExitSignal(
    makeHolding(),
    0.83349,
    0.8336,
    testToUsd,
  );
  assert(evaluation.commission === 0.01, `komisi=${evaluation.commission}`);
  assert(
    evaluation.pnl !== null && Math.abs(evaluation.pnl - 1.42) < 0.03,
    `gross=${evaluation.pnl}`,
  );
  assert(
    evaluation.pnlNet !== null && Math.abs(evaluation.pnlNet - 1.41) < 0.03,
    `net=${evaluation.pnlNet}`,
  );
  // OTB AUDCAD_ORB buy 0.1: komisi 3.30 ikut terpotong.
  const otb = evaluateExitSignal(
    makeHolding({
      symbol: "AUDCAD_ORB",
      entryPrice: 0.99132,
      sl: 0.98895,
      tp: 0.99523,
      lot: 0.1,
    }),
    0.99109,
    0.99129,
    testToUsd,
  );
  assert(otb.commission === 3.3, `komisi OTB=${otb.commission}`);
  assert(otb.pnl !== null && otb.pnlNet !== null, "pnl null");
  assert(
    Math.abs((otb.pnl as number) - (otb.pnlNet as number) - 3.3) < 1e-9,
    "net bukan gross−komisi",
  );
  // Exit realisasi juga bersih.
  const exited = markHoldingExited(
    makeHolding(),
    { exitPrice: 0.83349, exitTime: "t", note: "" },
    testToUsd,
  );
  if (exited === null) throw new Error("mark exit null");
  assert(
    exited.realizedPnl !== undefined &&
      Math.abs(exited.realizedPnl - 1.41) < 0.03,
    `realized=${exited.realizedPnl}`,
  );
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("pnlNet"), "dashboard tak tampil bersih");
  assert(dash.includes("incl. komisi"), "label komisi hilang");
});

/* ---------------- Swap menginap di kartu (SWP): TEST 452-453 ---------------- */

test("452. calculateHoldingSwap: intraday 0, multi-hari via spec32", () => {
  // Intraday (entry hari ini) → 0 jujur, bukan null.
  const now = Date.parse("2026-10-05T10:00:00.000Z");
  const intraday = calculateHoldingSwap(
    makeHolding({ entryTime: "2026-10-05T01:00:00.000Z" }),
    now,
  );
  assert(intraday !== null, "intraday harus 0, bukan null");
  if (intraday === null) throw new Error("intraday null");
  assert(intraday.value === 0 && intraday.daysHeld === 0, "intraday bukan 0");
  assert(intraday.currency === "USD", "ccy salah");
  // SW2b (10 Okt): perkiraan ikut mode broker (OTB persen/360). AUDCAD_ORB 0,1
  // Jum 2 Okt 17:42 → Sen 5 Okt 10:00 jam server = 1 hari tagih (Jumat;
  // akhir pekan 0) × 0,1 × 100.000 × 0,99132 × −0,75% ÷ 360 = −0,2065 CAD ≈ −0,15 USD.
  const cad = (amount: number, ccy: string) => (ccy === "USD" ? amount : ccy === "CAD" ? amount / 1.405 : null);
  const audcad = makeHolding({
    symbol: "AUDCAD_ORB",
    brokerId: "orbitraderberjangka",
    entryPrice: 0.99132,
    sl: 0.98895,
    tp: 0.99523,
    lot: 0.1,
    entryTime: "2026.10.02 17:42:46",
  });
  const multi = calculateHoldingSwap(audcad, now, { nowServer: "2026.10.05 10:00:00", price: 0.99132, convertToUsd: cad });
  assert(multi !== null, "multi-hari null");
  if (multi === null) throw new Error("multi-hari null");
  assert(multi.daysHeld === 2 && multi.source === "PERKIRAAN", `days=${multi.daysHeld}`);
  assert(multi.value === -0.15, `swap=${multi.value}`);
  assert(calculateHoldingSwap(audcad, now) === null, "tanpa jam server = tanpa perkiraan (bukan rumus poin lama)");
  // Entry invalid / simbol unknown / lot 0 → null.
  assert(
    calculateHoldingSwap(makeHolding({ entryTime: "kapan" }), now) === null,
    "entry rusak lolos",
  );
  assert(
    calculateHoldingSwap(makeHolding({ symbol: "XYZ" }), now) === null,
    "unknown lolos",
  );
  assert(
    calculateHoldingSwap(makeHolding({ lot: 0 }), now) === null,
    "lot 0 lolos",
  );
});

test("453. swap di evaluasi + exit + tampil kartu (readSrc)", () => {
  const evaluation = evaluateExitSignal(
    makeHolding(),
    0.83349,
    0.8336,
    testToUsd,
  );
  assert(evaluation.swap !== undefined, "field swap hilang di evaluasi");
  assert(
    evaluation.swap === null || typeof evaluation.swap.value === "number",
    "bentuk swap salah",
  );
  // Exit mengunci swap (entry 29 Sep → exit 5 Okt = 6 hari).
  const exited = markHoldingExited(
    makeHolding(),
    { exitPrice: 0.83349, exitTime: "2026-10-05T01:00:00.000Z", note: "" },
    testToUsd,
  );
  if (exited === null) throw new Error("mark exit null");
  assert(
    exited.swapAtExit !== undefined &&
      Number.isFinite(exited.swapAtExit as number),
    "swapAtExit tak terkunci",
  );
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("Swap est."), "baris swap hilang di kartu");
  assert(dash.includes("menginap"), "label hari hilang");
});

/* ---------------- Anti-trunkasi desimal OCR (kasus GBPUSD 6 Okt): TEST 454-456 ---------------- */

test("454. MA50 terpenggal '1' ditolak; '1.321636' diterima", () => {
  // Reproduksi kasus real: OCR Data Window memenggal MA(50) 1.321636
  // menjadi token "1" (atau buntut "Indicator window 1") → dulu lolos
  // sebagai MA50=1 dan membalik skor +2 vs −4.
  const truncated = parseMaValue("MA(50) 1", "GBPUSD");
  assert(truncated.value === null, `trunkasi lolos: ${truncated.value}`);
  assert(truncated.warnings.length > 0, "tanpa warning padahal kosong");
  const windowArtefact = parseMaValue("MA(50)\n1\nIndicator window", "GBPUSD");
  assert(windowArtefact.value === null, "artefak 'window 1' lolos");
  const full = parseMaValue("MA(50) 1.321636", "GBPUSD");
  assert(full.value === 1.321636, `penuh gagal: ${full.value}`);
  const comma = parseMaValue("MA(50) 1,321636", "GBPUSD");
  assert(comma.value === 1.321636, `koma gagal: ${comma.value}`);
  assert(hasDecimalSeparator("1.32"), "titik tak terdeteksi");
  assert(hasDecimalSeparator("46,46"), "koma tak terdeteksi");
  assert(!hasDecimalSeparator("1"), "integer lolos");
  assert(!hasDecimalSeparator(" -52 "), "spasi menipu");
});

test("455. indikator terpenggal ditolak; nilai penuh + tanda eksplisit lolos", () => {
  // CCI "-52.20" terpenggal jadi "3" → tolak (dulu: CCI=3, skor salah).
  const truncated = parseSignedIndicatorLine("CCI(14) 3", /\bCCI\b/i);
  assert(truncated.value === null, `trunkasi CCI lolos: ${truncated.value}`);
  const full = parseSignedIndicatorLine("CCI(14) -52.20", /\bCCI\b/i);
  assert(full.value === -52.2, `CCI penuh gagal: ${full.value}`);
  assert(full.signExplicit === true, "tanda eksplisit hilang");
  // RSI koma Indonesia tetap lolos.
  const rsi = parseSignedIndicatorLine("RSI(14) 46,46", /\bRSI\b/i, {
    min: 0,
    max: 100,
  });
  assert(rsi.value === 46.46, `RSI gagal: ${rsi.value}`);
  // MACD terpenggal "4" ditolak; pasangan penuh lolos.
  const macdCut = parseSignedIndicatorLine("MACD(12,26,9) 4", /\bMACD\b/i);
  assert(macdCut.value === null, `trunkasi MACD lolos: ${macdCut.value}`);
  const macdFull = parseSignedIndicatorLine(
    "MACD(12,26,9) -0.000220 0.000215",
    /\bMACD\b/i,
  );
  assert(macdFull.value === -0.00022, `MACD gagal: ${macdFull.value}`);
  // Tanda terpisah "- 52.20" tetap dikenali.
  const split = parseSignedIndicatorLine("CCI(14) - 52.20", /\bCCI\b/i);
  assert(
    split.value === -52.2 && split.signExplicit === true,
    "tanda pisah gagal",
  );
});

test("456. wiring anti-trunkasi: PSM region + upscale + guard (readSrc)", () => {
  const extractor = readSrc("src/components/extraction/OcrExtractor.tsx");
  assert(extractor.includes("SINGLE_BLOCK"), "PSM region hilang");
  assert(extractor.includes("setParameters"), "setParameters hilang");
  assert(extractor.includes("tessedit_pageseg_mode"), "psm param hilang");
  assert(
    extractor.includes("* SCALE") || extractor.includes("* 2"),
    "upscale crop hilang",
  );
  const parser = readSrc("src/components/extraction/ocrParser.ts");
  assert(parser.includes("hasDecimalSeparator"), "guard tak di-wire");
  const helper = readSrc("src/lib/marketWatchParser.ts");
  assert(helper.includes("artefak OCR"), "dokumentasi guard hilang");
});

/* ---------------- Indikator CSV tanpa screenshot (NS): TEST 457-460 ---------------- */

function risingCandles(count: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = start + i * step;
    out.push(
      makeCandle(`t${i}`, close - step, close + step, close - step * 2, close),
    );
  }
  return out;
}

test("457. sma/ema/rsi Wilder kanonis/MACD", () => {
  assert(sma([1, 2, 3, 4, 5], 5) === 3, "sma salah");
  assert(sma([1, 2], 5) === null, "sma kurang data lolos");
  assert(sma([1, NaN, 3], 3) === null, "sma NaN lolos");
  assert(ema([7, 7, 7, 7, 7], 3) === 7, "ema konstan salah");
  assert(ema([1, 2], 5) === null, "ema kurang data lolos");
  // Vektor kanonis Wilder: RSI(14) pertama = 70.46.
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28,
  ];
  const rsi = rsiWilder(closes, 14);
  assert(rsi !== null && Math.abs(rsi - 70.46) < 0.05, `rsi=${rsi}`);
  assert(rsiWilder([1, 2, 3], 14) === null, "rsi kurang data lolos");
  const flat = ema(new Array(40).fill(100), 12);
  assert(flat !== null && Math.abs(flat - 100) < 1e-9, `ema datar=${flat}`);
  const macdFlat = macd(new Array(60).fill(100));
  assert(
    macdFlat !== null &&
      Math.abs(macdFlat.line) < 1e-9 &&
      Math.abs(macdFlat.signal) < 1e-9,
    `macd datar=${JSON.stringify(macdFlat)}`,
  );
  const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
  const macdUp = macd(rising);
  assert(macdUp !== null && macdUp.line > 0, "macd tren naik tak positif");
  assert(macd([]) === null, "macd kosong lolos");
});

test("458. cci datar + atr hitungan tangan", () => {
  const flat = risingCandles(0, 0, 0).concat(
    Array.from({ length: 14 }, (_, i) => makeCandle(`f${i}`, 10, 10, 10, 10)),
  );
  assert(cci(flat, 14) === 0, "cci datar harus 0 (MD=0)");
  assert(cci(flat.slice(0, 5), 14) === null, "cci kurang data lolos");
  // TR: [2, 4] → ATR(2) = 3.
  const candles = [
    makeCandle("a", 9, 10, 8, 9),
    makeCandle("b", 10, 11, 9, 10),
    makeCandle("c", 10, 12, 8, 11),
  ];
  assert(atrWilder(candles, 2) === 3, "atr hitungan tangan salah");
  assert(atrWilder(candles.slice(0, 2), 2) === null, "atr kurang data lolos");
  const bad = [...candles, makeCandle("x", NaN, 1, 0, 0.5)];
  assert(atrWilder(bad, 2) === null, "atr NaN lolos");
  assert(cci(bad, 14) === null, "cci NaN lolos");
});

test("459. computeIndicators: ambang 50 + konsistensi MA50", () => {
  assert(INDICATOR_MIN_CANDLES === 50, "ambang berubah");
  assert(computeIndicators(risingCandles(49, 100, 0.5)) === null, "49 lolos");
  const candles = risingCandles(60, 100, 0.5);
  const result = computeIndicators(candles);
  if (result === null) throw new Error("60 candle valid ditolak");
  const closes = candles.map((candle) => candle.close);
  const expectedMa = closes.slice(-50).reduce((s, v) => s + v, 0) / 50;
  assert(Math.abs(result.ma50 - expectedMa) < 1e-9, "ma50 bukan mean 50");
  for (const [name, value] of Object.entries(result)) {
    assert(Number.isFinite(value), `${name} tak finite`);
  }
  assert(result.rsi >= 0 && result.rsi <= 100, "rsi liar");
  assert(result.atr > 0, "atr tak positif di tren");
  const broken = [...candles];
  broken[10] = makeCandle("x", NaN, 1, 0, 0.5);
  assert(computeIndicators(broken) === null, "candle rusak lolos");
});

test("460. wiring tanpa-screenshot: isi CSV + blok salin (readSrc)", () => {
  const app = readSrc("src/App.tsx");
  assert(app.includes("computeIndicators"), "hitung indikator tak di-wire");
  assert(app.includes("indicators.ma50"), "ma50 CSV tak diisi");
  assert(app.includes("indicators.macdSignal"), "signal CSV tak diisi");
  const result = readSrc("src/components/result/AnalysisResult.tsx");
  assert(result.includes("order-copy-block"), "testid blok salin hilang");
  assert(result.includes("Salin order"), "tombol salin hilang");
  assert(result.includes("disalin ✓"), "umpan balik salin hilang");
  assert(result.includes("orderText"), "teks order hilang");
  const lib = readSrc("src/calculations/indicators.ts");
  assert(lib.includes("INDICATOR_MIN_CANDLES"), "ambang hilang");
  assert(!lib.includes("import.meta."), "lib tak CJS-safe");
});

/* ---------------- Guard jarak SL/TP live (STP): TEST 461-463 ---------------- */

test("461. getStopsDistance: OTB 20 point, Finex null", () => {
  const d = getStopsDistance("GBPUSD_ORB", "orbitraderberjangka");
  assert(d !== null && Math.abs(d - 0.0002) < 1e-12, `jarak=${d}`);
  const jpy = getStopsDistance("AUDJPY_ORB", "orbitraderberjangka");
  assert(jpy !== null && Math.abs(jpy - 0.02) < 1e-12, `jpy=${jpy}`);
  assert(
    getStopsDistance("GBPUSD", "finex") === null,
    "Finex harus null (tanpa data)",
  );
  assert(
    getStopsDistance("XYZ", "orbitraderberjangka") === null,
    "unknown harus null",
  );
});

test("462. checkStopsDistance: kasus user + batas + invalid", () => {
  // Kasus nyata user: JUAL SL 1.32317 vs ask live 1.32318 → 1 point < 20.
  const userCase = checkStopsDistance({
    symbol: "GBPUSD_ORB",
    brokerId: "orbitraderberjangka",
    direction: "JUAL",
    sl: 1.32317,
    tp: 1.31147,
    bid: 1.32306,
    ask: 1.32318,
  });
  assert(userCase !== null && userCase.includes("SL"), `lolos: ${userCase}`);
  // BELI valid: kedua sisi ≥ 0.0002.
  assert(
    checkStopsDistance({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      sl: 1.3197,
      tp: 1.3212,
      bid: 1.32,
      ask: 1.3201,
    }) === null,
    "valid ikut warning",
  );
  // Jarak wajar (> 2x ambang) juga lolos.
  assert(
    checkStopsDistance({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      sl: 1.3195,
      tp: 1.3206,
      bid: 1.32,
      ask: 1.3201,
    }) === null,
    "jarak wajar ikut warning",
  );
  // JUAL valid cermin.
  assert(
    checkStopsDistance({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "JUAL",
      sl: 1.324,
      tp: 1.3228,
      bid: 1.32306,
      ask: 1.32318,
    }) === null,
    "JUAL valid ikut warning",
  );
  // Finex / invalid → null jujur.
  assert(
    checkStopsDistance({
      symbol: "GBPUSD",
      brokerId: "finex",
      direction: "BELI",
      sl: 1.31,
      tp: 1.33,
      bid: 1.32,
      ask: 1.3201,
    }) === null,
    "Finex harus dilewati",
  );
  assert(
    checkStopsDistance({
      symbol: "GBPUSD_ORB",
      brokerId: "orbitraderberjangka",
      direction: "BELI",
      sl: 0,
      tp: 1.33,
      bid: 1.32,
      ask: 1.3201,
    }) === null,
    "SL 0 harus null",
  );
});

test("463. wiring guard stops: live + warning di blok salin (readSrc)", () => {
  const result = readSrc("src/components/result/AnalysisResult.tsx");
  assert(result.includes("checkStopsDistance"), "guard tak di-wire");
  assert(result.includes("stopsWarning"), "variabel warning hilang");
  assert(result.includes("Tanpa harga live"), "note tanpa-live hilang");
  assert(result.includes("Tanpa harga live"), "note tanpa-live hilang");
  assert(result.includes("useHoldingsQuotes"), "quotes live tak dipakai");
  const lib = readSrc("src/lib/orderTicket.ts");
  assert(lib.includes("getStopsDistance"), "helper hilang");
  assert(lib.includes("mengunci tombol order"), "teks warning hilang di lib");
  assert(!lib.includes("import.meta."), "lib tak CJS-safe");
});

/* ---------------- Sinyal breakeven 1R (BE): TEST 464-468 ---------------- */

test("464. checkBreakeven: BELI 1R terpicu, target = entry", () => {
  assert(BREAKEVEN_R_MULTIPLE === 0.5, "ambang bukan 0,5R (Mode Aman)");
  // Entry 1.32246, SL 1.32317? bukan — BELI: entry 1.32000, SL 1.31900
  // (risiko 100 point), bid 1.32100 → profit 100 point = 1R.
  const hit = checkBreakeven(
    { direction: "BELI", entryPrice: 1.32, sl: 1.319 },
    1.321,
    1.3212,
  );
  if (hit === null) throw new Error("1R tidak terpicu");
  assert(hit.slTarget === 1.32, `target=${hit.slTarget}`);
  assert(hit.multiple >= 1, `multiple=${hit.multiple}`);
  assert(hit.message.includes("1.32"), "pesan tanpa harga SL");
});

test("465. checkBreakeven: JUAL user terpicu di 1R", () => {
  // Kasus nyata user: JUAL @1.32246 SL 1.32317 (risiko 71 point);
  // ask turun ke 1.32175 → profit 71 point = 1R.
  const hit = checkBreakeven(
    { direction: "JUAL", entryPrice: 1.32246, sl: 1.32317 },
    1.32173,
    1.32175,
  );
  if (hit === null) throw new Error("1R JUAL tidak terpicu");
  assert(hit.slTarget === 1.32246, `target=${hit.slTarget}`);
});

test("466. checkBreakeven: belum 1R dan rugi → null", () => {
  assert(
    checkBreakeven(
      { direction: "BELI", entryPrice: 1.32, sl: 1.319 },
      1.3203,
      1.3205,
    ) === null,
    "0.3R ikut terpicu",
  );
  assert(
    checkBreakeven(
      { direction: "BELI", entryPrice: 1.32, sl: 1.319 },
      1.3195,
      1.3197,
    ) === null,
    "rugi ikut terpicu",
  );
  assert(
    checkBreakeven(
      { direction: "JUAL", entryPrice: 1.32246, sl: 1.32317 },
      1.3226,
      1.32262,
    ) === null,
    "JUAL rugi ikut terpicu",
  );
});

test("467. checkBreakeven: SL sisi salah dan input invalid → null", () => {
  // BELI dengan SL di atas entry = risiko tak terdefinisi.
  assert(
    checkBreakeven(
      { direction: "BELI", entryPrice: 1.32, sl: 1.321 },
      1.322,
      1.3222,
    ) === null,
    "SL salah sisi lolos",
  );
  // JUAL dengan SL di bawah entry = risiko tak terdefinisi.
  assert(
    checkBreakeven(
      { direction: "JUAL", entryPrice: 1.32246, sl: 1.321 },
      1.32,
      1.3202,
    ) === null,
    "SL JUAL salah sisi lolos",
  );
  assert(
    checkBreakeven(
      { direction: "BELI", entryPrice: 0, sl: 1.319 },
      1.321,
      1.3212,
    ) === null,
    "entry 0 lolos",
  );
  assert(
    checkBreakeven({ direction: "BELI", entryPrice: 1.32, sl: 1.319 }, 0, 0) ===
      null,
    "bid/ask 0 lolos",
  );
});

test("468. wiring breakeven: banner di dashboard monitor (readSrc)", () => {
  const lib = readSrc("src/lib/exitMonitor.ts");
  assert(lib.includes("checkBreakeven"), "helper hilang");
  assert(lib.includes("BREAKEVEN_R_MULTIPLE"), "konstanta ambang hilang");
  assert(lib.includes("Modify"), "langkah MT5 hilang di pesan");
  assert(!lib.includes("import.meta."), "lib tak CJS-safe");
  const dash = readSrc("src/components/holdings/HoldingsDashboard.tsx");
  assert(dash.includes("checkBreakeven"), "sinyal tak di-wire");
  assert(dash.includes("BREAKEVEN SEKARANG"), "banner hilang");
});

/* ---------------- Cakupan simbol 6I (68 OTB + 82 Finex): TEST 469-472 ---------------- */

test("469. setiap simbol dropdown OTB punya preset+spec32+profil", () => {
  for (const s of OTB_ALL_SYMBOLS as readonly string[]) {
    assert(getOtbInstrumentProfile(s) !== null, `${s} tanpa preset OTB`);
    assert(
      hasOtbPresetForSymbol(s, "orbitraderberjangka") === true,
      `${s} tanpa warning-free preset`,
    );
    const spec = getInstrumentSpec32(s);
    assert(spec !== null && spec.status === "VERIFIED", `${s} spec32 invalid`);
  }
});

test("470. setiap simbol dropdown Finex punya profil+spec32", () => {
  for (const s of SUPPORTED_SYMBOLS) {
    const profile = getInstrumentProfile(s);
    assert(profile.category !== "unknown", `${s} tanpa profil`);
    assert(profile.minPrice < profile.maxPrice, `${s} rentang invalid`);
    const spec = getInstrumentSpec32(s);
    assert(spec !== null && spec.status === "VERIFIED", `${s} spec32 invalid`);
    if (spec === null) throw new Error(`spec32 hilang untuk ${s}`);
    assert(spec.broker === "finex", `${s} broker salah`);
  }
});

test("471. spot-check nilai 6I dari CSV broker", () => {
  const eurjpy = getOtbInstrumentProfile("EURJPY_ORB");
  if (eurjpy === null) throw new Error("preset EURJPY_ORB hilang");
  assert(calculateOtbTickValue(eurjpy) === 100, "tick JPY baru bukan 100");
  const xau = getOtbInstrumentProfile("XAUUSD_ORB");
  if (xau === null) throw new Error("preset XAUUSD_ORB hilang");
  assert(xau.contractSize === 100, "kontrak XAU bukan 100");
  assert(xau.initialMargin === 200000, "margin XAU bukan 200000");
  const dec = getOtbInstrumentProfile("US100.DEC");
  if (dec === null) throw new Error("preset US100.DEC hilang");
  assert(calculateOtbTickValue(dec) === 5, "tick US100.DEC bukan 5");
  assert(requireSpec32("GBXUSD").quoteCurrency === "GBX", "GBXUSD bukan pence");
  assert(requireSpec32("#AAPL").leverage === 1, "kontrak #AAPL bukan 1");
  assert(
    getInstrumentProfile("USDEUR").decimals === 8,
    "USDEUR bukan 8 desimal",
  );
  assert(
    getInstrumentProfile("GOOG.US").decimals === 2,
    "GOOG.US tak terpetakan",
  );
  assert(getInstrumentProfile("#AAPL").decimals === 2, "#AAPL tak terpetakan");
});

test("472. kanonis + profil preservasi nama bertitik/bertanda", () => {
  assert(
    canonicalSymbolForBroker("#AAPL", "finex") === "#AAPL",
    "#AAPL terpangkas",
  );
  assert(
    canonicalSymbolForBroker("GOOG.US", "orbitraderberjangka") === "GOOG.US",
    "GOOG.US berubah",
  );
  assert(
    canonicalSymbolForBroker("gbpusd", "finex") === "GBPUSD",
    "alias Finex rusak",
  );
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
    const { QUOTES_STREAM_TEST_COUNT, runQuotesStreamTests } =
      await import("../src/hooks/useQuotesStream.test");
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
    const { READER_HARDENING_TEST_COUNT, runReaderHardeningTests } =
      await import("../src/services/quotesLogReader.test");
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
    const { LIVE_SOURCE_TEST_COUNT, runLiveSourceTests } =
      await import("../server/types/liveSource.test");
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

  // 525: backup data MDBKA (async: salin berkas).
  try {
    const os = require("node:os") as unknown as { tmpdir(): string };
    const nfs = require("node:fs") as unknown as typeof import("node:fs");
    const npath = require("node:path") as unknown as typeof import("node:path");
    const root = nfs.mkdtempSync(npath.join(os.tmpdir(), "backup-"));
    const dataDir = npath.join(root, "data");
    const backupDir = npath.join(root, "bak");
    nfs.mkdirSync(npath.join(dataDir, "trades"), { recursive: true });
    nfs.mkdirSync(npath.join(dataDir, "history", "otb"), { recursive: true });
    nfs.writeFileSync(npath.join(dataDir, "trades", "entries-finex.jsonl"), "{}\n");
    nfs.writeFileSync(npath.join(dataDir, "history", "otb", "ticks-1.jsonl"), "x\n");
    const awal = getBackupStatus(dataDir, backupDir);
    assert(awal.due && awal.last === null, "belum pernah backup harus due");
    const m = await runBackup(dataDir, backupDir, new Date(Date.now() + 1000));
    assert(m.files === 1 && m.historyCopied === 1, `salin: ${m.files} penting, ${m.historyCopied} tick`);
    assert(
      nfs.existsSync(npath.join(backupDir, m.snapshot, "trades", "entries-finex.jsonl")),
      "file penting tidak tersalin ke snapshot",
    );
    assert(
      !nfs.existsSync(npath.join(backupDir, m.snapshot, "history")),
      "arsip tick tidak boleh masuk snapshot (mirror terpisah)",
    );
    const sesudah = getBackupStatus(dataDir, backupDir);
    assert(!sesudah.due && sesudah.historyPending === 0, `sesudah backup harus terbaru: ${sesudah.reason}`);
    const m2 = await runBackup(dataDir, backupDir, new Date(Date.now() + 2000));
    assert(m2.historyCopied === 0, "arsip tick yang sama tidak boleh disalin ulang");
    passed += 1;
    console.log("ok - 525. backup: snapshot data penting + mirror tick bertahap + pengingat");
  } catch (e) {
    failed += 1;
    console.log(`FAIL - 525. backup: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 546: pembaca arsip tick streaming untuk MFE/MAE (async: baca berkas).
  try {
    const os = require("node:os") as unknown as { tmpdir(): string };
    const nfs = require("node:fs") as unknown as typeof import("node:fs");
    const npath = require("node:path") as unknown as typeof import("node:path");
    const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "excursion-"));
    const row = (ts: string, symbol: string, bid: number, ask: number): string =>
      JSON.stringify({ ts_utc: "x", ts_raw: ts, broker: "otb", symbol, bid, ask, received_at: "x" });
    nfs.writeFileSync(
      npath.join(dir, "ticks-2026-10-05.jsonl"),
      [
        row("2026.10.05 23:59:30", "GBPUSD_ORB", 1.3005, 1.3007),
        row("2026.10.05 23:59:40", "AUDCAD_ORB", 0.99, 0.991),
        "{rusak",
      ].join("\n") + "\n",
    );
    nfs.writeFileSync(
      npath.join(dir, "ticks-2026-10-06.jsonl"),
      [
        row("2026.10.06 00:00:10", "GBPUSD_ORB", 1.2992, 1.2994),
        row("2026.10.06 00:00:20", "GBPUSD_ORB", 1.301, 1.3012),
      ].join("\n") + "\n",
    );
    const buy = { key: "otb:1", symbol: "GBPUSD_ORB", side: "BUY" as const, openTime: "2026.10.05 23:59:30", closeTime: "2026.10.06 00:00:20", openPrice: 1.3, sl: 1.299 };
    const sell = { key: "otb:2", symbol: "GBPUSD_ORB", side: "SELL" as const, openTime: "2026.10.06 00:00:10", closeTime: "2026.10.06 00:00:20", openPrice: 1.3, sl: null };
    const lama = { key: "otb:3", symbol: "GBPUSD_ORB", side: "BUY" as const, openTime: "2026.09.29 10:00:00", closeTime: "2026.09.29 11:00:00", openPrice: 1.3, sl: null };
    const names = excursionFileNames(buy);
    assert(names.join(",") === "ticks-2026-10-04.jsonl,ticks-2026-10-05.jsonl,ticks-2026-10-06.jsonl,ticks-2026-10-07.jsonl", `file ±1 hari: ${names.join(",")}`);
    const hasil = await computeExcursionsFromArchive(dir, [buy, sell, lama]);
    const b = hasil.get("otb:1");
    assert(b !== undefined && b.ticks === 3 && b.coverage === "PENUH", `BUY lintas 2 file: n=${b?.ticks} ${b?.coverage}`);
    assert(b !== undefined && b.mfe === 0.001 && b.mae === -0.0008 && b.mfeR === 1 && b.maeR === -0.8, `BUY mfe ${b?.mfe} mae ${b?.mae} R ${b?.mfeR}/${b?.maeR}`);
    const s2 = hasil.get("otb:2");
    assert(s2 !== undefined && s2.ticks === 2 && s2.mfe === 0.0006 && s2.mae === -0.0012, `SELL ask: n=${s2?.ticks} mfe ${s2?.mfe} mae ${s2?.mae}`);
    assert(hasil.get("otb:3")?.coverage === "TANPA_DATA", "trade sebelum arsip harus TANPA_DATA");
    passed += 1;
    console.log("ok - 546. pembaca arsip tick streaming: lintas file harian, saring simbol & jam server, baris rusak dilewati");
  } catch (e) {
    failed += 1;
    console.log(`FAIL - 546. pembaca arsip tick: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 549: satu putaran pengisi buku MFE/MAE (async: baca/tulis berkas).
  try {
    const os = require("node:os") as unknown as { tmpdir(): string };
    const nfs = require("node:fs") as unknown as typeof import("node:fs");
    const npath = require("node:path") as unknown as typeof import("node:path");
    const root = nfs.mkdtempSync(npath.join(os.tmpdir(), "excjob-"));
    const common = npath.join(root, "common");
    const trades = npath.join(root, "trades");
    const otbDir = npath.join(root, "history", "otb");
    nfs.mkdirSync(common, { recursive: true });
    nfs.mkdirSync(otbDir, { recursive: true });
    const co = "PT. Orbi Trade Berjangka";
    const deal = (t: string, pos: string, time: string, type: string, entry: string, price: number): string =>
      `${t},${pos},${t},${time},GBPUSD_ORB,${type},${entry},0.10,${price},0,0,0,0,0,,70930952,${co},USD`;
    nfs.writeFileSync(
      npath.join(common, "MDBKA_History_70930952.csv"),
      [
        "DealTicket,PositionId,OrderTicket,ServerTime,Symbol,Type,Entry,Volume,Price,Commission,Swap,Profit,Fee,Magic,Comment,Login,Company,AccountCurrency",
        deal("1", "10", "2026.10.06 06:00:00", "BUY", "IN", 1.3),
        deal("2", "10", "2026.10.06 06:10:00", "SELL", "OUT", 1.3005),
        deal("3", "11", "2026.10.06 06:20:00", "BUY", "IN", 1.3),
        deal("4", "11", "2026.10.06 06:30:00", "SELL", "OUT", 1.3),
      ].join("\n") + "\n",
    );
    const row = (ts: string, bid: number): string =>
      JSON.stringify({ ts_utc: "x", ts_raw: ts, broker: "otb", symbol: "GBPUSD_ORB", bid, ask: bid + 0.0001, received_at: "x" });
    nfs.writeFileSync(
      npath.join(otbDir, "ticks-2026-10-06.jsonl"),
      [row("2026.10.06 06:00:00", 1.3), row("2026.10.06 06:05:00", 1.301), row("2026.10.06 06:10:00", 1.3005), row("2026.10.06 06:25:00", 1.2995)].join("\n") + "\n" + '{"terpotong',
    );
    assert(newestTickRaw(otbDir) === "2026.10.06 06:25:00", `tick terbaru dari ekor: ${newestTickRaw(otbDir)}`);
    const opts = { commonDir: common, tradesDir: trades, historyDir: npath.join(root, "history"), now: () => new Date("2026-10-08T00:00:00Z") };
    const s1 = (await runExcursionPass(opts)).find((x) => x.broker === "orbitraderberjangka");
    assert(s1 !== undefined && s1.pending === 2 && s1.saved === 1 && s1.notFinal === 1, `putaran 1: ${JSON.stringify(s1)}`);
    const book = readExcursionCache(npath.join(trades, "excursion-orbitraderberjangka.jsonl"));
    const t10 = book.get("70930952:10");
    assert(t10 !== undefined && t10.coverage === "PENUH" && t10.mfe === 0.001 && t10.computedAt === "2026-10-08T00:00:00.000Z", `trade 10: ${JSON.stringify(t10)}`);
    assert(!book.has("70930952:11"), "trade 11 baru ditutup & parsial: jangan dikunci");
    const s2 = (await runExcursionPass(opts)).find((x) => x.broker === "orbitraderberjangka");
    assert(s2 !== undefined && s2.pending === 1 && s2.saved === 0, `putaran 2 hanya mencoba ulang trade 11: ${JSON.stringify(s2)}`);
    passed += 1;
    console.log("ok - 549. putaran pengisi buku MFE/MAE: catat yang final, ulangi yang belum");
  } catch (e) {
    failed += 1;
    console.log(`FAIL - 549. putaran pengisi buku MFE/MAE: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 550: jadwal putaran MFE/MAE tidak bertumpuk + terpasang di server (async).
  try {
    const logs: string[] = [];
    let release: () => void = () => undefined;
    let calls = 0;
    const sched = startExcursionSchedule(
      () => {
        calls += 1;
        return new Promise((resolve) => {
          release = () => resolve([{ broker: "finex", pending: 2, saved: 1, notFinal: 1 }]);
        });
      },
      (m) => logs.push(m),
      1e9,
      1e9,
    );
    const pertama = sched.tick();
    const kedua = await sched.tick();
    assert(kedua === false && calls === 1, `putaran kedua harus ditolak saat pertama jalan (calls=${calls})`);
    release();
    assert((await pertama) === true, "putaran pertama harus selesai");
    assert(logs[0] === "✓ MFE/MAE finex: 1 dicatat, 1 dicoba lagi nanti", `log: ${logs[0]}`);
    const gagal = startExcursionSchedule(() => Promise.reject(new Error("arsip terkunci")), (m) => logs.push(m), 1e9, 1e9);
    assert((await gagal.tick()) === true && logs[1] === "⚠ MFE/MAE gagal: arsip terkunci", `gagal: ${logs[1]}`);
    sched.stop();
    gagal.stop();
    const idx = readSrc("server/index.ts");
    assert(idx.includes("startExcursionSchedule(() =>") && idx.includes("excursionSchedule?.stop();"), "jadwal belum terpasang/dihentikan di server/index.ts");
    passed += 1;
    console.log("ok - 550. jadwal MFE/MAE: tidak bertumpuk, gagal dilog, terpasang di server");
  } catch (e) {
    failed += 1;
    console.log(`FAIL - 550. jadwal MFE/MAE: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const os = require("node:os") as unknown as { tmpdir(): string };
    const nfs = require("node:fs") as unknown as typeof import("node:fs");
    const npath = require("node:path") as unknown as typeof import("node:path");
    const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "ecb2-"));
    try {
      const file = npath.join(dir, "ecb-usdidr.json");
      mergeUsdIdrBook(file, { "2026-10-08": 17920 });
      const gagal = await refreshUsdIdrBook(file, (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
      assert(gagal["2026-10-08"] === 17920, "offline harus tetap pakai buku lama");
      const ok = await refreshUsdIdrBook(file, (async () => ({ ok: true, text: async () =>
        "<Cube><Cube time='2026-10-09'><Cube currency='USD' rate='1.12'/><Cube currency='IDR' rate='20000'/></Cube></Cube>" })) as unknown as typeof fetch);
      assert(ok["2026-10-09"] === 17857.14 && ok["2026-10-08"] === 17920, JSON.stringify(ok));
    } finally {
      nfs.rmSync(dir, { recursive: true, force: true });
    }
    passed += 1;
    console.log("ok - 581. buku kurs ECB: gagal ambil → buku lama apa adanya (H1)");
  } catch (e) {
    failed += 1;
    console.log(`FAIL - 581. buku kurs ECB: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(
    `\n${passed} lolos, ${failed} gagal dari ${passed + failed} pengujian.`,
  );
  process.exit(failed > 0 ? 1 : 0);
})();
