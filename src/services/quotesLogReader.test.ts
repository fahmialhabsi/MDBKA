import { QuotesLogReader } from "../../server/services/quotesLogReader";
import { MT5LogReader } from "../../server/services/mt5LogReader";
import fs from "fs";
import path from "path";
import os from "os";

const testDir = path.join(os.tmpdir(), "quotes-test");
const testFilePath = path.join(testDir, "test-quotes.csv");

function createTestFile(rows: string[]): void {
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  const content = rows.join("\n");
  fs.writeFileSync(testFilePath, content, "utf-8");
}

const testEquityPath = path.join(testDir, "test-equity.csv");

function cleanup(): void {
  for (const file of [testFilePath, testEquityPath]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // Abaikan: file mungkin terkunci sesaat oleh watcher yang terlambat.
    }
  }
  try {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  } catch {
    // Abaikan: direktori sementara OS, bukan artefak repo.
  }
}

export async function runQuotesLogReaderTests(): Promise<boolean> {
  let passCount = 0;
  let testNum = 310;

  // Test 1
  try {
    cleanup();
    createTestFile(["Timestamp,Symbol,Bid,Ask"]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const pass = reader.getSymbols().length === 0;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader init file kosong`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. QuotesLogReader init file kosong`);
  }

  // Test 2
  try {
    cleanup();
    createTestFile([
      "Timestamp,Symbol,Bid,Ask",
      "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
      "2026.10.02 14:45:06,AUDCAD_ORB,0.98962,0.98983",
    ]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const quotes = reader.getLatestBySymbol("AUDCAD_ORB", 10);
    const pass =
      quotes.length === 2 &&
      quotes[0].bid === 0.98964 &&
      quotes[0].ask === 0.98986;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader parse CSV Bid/Ask`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. QuotesLogReader parse CSV Bid/Ask`);
  }

  // Test 3
  try {
    cleanup();
    createTestFile([
      "Timestamp,Symbol,Bid,Ask",
      "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
      "2026.10.02 14:45:06,AUDCAD_ORB,0.98962,0.98983",
      "2026.10.02 14:45:07,AUDCAD_ORB,0.98960,0.98982",
    ]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const quotes = reader.getLatestBySymbol("AUDCAD_ORB", 1);
    const pass = quotes.length === 1 && quotes[0].bid === 0.9896;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader limit=1 latest only`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. QuotesLogReader limit=1 latest only`);
  }

  // Test 4
  try {
    cleanup();
    createTestFile([
      "Timestamp,Symbol,Bid,Ask",
      "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
      "2026.10.02 14:45:06,GBPUSD_ORB,1.27150,1.27160",
      "2026.10.02 14:45:07,AUDCAD_ORB,0.98960,0.98982",
    ]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const audcad = reader.getLatestBySymbol("AUDCAD_ORB", 10);
    const gbpusd = reader.getLatestBySymbol("GBPUSD_ORB", 10);
    const pass = audcad.length === 2 && gbpusd.length === 1;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader filter by symbol`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. QuotesLogReader filter by symbol`);
  }

  // Test 5
  try {
    cleanup();
    createTestFile([
      "Timestamp,Symbol,Bid,Ask",
      "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
      "2026.10.02 14:45:06,GBPUSD_ORB,1.27150,1.27160",
      "2026.10.02 14:45:07,AUDCAD_ORB,0.98960,0.98982",
    ]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const symbols = reader.getSymbols().sort();
    const pass =
      symbols.length === 2 &&
      symbols[0] === "AUDCAD_ORB" &&
      symbols[1] === "GBPUSD_ORB";
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader getSymbols unique`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. QuotesLogReader getSymbols unique`);
  }

  // Test 6
  try {
    cleanup();
    createTestFile([
      "Timestamp,Symbol,Bid,Ask",
      "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
      "2026.10.02 14:45:10,AUDCAD_ORB,0.98962,0.98983",
      "2026.10.02 14:45:20,AUDCAD_ORB,0.98960,0.98982",
    ]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const quotes = reader.getBySymbolAndTimeRange(
      "AUDCAD_ORB",
      "2026.10.02 14:45:05",
      "2026.10.02 14:45:15",
    );
    const pass = quotes.length === 2;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader getBySymbolAndTimeRange`,
    );
    reader.destroy();
  } catch {
    console.log(
      `not ok - ${testNum++}. QuotesLogReader getBySymbolAndTimeRange`,
    );
  }

  // Test 7
  try {
    cleanup();
    createTestFile(["Timestamp,Symbol,Bid,Ask"]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    reader.destroy();
    const pass =
      (reader as unknown as Record<string, unknown>).watcher === null &&
      (
        (reader as unknown as Record<string, unknown>)
          .updateCallbacks as unknown[]
      ).length === 0;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader destroy cleanup`,
    );
  } catch {
    console.log(`not ok - ${testNum++}. QuotesLogReader destroy cleanup`);
  }

  // Test 8
  try {
    cleanup();
    createTestFile([
      "Timestamp,Symbol,Bid,Ask",
      "invalid row",
      "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
      "junk",
    ]);
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const quotes = reader.getLatestBySymbol("AUDCAD_ORB", 10);
    const pass = quotes.length === 1;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. QuotesLogReader invalid CSV skip`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum}. QuotesLogReader invalid CSV skip`);
  }

  cleanup();
  return passCount === 8;
}

/**
 * Tahap 5E-3G — hardening akses file MT5 (6 test runtime: 339-344).
 * Menguji validasi ketat, snapshot consistency, no-clobber cache,
 * status jujur, isolasi exact Finex/OTB, dan fallback CSV equity.
 * Dijalankan lewat runner async utama (lihat scripts/run-tests.ts).
 */
export const READER_HARDENING_TEST_COUNT = 6;

export async function runReaderHardeningTests(): Promise<boolean> {
  let passCount = 0;
  let testNum = 339;

  function writeRaw(content: string): void {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFilePath, content, "utf-8");
  }

  // 339: baris bid/ask invalid (NaN, nol, ask<=bid, non-numerik) ditolak;
  // hanya baris valid masuk cache; status valid_snapshot.
  try {
    cleanup();
    writeRaw(
      [
        "Timestamp,Symbol,Bid,Ask",
        "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
        "2026.10.02 14:45:06,AUDCAD_ORB,abc,0.98986",
        "2026.10.02 14:45:07,AUDCAD_ORB,0,0.98986",
        "2026.10.02 14:45:08,AUDCAD_ORB,0.98986,0.98964",
        "2026.10.02 14:45:09,AUDCAD_ORB,,",
      ].join("\n"),
    );
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const quotes = reader.getLatestBySymbol("AUDCAD_ORB", 10);
    const pass =
      quotes.length === 1 &&
      quotes[0].bid === 0.98964 &&
      reader.getLastStatus() === "valid_snapshot";
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. Reader menolak bid/ask invalid tanpa polusi cache`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. Reader menolak bid/ask invalid`);
  }

  // 340: snapshot kosong tidak menimpa cache valid (no-clobber).
  try {
    cleanup();
    writeRaw(
      [
        "Timestamp,Symbol,Bid,Ask",
        "2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986",
        "2026.10.02 14:45:06,AUDCAD_ORB,0.98962,0.98983",
      ].join("\n"),
    );
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    writeRaw(["Timestamp,Symbol,Bid,Ask"].join("\n"));
    await reader.refresh();
    const quotes = reader.getLatestBySymbol("AUDCAD_ORB", 10);
    const pass =
      quotes.length === 2 && reader.getLastStatus() === "file_empty";
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. Snapshot kosong tidak menimpa cache valid`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. Snapshot kosong tidak menimpa cache`);
  }

  // 341: file seluruhnya malformed → cache kosong + status malformed_csv;
  // BOM dan CRLF Windows tetap terparse bila baris valid.
  try {
    cleanup();
    writeRaw(["Timestamp,Symbol,Bid,Ask", "sampah", "1,2"].join("\n"));
    const bad = new QuotesLogReader(testFilePath);
    await bad.init();
    const badPass =
      bad.getLatestBySymbol("AUDCAD_ORB", 10).length === 0 &&
      bad.getLastStatus() === "malformed_csv";
    bad.destroy();
    cleanup();
    writeRaw(
      "\uFEFFTimestamp,Symbol,Bid,Ask\r\n2026.10.02 14:45:05,AUDCAD_ORB,0.98964,0.98986\r\n",
    );
    const bom = new QuotesLogReader(testFilePath);
    await bom.init();
    const bomQuotes = bom.getLatestBySymbol("AUDCAD_ORB", 10);
    const bomPass =
      bomQuotes.length === 1 &&
      bomQuotes[0].ask === 0.98986 &&
      bom.getLastStatus() === "valid_snapshot";
    bom.destroy();
    const pass = badPass && bomPass;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. Malformed ditolak; BOM+CRLF terparse`,
    );
  } catch {
    console.log(`not ok - ${testNum++}. Malformed/BOM/CRLF`);
  }

  // 342: isolasi exact di level reader — GBPUSD tidak cocok GBPUSD_ORB.
  try {
    cleanup();
    writeRaw(
      [
        "Timestamp,Symbol,Bid,Ask",
        "2026.10.02 14:45:05,GBPUSD,1.27150,1.27160",
        "2026.10.02 14:45:06,GBPUSD_ORB,1.27155,1.27165",
      ].join("\n"),
    );
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const finex = reader.getLatestBySymbol("GBPUSD", 10);
    const otb = reader.getLatestBySymbol("GBPUSD_ORB", 10);
    const symbols = reader.getSymbols().sort();
    const pass =
      finex.length === 1 &&
      otb.length === 1 &&
      finex[0].bid === 1.2715 &&
      otb[0].bid === 1.27155 &&
      symbols.length === 2;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. Reader isolasi exact Finex vs _ORB`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum++}. Reader isolasi exact`);
  }

  // 343: fallback CSV equity — baris terakhir valid menang; header dan
  // baris rusak dilewati; MT5LogReader end-to-end via refresh().
  try {
    const { parseEquityCsvText } = await import(
      "../../server/services/mt5LogReader"
    );
    const parsed = parseEquityCsvText(
      "Timestamp,Balance,Equity,Profit,TradeCount\n" +
        "2026.10.03 08:00,1000.50,1050.75,50.25,2\n" +
        "baris-rusak\n" +
        "2026.10.03 09:00,1000.50,1060.00,,3\n",
    );
    const unitPass =
      parsed !== null &&
      parsed.balance === 1000.5 &&
      parsed.equity === 1060 &&
      parsed.profit === 59.5 &&
      parsed.tradeCount === 3;
    const nonePass =
      parseEquityCsvText("Timestamp,Balance,Equity\nhello\n") === null;
    cleanup();
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      testEquityPath,
      "Timestamp,Balance,Equity,Profit,TradeCount\n2026.10.03 09:00,1000.50,1060.00,,3\n",
      "utf-8",
    );
    const reader = new MT5LogReader(testEquityPath);
    const snap = reader.refresh();
    const e2ePass =
      snap !== null && snap.equity === 1060 && snap.balance === 1000.5;
    const pass = unitPass && nonePass && e2ePass;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. Fallback CSV equity last-row-wins`,
    );
  } catch {
    console.log(`not ok - ${testNum++}. Fallback CSV equity`);
  }

  // 344: file hilang → status file_not_found, cache null, tanpa throw.
  try {
    cleanup();
    const reader = new QuotesLogReader(testFilePath);
    await reader.init();
    const pass =
      reader.getLastStatus() === "file_not_found" &&
      reader.getLatestBySymbol("AUDCAD_ORB", 10).length === 0;
    if (pass) passCount++;
    console.log(
      `${pass ? "ok" : "not ok"} - ${testNum++}. File hilang fail-closed berstatus`,
    );
    reader.destroy();
  } catch {
    console.log(`not ok - ${testNum}. File hilang fail-closed`);
  }

  cleanup();
  return passCount === READER_HARDENING_TEST_COUNT;
}
