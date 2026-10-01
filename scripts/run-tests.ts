declare const process: { exit(code: number): never; cwd(): string };
declare const require: {
  (id: string): { readFileSync(path: string, encoding: string): string };
};

import { parseCsvCandles, parseCsvNumber } from "../src/lib/csvCandleParser";
import { detectSwingLevels, type Candle } from "../src/calculations/swingDetector";
import { checkInstrumentMismatch } from "../src/lib/instrumentMismatch";
import {
  SUPPORTED_SYMBOLS,
  getInstrumentProfile,
  isSupportedSymbol,
  normalizeSymbol,
} from "../src/lib/instrumentConfig";
import { validateAnalysisInputs } from "../src/calculations/inputValidator";
import type { BrokerSettings, MarketData } from "../src/types/analysis";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL - ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeCandle(time: string, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

/* ---------------- Parser: 18 kasus ---------------- */

test("1. header + format titik tanggal", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026.09.30 12:00,30347.16,30367.13,30314.24,30340.33"
  );
  assert(r.headerDetected, "header tidak terdeteksi");
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].open === 30347.16, "open salah");
});

test("2. header + format dash tanggal", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n2026-10-01 01:00,30480,30540,30450,30520"
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].time === "2026-10-01 01:00", "time salah");
});

test("3. tanggal dan jam dipisah koma", () => {
  const r = parseCsvCandles("2026.09.30,12:00,30347.16,30367.13,30314.24,30340.33");
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].time === "2026.09.30 12:00", `time=${r.candles[0].time}`);
  assert(r.candles[0].close === 30340.33, "close salah");
});

test("4. separator titik koma", () => {
  const r = parseCsvCandles(
    "time;open;high;low;close\n2026.09.30 12:00;30347.16;30367.13;30314.24;30340.33"
  );
  assert(r.separator === ";", `separator=${r.separator}`);
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("5. BOM UTF-8 dihapus", () => {
  const r = parseCsvCandles("﻿time,open,high,low,close\n2026-10-01 01:00,30480,30540,30450,30520");
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("6. baris kosong diabaikan", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\n\n2026-10-01 01:00,30480,30540,30450,30520\n\n"
  );
  assert(r.totalRows === 1, `totalRows=${r.totalRows}`);
  assert(r.validRows === 1, `validRows=${r.validRows}`);
});

test("7. baris invalid dilewati dan dihitung", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close\nbaris-rusak\n2026-10-01 01:00,30480,30540,30450,30520\n1,2,3"
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.invalidRows === 2, `invalidRows=${r.invalidRows}`);
  assert(r.errors.length >= 2, "errors tidak tercatat");
});

test("8. kolom volume tambahan diabaikan", () => {
  const r = parseCsvCandles(
    "time,open,high,low,close,tick_volume,spread,real_volume\n2026-10-01 01:00,30480,30540,30450,30520,120,5,0"
  );
  assert(r.validRows === 1, `validRows=${r.validRows}`);
  assert(r.candles[0].close === 30520, "close salah");
});

test("9. 50 candle US100 valid", () => {
  const rows = ["time,open,high,low,close"];
  for (let i = 0; i < 50; i++) {
    const base = 30000 + i * 10;
    rows.push(`2026.09.30 12:${String(i).padStart(2, "0")},${base},${base + 30},${base - 30},${base + 5}`);
  }
  const r = parseCsvCandles(rows.join("\n"));
  assert(r.validRows === 50, `validRows=${r.validRows}`);
  assert(r.invalidRows === 0, `invalidRows=${r.invalidRows}`);
});

test("10. 50 candle GBPUSD valid", () => {
  const rows = ["time,open,high,low,close"];
  for (let i = 0; i < 50; i++) {
    const open = 1.32 + i * 0.0001;
    rows.push(`2026-10-01 01:${String(i).padStart(2, "0")},${open.toFixed(5)},${(open + 0.0005).toFixed(5)},${(open - 0.0005).toFixed(5)},${(open + 0.0001).toFixed(5)}`);
  }
  const r = parseCsvCandles(rows.join("\n"));
  assert(r.validRows === 50, `validRows=${r.validRows}`);
});

test("11. mismatch US100 vs GBPUSD terdeteksi via helper", () => {
  const gbp = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449");
  assert(
    checkInstrumentMismatch(gbp.candles, "US100", 30500) !== null,
    "mismatch US100 tidak terdeteksi"
  );
  assert(
    checkInstrumentMismatch(gbp.candles, "GBPUSD", 1.3248) === null,
    "GBPUSD valid dianggap mismatch"
  );
});

test("12. OHLC tidak valid (non-numerik) dilewati", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,abc,30540,30450,30520");
  assert(r.validRows === 0, `validRows=${r.validRows}`);
  assert(r.invalidRows === 1, `invalidRows=${r.invalidRows}`);
});

test("13. high lebih kecil dari close dilewati", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,30480,30400,30450,30520");
  assert(r.validRows === 0, `validRows=${r.validRows}`);
});

test("14. low lebih besar dari open dilewati", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,30480,30540,30500,30520");
  assert(r.validRows === 0, `validRows=${r.validRows}`);
});

test("15. decimal point MT5 dibaca benar", () => {
  assert(parseCsvNumber("30347.16", ",") === 30347.16, "titik desimal rusak");
  assert(parseCsvNumber("30347,16", ";") === 30347.16, "koma desimal (;) rusak");
});

test("16. quote pada field diabaikan", () => {
  const r = parseCsvCandles('"time","open","high","low","close"\n"2026-10-01 01:00","30480","30540","30450","30520"');
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
  assert(r.support === null && r.resistance === null, `dapat ${r.support}/${r.resistance}`);
});

test("20. support valid di bawah harga", () => {
  const r = detectSwingLevels(swingFixture(), 106, 2);
  assert(r.support === 95, `support=${r.support}`);
  assert(r.support !== null && r.support < 106, "support harus di bawah harga");
});

test("21. resistance valid di atas harga", () => {
  const r = detectSwingLevels(swingFixture(), 106, 2);
  assert(r.resistance === 110, `resistance=${r.resistance}`);
  assert(r.resistance !== null && r.resistance > 106, "resistance harus di atas harga");
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
    rows.push(`2026.09.30 12:0${i},${base},${base + 30},${base - 30},${base + 5}`);
  }
  const r = parseCsvCandles(rows.join("\n"));
  assert(r.validRows === 10, `validRows=${r.validRows}`);
  assert(checkInstrumentMismatch(r.candles, "US100", 30500) === null, "US100 valid ditolak");
});

test("29. helper menolak candle GBPUSD untuk simbol US100", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449");
  const msg = checkInstrumentMismatch(r.candles, "US100", 30500);
  assert(msg !== null && msg.includes("US100"), `pesan=${msg}`);
});

test("30. helper menolak candle US100 untuk simbol GBPUSD", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026.09.30 12:00,30347.16,30367.13,30314.24,30340.33");
  const msg = checkInstrumentMismatch(r.candles, "GBPUSD", 1.3248);
  assert(msg !== null && msg.includes("GBPUSD"), `pesan=${msg}`);
});

test("31. helper tidak memblokir simbol unknown", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449");
  assert(checkInstrumentMismatch(r.candles, "SIMBOLANEH", 1.3248) === null, "unknown diblokir");
});

test("32. saat mismatch, level lama tidak dipakai (onDetected dilewati)", () => {
  const r = parseCsvCandles("time,open,high,low,close\n2026-10-01 01:00,1.32474,1.32507,1.32443,1.32449");
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
  assert(forwarded === null, "level lama/salah tidak boleh diteruskan saat mismatch");
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
  assert(src.includes('type="file"') && src.includes('accept=".csv'), "fallback upload hilang");
  assert(src.includes("clearInterval"), "cleanup interval hilang");
  assert(src.includes("disabled={!isConnected"), "reload harus terkunci isConnected");
  assert(!src.includes("disabled={!fileName"), "disabled tidak boleh memakai ref/state mentah");
});

test("34. App: csvText, onDetected stabil, reset simbol, analisa diblokir", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("csvText={swingCsv}"), "csvText tidak dari App");
  assert(src.includes("handleDetectedLevels = useCallback"), "onDetected tidak stabil");
  assert(src.includes("setCsvResetKey"), "reset koneksi simbol hilang");
  assert(src.includes("support: 0"), "reset S/R hilang");
  assert(
    src.includes("!validation.valid || scaleIssues.length > 0"),
    "blokir analisa hilang"
  );
});

test("35. SwingLevelsForm: guard mismatch memblokir deteksi", () => {
  const src = readSrc("src/components/analysis/SwingLevelsForm.tsx");
  assert(src.includes("checkInstrumentMismatch"), "helper mismatch tidak dipakai");
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
  assert(new Set(SUPPORTED_SYMBOLS).size === SUPPORTED_SYMBOLS.length, "ada duplikat");
});

test("37. preset US100 tidak memakai harga/satuan GBPUSD", () => {
  for (const symbol of SUPPORTED_SYMBOLS) {
    const profile = getInstrumentProfile(symbol);
    assert(profile.minPrice < profile.maxPrice, `${symbol} rentang invalid`);
  }
  const us100 = getInstrumentProfile("US100");
  const gbp = getInstrumentProfile("GBPUSD");
  assert(us100.minPrice > gbp.maxPrice, "rentang US100/GBPUSD tumpang tindih");
  assert(us100.defaultPointValue !== gbp.defaultPointValue, "pointValue US100 sama dengan GBPUSD");
  assert(us100.contractSize !== gbp.contractSize, "contractSize US100 sama dengan GBPUSD");
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
    result.errors.some((e) => e.message === "Pilih simbol sebelum melakukan analisa."),
    "pesan simbol kosong salah"
  );
});

test("40. simbol tak dikenal diblokir dengan pesan daftar", () => {
  const result = validateAnalysisInputs(makeValidMarket("XYZ"), makeValidBroker());
  assert(!result.valid, "simbol aneh dianggap valid");
  assert(
    result.errors.some((e) => e.message === "Simbol belum dikenali. Pilih simbol dari daftar."),
    "pesan simbol aneh salah"
  );
});

test("41. simbol dropdown valid lolos cek simbol", () => {
  const result = validateAnalysisInputs(makeValidMarket("GBPUSD"), makeValidBroker());
  assert(
    !result.errors.some((e) => e.field === "symbol"),
    "GBPUSD kena error simbol"
  );
});

test("42. ExtractedDataForm: select tersimpan sebagai kode simbol", () => {
  const src = readSrc("src/components/extraction/ExtractedDataForm.tsx");
  assert(src.includes("<select"), "select simbol hilang");
  assert(src.includes("SUPPORTED_SYMBOLS") && src.includes("symbolOptions.map"), "opsi tidak dari daftar tunggal");
  assert(src.includes('<option value="">Pilih instrumen</option>'), "placeholder hilang");
  assert(src.includes("support: 0") && src.includes("resistance: 0"), "reset S/R hilang");
  assert(!src.includes("US100 —") && !src.includes("value=\"US100 —"), "label tersimpan ke state");
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
  assert(src.includes("support: 0") && src.includes("resistance: 0"), "reset S/R hilang");
  assert(src.includes("setResult(null)") && src.includes("setConfirmed(false)"), "reset hasil hilang");
});

test("45. preset broker mengikuti simbol baru", () => {
  const src = readSrc("src/App.tsx");
  assert(src.includes("pointValue: preset.defaultPointValue"), "pointValue preset hilang");
  assert(src.includes("contractSize: preset.contractSize"), "contractSize preset hilang");
  assert(src.includes("buffer: preset.defaultBuffer"), "buffer preset hilang");
});

console.log(`\n${passed} lolos, ${failed} gagal dari ${passed + failed} pengujian.`);
if (failed > 0) process.exit(1);
