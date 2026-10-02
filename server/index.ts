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

dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);

const defaultLogDir = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "MetaTrader 5",
);

const logPath = process.env.MT5_LOG_PATH ?? defaultLogDir;

const reader = new MT5LogReader(logPath);
const stopWatching = reader.startWatching();

const app = createApp(reader);

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
  });

  return server;
}

const serverPromise = startServer();

function shutdown(): void {
  stopWatching();
  reader.stopWatching();
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
