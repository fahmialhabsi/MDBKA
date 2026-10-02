import { QuotesLogReader } from "../../server/services/quotesLogReader";
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

function cleanup(): void {
  if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
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
