/**
 * Tahap 5E-STEP2 — entry backend MDBKA (NODE, dijalankan via tsx).
 *
 *   npm run dev:backend   → http://localhost:3000
 *
 * Path log MT5 diambil dari env MT5_LOG_PATH (lihat .env.example).
 * Bila file belum ada, server tetap jalan: /api/equity/latest
 * menjawab 404 hingga log pertama terbaca (fail-closed, tanpa crash).
 */

import * as dotenv from "dotenv";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "./app";
import { MT5LogReader } from "./services/mt5LogReader";
import { QuotesLogReader } from "./services/quotesLogReader";

dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);

const defaultLogDir = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "MetaTrader 5",
);

const logPath = process.env.MT5_LOG_PATH ?? defaultLogDir;
const quotesLogPath =
  process.env.QUOTES_LOG_PATH ??
  path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "MetaQuotes",
    "Terminal",
    "D0E8209F77C8CF37AD8BF550E51FF075",
    "MQL5",
    "Files",
    "quotes.csv",
  );

// Dual-source Finex (opsional): diisi bila EA yang sama dipasang di
// terminal MT5 Finex dan menulis equity.csv + quotes.csv sendiri.
// Bila kosong → reader Finex null → route ?broker=finex menjawab
// 404 jujur (tanpa fallback diam ke sumber OTB, tanpa angka fiktif).
const finexLogPath = process.env.MT5_LOG_PATH_FINEX ?? "";
const finexQuotesLogPath = process.env.QUOTES_LOG_PATH_FINEX ?? "";

const reader = new MT5LogReader(logPath);
const quotesReader = new QuotesLogReader(quotesLogPath);
const readerFinex =
  finexLogPath.trim() !== "" ? new MT5LogReader(finexLogPath) : null;
const quotesReaderFinex =
  finexQuotesLogPath.trim() !== "" ? new QuotesLogReader(finexQuotesLogPath) : null;

const stopWatching = reader.startWatching();
if (readerFinex !== null) readerFinex.startWatching();

const app = createApp(reader, quotesReader, readerFinex, quotesReaderFinex);

// Polling startup: tunggu data pertama kali tersedia
async function startServer() {
  let attempts = 0;
  const maxAttempts = 15;
  const delayMs = 300;

  while (reader.getLatest() === null && attempts < maxAttempts) {
    console.log(`⏳ Waiting for MT5 data... (${attempts + 1}/${maxAttempts})`);
    reader.refresh();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    attempts++;
  }

  await quotesReader.init().catch(() => {
    console.log(`⚠ Quotes reader will retry when file unlocks`);
  });

  if (quotesReaderFinex !== null) {
    await quotesReaderFinex.init().catch(() => {
      console.log(`⚠ Finex quotes reader will retry when file unlocks`);
    });
  } else {
    console.log(
      `⚠ Finex source not configured (MT5_LOG_PATH_FINEX/QUOTES_LOG_PATH_FINEX empty): ?broker=finex answers 404`,
    );
  }

  const server = app.listen(PORT, () => {
    const latest = reader.getLatest();
    console.log(`✓ Backend running on http://localhost:${PORT}`);
    if (latest) {
      console.log(
        `✓ MT5 equity loaded: balance=${latest.balance}, equity=${latest.equity}`,
      );
    } else {
      console.log(`⚠ MT5 data pending (still waiting for file access)`);
    }
    console.log(`✓ MT5 log watcher active on: ${logPath}`);
    if (readerFinex !== null) {
      const latestFinex = readerFinex.getLatest();
      if (latestFinex) {
        console.log(
          `✓ Finex equity loaded: balance=${latestFinex.balance}, equity=${latestFinex.equity}`,
        );
      } else {
        console.log(`⚠ Finex data pending (still waiting for file access)`);
      }
      console.log(`✓ Finex log watcher active on: ${finexLogPath}`);
    }
  });

  return server;
}

const serverPromise = startServer();

function shutdown(): void {
  stopWatching();
  reader.stopWatching();
  quotesReader.destroy();
  if (readerFinex !== null) readerFinex.stopWatching();
  if (quotesReaderFinex !== null) quotesReaderFinex.destroy();
  serverPromise
    .then((server) => {
      server.close(() => {
        process.exit(0);
      });
    })
    .catch(() => {
      process.exit(1);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
