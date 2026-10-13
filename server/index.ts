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
import { checkLossStreak, tradesForBroker } from "../src/lib/lossStreakGuard";
import { collectAccountEvaluations } from "./routes/evaluationRoutes";
import { getCachedEcbRates } from "./routes/fxRoutes";
import { resolveCommonFilesDir } from "./routes/marginRoutes";
import { createTradeEntryLog } from "./services/tradeEntryLog";
import { readCalendarForBroker } from "./services/calendarReader";
import { readSessionsForBroker } from "./services/sessionReader";
import { readSpecsForBroker } from "./services/specReader";
import { specHoldMap } from "../src/lib/specCompare";
import { runExcursionPass, startExcursionSchedule } from "./services/excursionJob";
import { trackSpecVersion } from "./services/specVersion";
import { runTabReportsOnce, startTabReportSchedule, type TabReportSource } from "./services/tabReportJob";
import { createShadowsOnce, settleShadowsOnce, startShadowSchedule, type ShadowSource, type ShadowTickCache } from "./services/shadowRunner";
import { MT5LogReader } from "./services/mt5LogReader";
import { IdrEquitySource, parseAccountCurrency, type EquitySource } from "./services/convertedEquity";
import { readUsdIdrBook, usdIdrOn } from "./services/ecbHistory";
import { QuotesLogReader } from "./services/quotesLogReader";
import { PositionsLogReader } from "./services/positionsLogReader";
import {
  DEFAULT_RETENTION_DAYS,
  TickHistoryLogger,
  resolveTzOffset,
  resolveTzOffsetOrNull,
} from "./services/tickHistory";

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

// Tahap AP: posisi terbuka dari EA ExportPositions (opsional per broker).
// Kosong → reader null → GET /api/positions menjawab 404 jujur.
const positionsLogPath = process.env.POSITIONS_LOG_PATH ?? "";
const positionsLogPathFinex = process.env.POSITIONS_LOG_PATH_FINEX ?? "";
const positionsReader =
  positionsLogPath.trim() !== "" ? new PositionsLogReader(positionsLogPath) : null;
const positionsReaderFinex =
  positionsLogPathFinex.trim() !== "" ? new PositionsLogReader(positionsLogPathFinex) : null;

// M3a (10 Okt 2026): sumber live MIFX (opsional). EA MDBKAMultiLive + ExportPositions
// di terminal MIFX menulis equity.csv/quotes.csv/positions.csv di folder MQL5\Files-nya
// sendiri. Kosong → null → ?broker=mifx menjawab 404 jujur (tidak jatuh ke OTB).
const mifxLogPath = process.env.MT5_LOG_PATH_MIFX ?? "";
const mifxQuotesLogPath = process.env.QUOTES_LOG_PATH_MIFX ?? "";
const mifxPositionsLogPath = process.env.POSITIONS_LOG_PATH_MIFX ?? "";
const readerMifx = mifxLogPath.trim() !== "" ? new MT5LogReader(mifxLogPath) : null;
const quotesReaderMifx =
  mifxQuotesLogPath.trim() !== "" ? new QuotesLogReader(mifxQuotesLogPath) : null;
const positionsReaderMifx =
  mifxPositionsLogPath.trim() !== "" ? new PositionsLogReader(mifxPositionsLogPath) : null;

// X1b (12 Okt 2026): sumber live Exness (opsional) dari terminal Exness SENDIRI
// (folder data berbeda dari OTB). Hanya harga & posisi; equity.csv Exness dalam
// Rupiah sengaja belum dibaca sampai konversi IDR→USD (X2). Kosong → 404 jujur.
const exnessQuotesLogPath = process.env.QUOTES_LOG_PATH_EXNESS ?? "";
const exnessPositionsLogPath = process.env.POSITIONS_LOG_PATH_EXNESS ?? "";
const quotesReaderExness =
  exnessQuotesLogPath.trim() !== "" ? new QuotesLogReader(exnessQuotesLogPath) : null;
const positionsReaderExness =
  exnessPositionsLogPath.trim() !== "" ? new PositionsLogReader(exnessPositionsLogPath) : null;

// X2 (12 Okt 2026): equity Exness. equity.csv tidak mencatat mata uang akun →
// ditetapkan di .env (MT5_ACCOUNT_CURRENCY_EXNESS=IDR). IDR dibagi kurs ECB hari
// kerja terakhir (buku data/fx/ecb-usdidr.json); kurs tak ada → 404 jujur.
// Mata uang tak dikenal → equity TIDAK dilayani (bukan ditebak).
const exnessLogPath = process.env.MT5_LOG_PATH_EXNESS ?? "";
const exnessCurrency = parseAccountCurrency(process.env.MT5_ACCOUNT_CURRENCY_EXNESS);
const rawReaderExness = exnessLogPath.trim() !== "" ? new MT5LogReader(exnessLogPath) : null;
const ecbBookFile = path.join(process.cwd(), "data", "fx", "ecb-usdidr.json");
const readerExness: EquitySource | null =
  rawReaderExness === null || exnessCurrency === null
    ? null
    : exnessCurrency === "USD"
      ? rawReaderExness
      : new IdrEquitySource(
          rawReaderExness,
          () => usdIdrOn(readUsdIdrBook(ecbBookFile), new Date().toISOString().slice(0, 10))?.rate ?? null,
        );

const stopWatching = reader.startWatching();
if (rawReaderExness !== null) rawReaderExness.startWatching();
if (readerMifx !== null) readerMifx.startWatching();
if (readerFinex !== null) readerFinex.startWatching();

// Tahap HIST-1: arsip tick per broker ke JSONL harian (data/history/).
// Mulai akumulasi sejak backend jalan (penting sebelum agregator).
// Direktori + retensi + offset zona server MT5 via env (lihat .env.example).
const historyDirRaw = process.env.HISTORY_DIR?.trim() ?? "";
const historyDir =
  historyDirRaw !== ""
    ? historyDirRaw
    : path.join(process.cwd(), "data", "history");
const historyRetentionDays = Number(process.env.HISTORY_RETENTION_DAYS);
const historyOtb = new TickHistoryLogger(
  historyDir,
  "otb",
  resolveTzOffset(process.env.MT5_TZ_OFFSET_OTB),
);
const historyFinex =
  quotesReaderFinex !== null
    ? new TickHistoryLogger(
        historyDir,
        "finex",
        resolveTzOffset(process.env.MT5_TZ_OFFSET_FINEX),
      )
    : null;
historyOtb.prune(Number.isFinite(historyRetentionDays) ? historyRetentionDays : DEFAULT_RETENTION_DAYS);
if (historyFinex !== null) {
  historyFinex.prune(Number.isFinite(historyRetentionDays) ? historyRetentionDays : DEFAULT_RETENTION_DAYS);
}

// F1 (13 Okt 2026): arsip tick MIFX & Exness. Offset zona WAJIB di .env
// (MT5_TZ_OFFSET_MIFX / MT5_TZ_OFFSET_EXNESS); kosong → arsip tidak jalan
// (tidak menebak +3: nama berkas harian & ts_utc akan salah).
const offsetMifx = resolveTzOffsetOrNull(process.env.MT5_TZ_OFFSET_MIFX);
const offsetExness = resolveTzOffsetOrNull(process.env.MT5_TZ_OFFSET_EXNESS);
const historyMifx =
  quotesReaderMifx !== null && offsetMifx !== null ? new TickHistoryLogger(historyDir, "mifx", offsetMifx) : null;
const historyExness =
  quotesReaderExness !== null && offsetExness !== null ? new TickHistoryLogger(historyDir, "exness", offsetExness) : null;
for (const [name, reader, logger, offset] of [
  ["MIFX", quotesReaderMifx, historyMifx, offsetMifx],
  ["Exness", quotesReaderExness, historyExness, offsetExness],
] as const) {
  if (reader === null) continue;
  if (logger === null) {
    console.log(`⚠ History ${name}: arsip tick TIDAK jalan — isi MT5_TZ_OFFSET_${name.toUpperCase()} di .env (sekarang ${String(offset)})`);
    continue;
  }
  logger.prune(Number.isFinite(historyRetentionDays) ? historyRetentionDays : DEFAULT_RETENTION_DAYS);
  let backfilled = false;
  reader.onUpdate((quotes) => {
    const first = !backfilled;
    backfilled = true;
    const { appended, skipped } = logger.ingest(quotes, first);
    if (appended > 0 || first) {
      console.log(
        `✓ History ${name}: +${appended} tick${first ? " (backfill awal)" : ""}` +
          (skipped > 0 ? `, ${skipped} dilewati (duplikat/invalid)` : ""),
      );
    }
  });
}

/** Folder arsip tick per broker yang AKTIF (bahan trade bayangan TB-2). */
const tickArchiveDir: Partial<Record<string, string>> = {
  orbitraderberjangka: "otb",
  ...(historyFinex !== null ? { finex: "finex" } : {}),
  ...(historyMifx !== null ? { mifx: "mifx" } : {}),
  ...(historyExness !== null ? { exness: "exness" } : {}),
};

let historyBackfilled = false;
quotesReader.onUpdate((quotes) => {
  const first = !historyBackfilled;
  historyBackfilled = true;
  const { appended, skipped } = historyOtb.ingest(quotes, first);
  if (appended > 0 || first) {
    console.log(
      `✓ History OTB: +${appended} tick${first ? " (backfill awal)" : ""}` +
        (skipped > 0 ? `, ${skipped} dilewati (duplikat/invalid)` : ""),
    );
  }
});
if (quotesReaderFinex !== null && historyFinex !== null) {
  const finexLogger = historyFinex;
  let finexBackfilled = false;
  quotesReaderFinex.onUpdate((quotes) => {
    const first = !finexBackfilled;
    finexBackfilled = true;
    const { appended, skipped } = finexLogger.ingest(quotes, first);
    if (appended > 0 || first) {
      console.log(
        `✓ History Finex: +${appended} tick${first ? " (backfill awal)" : ""}` +
          (skipped > 0 ? `, ${skipped} dilewati (duplikat/invalid)` : ""),
      );
    }
  });
}

const app = createApp(reader, quotesReader, readerFinex, quotesReaderFinex, {
  otb: historyOtb,
  finex: historyFinex,
  mifx: historyMifx,
  exness: historyExness,
}, positionsReader, positionsReaderFinex, {
  equity: readerMifx,
  quotes: quotesReaderMifx,
  positions: positionsReaderMifx,
}, {
  equity: readerExness,
  quotes: quotesReaderExness,
  positions: positionsReaderExness,
});

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

  // Backfill arsip histori dari isi file saat ini (init tidak notify;
  // refresh membaca ulang + notify → ingest full sekali). Setelah itu
  // watcher menambah tail otomatis tiap file berubah.
  await quotesReader.refresh().catch(() => {
    console.log(`⚠ History OTB backfill ditunda (baca ulang gagal)`);
  });
  if (quotesReaderFinex !== null) {
    await quotesReaderFinex.refresh().catch(() => {
      console.log(`⚠ History Finex backfill ditunda (baca ulang gagal)`);
    });
  }

  if (quotesReaderMifx !== null) {
    await quotesReaderMifx.init().catch(() => {
      console.log(`⚠ MIFX quotes reader will retry when file unlocks`);
    });
  } else {
    console.log(`⚠ MIFX source not configured (QUOTES_LOG_PATH_MIFX empty): ?broker=mifx answers 404`);
  }
  if (positionsReaderMifx !== null) {
    await positionsReaderMifx.init().catch(() => {
      console.log(`⚠ Positions MIFX init ditunda (file terkunci/hilang)`);
    });
  }
  if (quotesReaderExness !== null) {
    await quotesReaderExness.init().catch(() => {
      console.log(`⚠ Exness quotes reader will retry when file unlocks`);
    });
  } else {
    console.log(`⚠ Exness source not configured (QUOTES_LOG_PATH_EXNESS empty): ?broker=exness answers 404`);
  }
  if (positionsReaderExness !== null) {
    await positionsReaderExness.init().catch(() => {
      console.log(`⚠ Positions Exness init ditunda (file terkunci/hilang)`);
    });
  }

  // Tahap AP: baca awal positions.csv (boleh absen/EA belum dipasang).
  if (positionsReader !== null) {
    await positionsReader.init().catch(() => {
      console.log(`⚠ Positions OTB init ditunda (file terkunci/hilang)`);
    });
  }
  if (positionsReaderFinex !== null) {
    await positionsReaderFinex.init().catch(() => {
      console.log(`⚠ Positions Finex init ditunda (file terkunci/hilang)`);
    });
  }

  // Langkah 4b Mode Aman: catat tiap posisi baru (SL/TP awal + hasil
  // pemindai saat entry) ke data/trades/entries-<broker>.jsonl.
  const tradesDir = path.join(process.cwd(), "data", "trades");
  const entrySources = [
    { broker: "orbitraderberjangka" as const, positions: positionsReader, quotes: quotesReader, equity: reader },
    { broker: "finex" as const, positions: positionsReaderFinex, quotes: quotesReaderFinex, equity: readerFinex },
    { broker: "mifx" as const, positions: positionsReaderMifx, quotes: quotesReaderMifx, equity: readerMifx },
    // X3c: catatan entry Exness — equity SUDAH USD (IdrEquitySource), jadi risiko % benar.
    { broker: "exness" as const, positions: positionsReaderExness, quotes: quotesReaderExness, equity: readerExness },
  ];
  // TB-2 (13 Okt 2026): sumber pelari trade bayangan (arsip tick hanya Finex & OTB).
  const shadowSources: ShadowSource[] = [];
  // TT-1/TT-2 (13 Okt 2026): sumber laporan per jam tim Trade/Exposure/Calendar (semua broker).
  const tabSources: TabReportSource[] = [];
  for (const src of entrySources) {
    if (src.positions === null || src.quotes === null) continue;
    const equityReader = src.equity;
    const log = createTradeEntryLog({
      file: path.join(tradesDir, `entries-${src.broker}.jsonl`),
      broker: src.broker,
      commonDir: resolveCommonFilesDir(),
      quotes: src.quotes,
      getEquity: () => equityReader?.getLatest()?.equity ?? null,
      getFxRates: getCachedEcbRates,
      // Opsi 6a-2: jeda 3 rugi beruntun dari History MT5 (demo+live broker
      // ini), dinilai pada jam server entry — sama dengan pemindai di UI.
      getPauseReason: (serverTime) =>
        checkLossStreak(
          tradesForBroker(collectAccountEvaluations(resolveCommonFilesDir(), tradesDir, {}), src.broker),
          serverTime,
        ).reason,
      // K4c: kalender ekonomi broker yang sama (jam server); tidak ada = null.
      getNewsEvents: () => readCalendarForBroker(resolveCommonFilesDir(), src.broker)?.events ?? null,
      // S3: jam trading resmi broker yang sama; tidak ada = null.
      getSessions: () => readSessionsForBroker(resolveCommonFilesDir(), src.broker)?.sessions ?? null,
      // V2c-2: spesifikasi MT5 broker yang sama vs spec32; tidak ada = null.
      getSpecHolds: () => {
        const snap = readSpecsForBroker(resolveCommonFilesDir(), src.broker);
        return snap === null ? null : specHoldMap(snap.diffs);
      },
      // F4 (13 Okt 2026): versi spesifikasi bertanggal (data/spesifikasi/).
      getSpecVersion: () =>
        trackSpecVersion(path.join(process.cwd(), "data"), readSpecsForBroker(resolveCommonFilesDir(), src.broker), new Date()),
      // A7-4/G-4 (13 Okt 2026): baris `keputusan` jalur entry + sidik jari snapshot.
      decisionDataDir: path.join(process.cwd(), "data"),
    });
    const record = (positions: readonly import("./types/positions").BrokerPosition[]): void => {
      try {
        for (const rec of log.ingest(positions)) {
          console.log(
            `✓ Entry ${src.broker} #${rec.ticket} ${rec.symbol} ${rec.side}` +
              (rec.preExisting ? " (sudah terbuka saat start)" : ` → ${rec.scan?.status ?? "-"}`),
          );
        }
      } catch (e) {
        console.log(`⚠ Catat entry ${src.broker} gagal: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    record(src.positions.getAll());
    src.positions.onUpdate(record);
    {
      const positions = src.positions;
      const quotes = src.quotes;
      tabSources.push({
        broker: src.broker,
        getPositions: () => positions.getAll(),
        getEquity: () => {
          const e = equityReader?.getLatest() ?? null;
          return e === null ? null : { balance: e.balance, equity: e.equity };
        },
        getServerNow: () =>
          quotes.getSymbols().reduce<string | null>((max, sym) => {
            const t = quotes.getLatestBySymbol(sym, 1).at(-1)?.timestamp ?? null;
            return t !== null && (max === null || t > max) ? t : max;
          }, null),
        getCalendar: () => {
          const cal = readCalendarForBroker(resolveCommonFilesDir(), src.broker);
          return cal === null ? null : { events: cal.events, file: cal.file };
        },
      });
    }
    if (tickArchiveDir[src.broker] !== undefined) {
      const positions = src.positions;
      shadowSources.push({
        broker: src.broker,
        quotes: src.quotes,
        commonDir: resolveCommonFilesDir(),
        getEquity: () => equityReader?.getLatest()?.equity ?? null,
        getFxRates: getCachedEcbRates,
        getPauseReason: (serverTime) =>
          checkLossStreak(
            tradesForBroker(collectAccountEvaluations(resolveCommonFilesDir(), tradesDir, {}), src.broker),
            serverTime,
          ).reason,
        getNewsEvents: () => readCalendarForBroker(resolveCommonFilesDir(), src.broker)?.events ?? null,
        getSessions: () => readSessionsForBroker(resolveCommonFilesDir(), src.broker)?.sessions ?? null,
        getSpecHolds: () => {
          const snap = readSpecsForBroker(resolveCommonFilesDir(), src.broker);
          return snap === null ? null : specHoldMap(snap.diffs);
        },
        getOpenPositions: () => positions.getAll().map((p) => ({ symbol: p.symbol, side: p.side })),
      });
    }
  }

  // Langkah 5b4 Mode Aman: isi buku MFE/MAE (data/trades/excursion-<broker>.jsonl)
  // di latar belakang: 5 dtk setelah start, lalu tiap 10 menit.
  excursionSchedule = startExcursionSchedule(() =>
    runExcursionPass({ commonDir: resolveCommonFilesDir(), tradesDir, historyDir }),
  );

  // TB-2 (13 Okt 2026): trade bayangan — buat dari sinyal tertahan, selesaikan
  // dengan arsip tick (data/bayangan/bayangan-<broker>-<YYYY-MM>.jsonl).
  const shadowDataDir = path.join(process.cwd(), "data");
  const shadowTickCache: ShadowTickCache = new Map();
  shadowSchedule = startShadowSchedule(async () => {
    const now = new Date();
    const parts: string[] = [];
    for (const s of shadowSources) {
      const made = createShadowsOnce(s, shadowDataDir, now);
      const done = await settleShadowsOnce(s.broker, shadowDataDir, path.join(historyDir, tickArchiveDir[s.broker] ?? s.broker), now, 120, shadowTickCache);
      if (made + done > 0) parts.push(`${s.broker}: ${made} dibuat, ${done} selesai`);
    }
    return parts.length === 0 ? "" : `✓ Trade bayangan — ${parts.join("; ")}`;
  });

  // TT-1/TT-2/G-7: laporan per jam (data/laporan/), sekali per tim per jendela jam.
  const tabReportsDone = new Set<string>();
  tabReportSchedule = startTabReportSchedule(() =>
    runTabReportsOnce(tabSources, shadowDataDir, new Date(), tabReportsDone),
  );

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

let excursionSchedule: { stop: () => void } | null = null;
let shadowSchedule: { stop: () => void } | null = null;
let tabReportSchedule: { stop: () => void } | null = null;
const serverPromise = startServer();

function shutdown(): void {
  stopWatching();
  reader.stopWatching();
  quotesReader.destroy();
  if (readerFinex !== null) readerFinex.stopWatching();
  if (quotesReaderFinex !== null) quotesReaderFinex.destroy();
  if (positionsReader !== null) positionsReader.destroy();
  if (positionsReaderFinex !== null) positionsReaderFinex.destroy();
  if (readerMifx !== null) readerMifx.stopWatching();
  if (quotesReaderMifx !== null) quotesReaderMifx.destroy();
  if (positionsReaderMifx !== null) positionsReaderMifx.destroy();
  if (quotesReaderExness !== null) quotesReaderExness.destroy();
  if (rawReaderExness !== null) rawReaderExness.stopWatching();
  if (positionsReaderExness !== null) positionsReaderExness.destroy();
  excursionSchedule?.stop();
  shadowSchedule?.stop();
  tabReportSchedule?.stop();
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
