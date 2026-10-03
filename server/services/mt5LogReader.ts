/**
 * Tahap 5E-STEP2 — pembaca log MT5 + pelacakan equity (MODUL NODE).
 *
 * - Dipakai backend Express sebagai sumber data /api/equity.
 * - JANGAN diimpor dari kode frontend (src/): modul ini memakai
 *   node:fs + chokidar yang tidak ada di browser.
 * - Fail-closed: file hilang / tak terbaca → getLatest() null
 *   (HTTP 404), tidak pernah throw ke pemanggil route.
 * - logPath boleh file (.log) atau direktori logs/: bila direktori,
 *   dipakai file *.log yang terakhir dimodifikasi (rollover harian
 *   YYYYMMDD.log MT5).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import chokidar from "chokidar";
import type { EquitySnapshot } from "../types/equity";

export type { EquitySnapshot };

export interface ParsedEquity {
  readonly balance: number;
  readonly equity: number;
  readonly profit: number;
  readonly tradeCount?: number;
}

const BALANCE_RE = /balance\s*:\s*(-?[\d.,]+)/gi;
const EQUITY_RE = /equity\s*:\s*(-?[\d.,]+)/gi;
const PROFIT_RE = /(?:profit|floating)\s*:\s*(-?[\d.,]+)/gi;
const TRADES_RE = /trades?\s*:\s*(\d+)/gi;

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function lastAmount(re: RegExp, text: string): number | null {
  re.lastIndex = 0;
  let found: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = parseAmount(match[1]);
    if (value !== null) found = value;
  }
  return found;
}

/**
 * Parse isi log MT5 menjadi angka equity. Aturan "last wins":
 * baris paling akhir untuk tiap field dianggap state terkini.
 * Profit: bila log tak menulis Profit, diderivasi equity - balance.
 * Mengembalikan null bila Balance maupun Equity tak ditemukan.
 */
/**
 * Parse satu baris CSV equity format:
 * Timestamp,Balance,Equity[,Profit[,TradeCount]].
 * Ketat: Balance/Equity wajib numerik finite, Equity >= 0; Profit bila
 * ada wajib finite (bila tidak ada diderivasi equity - balance);
 * TradeCount bila ada wajib integer >= 0. Baris header/non-numerik
 * mengembalikan null (bukan angka fiktif).
 */
export function parseEquityCsvLine(line: string): ParsedEquity | null {
  const cells = line.replace(/^\uFEFF/, "").split(",");
  if (cells.length < 3) return null;
  const numeric = /^-?[\d.]+$/;
  const balanceRaw = (cells[1] ?? "").trim();
  const equityRaw = (cells[2] ?? "").trim();
  if (!numeric.test(balanceRaw) || !numeric.test(equityRaw)) return null;
  const balance = Number(balanceRaw);
  const equity = Number(equityRaw);
  if (!Number.isFinite(balance) || !Number.isFinite(equity)) return null;
  if (equity < 0) return null;
  let profit: number | null = null;
  if (cells.length >= 4) {
    const profitRaw = (cells[3] ?? "").trim();
    if (profitRaw.length > 0) {
      if (!numeric.test(profitRaw)) return null;
      profit = Number(profitRaw);
      if (!Number.isFinite(profit)) return null;
    }
  }
  let tradeCount: number | undefined;
  if (cells.length >= 5) {
    const tradesRaw = (cells[4] ?? "").trim();
    if (tradesRaw.length > 0) {
      if (!/^\d+$/.test(tradesRaw)) return null;
      tradeCount = Math.max(0, Math.floor(Number(tradesRaw)));
    }
  }
  return {
    balance,
    equity,
    profit: profit ?? equity - balance,
    ...(tradeCount !== undefined ? { tradeCount } : {}),
  };
}

/**
 * Parse seluruh isi CSV equity: baris valid TERAKHIR menang
 * (deterministik untuk file yang di-append EA). Null bila tidak ada
 * baris valid (bukan 0 fiktif).
 */
export function parseEquityCsvText(text: string): ParsedEquity | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let found: ParsedEquity | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseEquityCsvLine(line);
    if (parsed !== null) found = parsed;
  }
  return found;
}

/**
 * Parse snapshot equity dari teks: format `Key: value` dulu (prioritas,
 * perilaku lama byte-identik), lalu fallback baris CSV ketat bila
 * format teks tidak menemukan apa pun. Tidak pernah menebak angka.
 */
export function parseEquitySnapshotText(text: string): ParsedEquity | null {
  return parseEquityFromText(text) ?? parseEquityCsvText(text);
}

export function parseEquityFromText(text: string): ParsedEquity | null {
  const balance = lastAmount(BALANCE_RE, text);
  const equity = lastAmount(EQUITY_RE, text);

  if (balance === null && equity === null) return null;

  const resolvedBalance = balance ?? equity ?? 0;
  const resolvedEquity = equity ?? balance ?? 0;
  const profit =
    lastAmount(PROFIT_RE, text) ?? resolvedEquity - resolvedBalance;

  const tradesMatch = lastAmount(TRADES_RE, text);
  const tradeCount =
    tradesMatch !== null ? Math.max(0, Math.floor(tradesMatch)) : undefined;

  return {
    balance: resolvedBalance,
    equity: resolvedEquity,
    profit,
    ...(tradeCount !== undefined ? { tradeCount } : {}),
  };
}

export type EquityUpdateCallback = (snapshot: EquitySnapshot) => void;

function resolveLogFile(logPath: string): string | null {
  try {
    const stat = fs.statSync(logPath);
    if (stat.isFile()) return logPath;
    if (!stat.isDirectory()) return null;
    const entries = fs.readdirSync(logPath);
    const logs = entries
      .filter((name) => name.toLowerCase().endsWith(".log"))
      .map((name) => path.join(logPath, name))
      .filter((full) => {
        try {
          return fs.statSync(full).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        const ta = fs.statSync(a).mtimeMs;
        const tb = fs.statSync(b).mtimeMs;
        return tb - ta;
      });
    return logs.length > 0 ? logs[0] : null;
  } catch {
    return null;
  }
}

function readSnapshot(logFile: string, parsed: ParsedEquity): EquitySnapshot {
  let lastModified = new Date().toISOString();
  try {
    lastModified = fs.statSync(logFile).mtime.toISOString();
  } catch {
    // Stat gagal bukan fatal: pakai waktu baca sebagai fallback.
  }
  return {
    timestamp: new Date().toISOString(),
    balance: parsed.balance,
    equity: parsed.equity,
    profit: parsed.profit,
    ...(parsed.tradeCount !== undefined
      ? { tradeCount: parsed.tradeCount }
      : {}),
    lastModified,
  };
}

export class MT5LogReader {
  private readonly logPath: string;
  private latest: EquitySnapshot | null = null;
  private readonly listeners = new Set<EquityUpdateCallback>();
  private watcher: chokidar.FSWatcher | null = null;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Baca ulang file log dan perbarui cache. Mengembalikan snapshot
   * terbaru, atau snapshot cache lama bila file (sementara) tak bisa
   * dibaca, atau null bila belum pernah ada data valid.
   */
  refresh(): EquitySnapshot | null {
    this.refreshWithRetry(5, 10);
    return this.latest;
  }

  private refreshWithRetry(attemptsLeft: number, delayMs: number): void {
    const logFile = resolveLogFile(this.logPath);
    if (logFile === null) {
      if (this.latest === null && attemptsLeft > 0) {
        setTimeout(
          () =>
            this.refreshWithRetry(attemptsLeft - 1, Math.min(delayMs + 5, 200)),
          delayMs,
        );
      }
      return;
    }

    let text: string;
    try {
      text = fs.readFileSync(logFile, "utf8");
    } catch {
      if (attemptsLeft > 0) {
        setTimeout(
          () =>
            this.refreshWithRetry(attemptsLeft - 1, Math.min(delayMs + 5, 200)),
          delayMs,
        );
      }
      return;
    }

    const parsed = parseEquitySnapshotText(text);
    if (parsed === null) return;

    const snapshot = readSnapshot(logFile, parsed);
    const prev = this.latest;
    this.latest = snapshot;

    if (
      prev === null ||
      prev.balance !== snapshot.balance ||
      prev.equity !== snapshot.equity ||
      prev.profit !== snapshot.profit
    ) {
      for (const listener of this.listeners) {
        try {
          listener(snapshot);
        } catch {
          // Satu listener gagal tidak boleh merusak listener lain.
        }
      }
    }
  }

  getLatest(): EquitySnapshot | null {
    return this.latest;
  }

  /** Daftarkan callback update; mengembalikan fungsi unsubscribe. */
  onUpdate(callback: EquityUpdateCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Aktifkan file watcher (chokidar) + baca awal. Aman dipanggil saat
   * file belum ada (watch menunggu file muncul). Mengembalikan fungsi
   * stop; tidak pernah throw.
   */
  startWatching(): () => void {
    try {
      this.refresh();
      if (this.watcher !== null) return () => this.stopWatching();
      this.watcher = chokidar.watch(this.logPath, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });
      const onChange = (): void => {
        this.refresh();
      };
      this.watcher.on("add", onChange);
      this.watcher.on("change", onChange);
    } catch {
      // Watcher gagal (mis. path tak valid): mode polling manual
      // via refresh() tetap tersedia, server tetap jalan.
    }
    return () => this.stopWatching();
  }

  stopWatching(): void {
    if (this.watcher !== null) {
      const watcher = this.watcher;
      this.watcher = null;
      void watcher.close().catch(() => undefined);
    }
  }
}
