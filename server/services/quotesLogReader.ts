import fs from "fs";
import { watch } from "chokidar";

export interface QuoteSnapshot {
  timestamp: string;
  symbol: string;
  bid: number;
  ask: number;
}

/**
 * Status baca terakhir (fail-closed & jujur — tidak disamarkan
 * menjadi "data kosong"):
 * idle | file_not_found | file_empty | file_locked |
 * file_changed_during_read | malformed_csv | valid_snapshot
 */
export type QuotesReaderStatus =
  | "idle"
  | "file_not_found"
  | "file_empty"
  | "file_locked"
  | "file_changed_during_read"
  | "malformed_csv"
  | "valid_snapshot";

/** Kode error lock file di Windows (EPERM/EACCES) dan POSIX (EBUSY). */
const LOCK_ERROR_CODES = ["EBUSY", "EPERM", "EACCES"];

function isLockError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && LOCK_ERROR_CODES.includes(code);
}

function parseQuoteRow(row: string): QuoteSnapshot | null {
  const cells = row.split(",");
  if (cells.length < 4) return null;
  const timestamp = (cells[0] ?? "").trim();
  const symbol = (cells[1] ?? "").trim();
  const bid = Number((cells[2] ?? "").trim());
  const ask = Number((cells[3] ?? "").trim());
  if (timestamp.length === 0 || symbol.length === 0) return null;
  if (!Number.isFinite(bid) || bid <= 0) return null;
  if (!Number.isFinite(ask) || ask <= 0) return null;
  if (!(ask > bid)) return null;
  return { timestamp, symbol, bid, ask };
}

function fingerprint(logPath: string): string | null {
  try {
    const stat = fs.statSync(logPath);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

export class QuotesLogReader {
  private logPath: string;
  private quotes: QuoteSnapshot[] = [];
  private watcher: ReturnType<typeof watch> | null = null;
  private updateCallbacks: ((quotes: QuoteSnapshot[]) => void)[] = [];
  private retryCount = 0;
  private maxRetries = 3;
  /** Retry khusus lock EA (terpisah dari retry generik). */
  private lockRetryCount = 0;
  private maxLockRetries = 6;
  private lastStatus: QuotesReaderStatus = "idle";

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /** Status baca terakhir (untuk diagnostik & test runtime). */
  getLastStatus(): QuotesReaderStatus {
    return this.lastStatus;
  }

  async init(): Promise<void> {
    try {
      await this.readQuotesFile();
      this.watchQuotesFile();
      console.log(`✓ QuotesLogReader initialized. Path: ${this.logPath}`);
    } catch {
      console.warn(
        `⚠ QuotesLogReader init delayed (file lock): watcher active, will retry on change`,
      );
      this.watchQuotesFile();
    }
  }

  /**
   * Baca ulang file dan terapkan snapshot hanya bila valid.
   * - file hilang/kosong/berubah saat dibaca: cache valid lama
   *   dipertahankan (tidak diganti snapshot invalid/kosong), status
   *   dicatat jujur di getLastStatus().
   * - file terkunci EA: retry terbatas dengan backoff; bila persisten,
   *   fail-closed tanpa throw (watcher mencoba lagi saat file berubah).
   * - Konsistensi snapshot: size+mtime dicatat sebelum baca dan dicek
   *   lagi sesudahnya; bila berubah (EA sedang menulis), ulangi terbatas.
   */
  private async readQuotesFile(): Promise<void> {
    try {
      if (!fs.existsSync(this.logPath)) {
        this.lastStatus = "file_not_found";
        console.warn(
          `⚠ [file_not_found] quotes.csv not found: ${this.logPath}`,
        );
        return;
      }

      const before = fingerprint(this.logPath);
      // Baca langsung via fs. Di Windows, sharing violation saat EA
      // menahan file muncul sebagai EPERM → terklasifikasi jujur sebagai
      // file_locked oleh isLockError. (cmd /c type gagal sama kerasnya
      // saat terkunci, tetapi error-nya generik tanpa kode sehingga
      // status menjadi tidak jujur + log meledak.)
      const data = fs.readFileSync(this.logPath, "utf-8");
      const after = fingerprint(this.logPath);

      if (before !== null && after !== null && before !== after) {
        this.lastStatus = "file_changed_during_read";
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.warn(
            `⚠ [file_changed_during_read] retry ${this.retryCount}/${this.maxRetries}: ${this.logPath}`,
          );
          await new Promise((r) => setTimeout(r, 500 * this.retryCount));
          return this.readQuotesFile();
        }
        console.warn(
          `⚠ [file_changed_during_read] batas retry tercapai, cache dipertahankan: ${this.logPath}`,
        );
        return;
      }

      const text = data.replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());

      if (lines.length === 0) {
        this.lastStatus = "file_empty";
        if (this.quotes.length === 0) {
          console.warn(`⚠ [file_empty] quotes.csv kosong: ${this.logPath}`);
          return;
        }
        console.warn(
          `⚠ [file_empty] quotes.csv kosong, cache valid dipertahankan: ${this.logPath}`,
        );
        return;
      }

      // Baris pertama adalah header (Timestamp,Symbol,Bid,Ask).
      const rows = lines.slice(1);
      const parsed: QuoteSnapshot[] = [];
      let malformed = 0;

      for (const row of rows) {
        const quote = parseQuoteRow(row);
        if (quote === null) {
          malformed++;
        } else {
          parsed.push(quote);
        }
      }

      if (parsed.length === 0) {
        if (rows.length > 0) {
          this.lastStatus = "malformed_csv";
          console.warn(
            `⚠ [malformed_csv] ${malformed}/${rows.length} baris invalid, cache dipertahankan: ${this.logPath}`,
          );
          return;
        }
        this.lastStatus = "file_empty";
        if (this.quotes.length > 0) {
          console.warn(
            `⚠ [file_empty] hanya header, cache valid dipertahankan: ${this.logPath}`,
          );
          return;
        }
        console.warn(`⚠ [file_empty] hanya header: ${this.logPath}`);
        this.quotes = parsed;
        this.retryCount = 0;
        return;
      }

      this.quotes = parsed;
      this.retryCount = 0;
      this.lockRetryCount = 0;
      this.lastStatus = "valid_snapshot";
      console.log(
        `✓ [valid_snapshot] quotes.csv loaded: ${parsed.length} rows` +
          (malformed > 0 ? ` (${malformed} baris invalid dilewati)` : ""),
      );
    } catch (error) {
      // Lock EA (menulis tiap tick): coba lagi dengan jeda membesar.
      // Bila lock persisten, fail-closed (cache dipertahankan, kembali
      // normal agar watcher bisa mencoba lagi saat file berubah) —
      // JANGAN throw agar log tidak meledak setiap tick.
      if (isLockError(error)) {
        this.lastStatus = "file_locked";
        if (this.lockRetryCount < this.maxLockRetries) {
          this.lockRetryCount++;
          console.warn(
            `⚠ [file_locked] quotes.csv terkunci (EA sedang menulis), ` +
              `coba lagi ${this.lockRetryCount}/${this.maxLockRetries}...`,
          );
          await new Promise((r) =>
            setTimeout(r, 250 * this.lockRetryCount),
          );
          return this.readQuotesFile();
        }
        this.lockRetryCount = 0;
        console.warn(
          `⚠ [file_locked] quotes.csv masih terkunci, cache dipertahankan, ` +
            `coba lagi saat file berubah. ` +
            `Perbaiki EA: FileClose tiap tulis atau tulis via file ` +
            `sementara + rename atomic.`,
        );
        return;
      }
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.warn(
          `⚠ Retry ${this.retryCount}/${this.maxRetries} reading quotes.csv:`,
          error,
        );
        await new Promise((r) => setTimeout(r, 500 * this.retryCount));
        return this.readQuotesFile();
      }
      throw error;
    }
  }

  /**
   * Baca ulang + beri tahu subscriber (simetris dengan MT5LogReader).
   * Dipakai test runtime dan refresh manual; watcher memanggil jalur
   * yang sama saat file berubah.
   */
  async refresh(): Promise<void> {
    await this.readQuotesFile();
    this.notifySubscribers();
  }

  private watchQuotesFile(): void {
    if (this.watcher) return;

    this.watcher = watch(this.logPath, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    this.watcher.on("change", async () => {
      try {
        await this.readQuotesFile();
        this.notifySubscribers();
      } catch (error) {
        if (isLockError(error)) {
          console.warn(
            "⚠ [file_locked] quotes.csv still locked, retrying on next change",
          );
        } else {
          console.error("✗ Error re-reading quotes.csv:", error);
        }
      }
    });

    this.watcher.on("error", (err) => {
      console.error("✗ Watcher error:", err);
    });
  }

  getLatestBySymbol(symbol: string, limit: number = 50): QuoteSnapshot[] {
    const filtered = this.quotes.filter((q) => q.symbol === symbol);
    return filtered.slice(Math.max(0, filtered.length - limit));
  }

  getBySymbolAndTimeRange(
    symbol: string,
    startTime: string,
    endTime: string,
  ): QuoteSnapshot[] {
    return this.quotes.filter(
      (q) =>
        q.symbol === symbol &&
        q.timestamp >= startTime &&
        q.timestamp <= endTime,
    );
  }

  getSymbols(): string[] {
    const unique = new Set(this.quotes.map((q) => q.symbol));
    return Array.from(unique);
  }

  onUpdate(callback: (quotes: QuoteSnapshot[]) => void): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  private notifySubscribers(): void {
    for (const callback of this.updateCallbacks) {
      callback(this.quotes);
    }
  }

  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.updateCallbacks = [];
  }
}
