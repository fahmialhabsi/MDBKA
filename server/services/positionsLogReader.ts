import fs from "fs";
import { watch } from "chokidar";
import {
  isBrokerPosition,
  parsePositionRow,
  type BrokerPosition,
} from "../types/positions";

/**
 * Tahap AP — pembaca positions.csv dari EA ExportPositions (NODE).
 *
 * Pola sama seperti QuotesLogReader (fail-closed jujur):
 * - file hilang/kosong/terkunci → cache valid lama dipertahankan,
 *   status dicatat di getLastStatus(), tanpa throw ke pemanggil.
 * - EA menulis ulang SELURUH file tiap interval → snapshot diganti
 *   utuh (posisi tertutup = absen dari array).
 */

export type PositionsReaderStatus =
  | "idle"
  | "file_not_found"
  | "file_empty"
  | "file_locked"
  | "file_changed_during_read"
  | "malformed_csv"
  | "valid_snapshot";

const LOCK_ERROR_CODES = ["EBUSY", "EPERM", "EACCES"];

function isLockError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && LOCK_ERROR_CODES.includes(code);
}

function fingerprint(logPath: string): string | null {
  try {
    const stat = fs.statSync(logPath);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

export class PositionsLogReader {
  private logPath: string;
  private positions: BrokerPosition[] = [];
  private watcher: ReturnType<typeof watch> | null = null;
  private updateCallbacks: ((positions: BrokerPosition[]) => void)[] = [];
  private retryCount = 0;
  private maxRetries = 3;
  private lockRetryCount = 0;
  private maxLockRetries = 6;
  private lastStatus: PositionsReaderStatus = "idle";

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  getLastStatus(): PositionsReaderStatus {
    return this.lastStatus;
  }

  /** Snapshot terakhir (referensi baca; jangan dimutasi). */
  getAll(): readonly BrokerPosition[] {
    return this.positions;
  }

  async init(): Promise<void> {
    try {
      await this.readPositionsFile();
      this.watchPositionsFile();
      console.log(`✓ PositionsLogReader initialized. Path: ${this.logPath}`);
    } catch {
      console.warn(
        `⚠ PositionsLogReader init delayed (file lock): watcher active, will retry on change`,
      );
      this.watchPositionsFile();
    }
  }

  async refresh(): Promise<void> {
    await this.readPositionsFile();
    this.notifySubscribers();
  }

  onUpdate(callback: (positions: BrokerPosition[]) => void): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter((cb) => cb !== callback);
    };
  }

  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.updateCallbacks = [];
  }

  private async readPositionsFile(): Promise<void> {
    try {
      if (!fs.existsSync(this.logPath)) {
        this.lastStatus = "file_not_found";
        console.warn(`⚠ [file_not_found] positions.csv not found: ${this.logPath}`);
        return;
      }

      const before = fingerprint(this.logPath);
      const data = fs.readFileSync(this.logPath, "utf-8");
      const after = fingerprint(this.logPath);

      if (before !== null && after !== null && before !== after) {
        this.lastStatus = "file_changed_during_read";
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          await new Promise((r) => setTimeout(r, 500 * this.retryCount));
          return this.readPositionsFile();
        }
        return;
      }

      const text = data.replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length <= 1) {
        // Header saja = tak ada posisi open (kondisi normal, bukan error).
        this.positions = [];
        this.retryCount = 0;
        this.lastStatus = "valid_snapshot";
        console.log(`✓ [valid_snapshot] positions.csv: 0 posisi open`);
        return;
      }

      const rows = lines.slice(1);
      const parsed: BrokerPosition[] = [];
      let malformed = 0;
      for (const row of rows) {
        const position = parsePositionRow(row);
        if (position === null) {
          malformed++;
        } else {
          parsed.push(position);
        }
      }

      this.positions = parsed;
      this.retryCount = 0;
      this.lockRetryCount = 0;
      this.lastStatus = "valid_snapshot";
      console.log(
        `✓ [valid_snapshot] positions.csv loaded: ${parsed.length} posisi` +
          (malformed > 0 ? ` (${malformed} baris invalid dilewati)` : ""),
      );
    } catch (error) {
      if (isLockError(error)) {
        this.lastStatus = "file_locked";
        if (this.lockRetryCount < this.maxLockRetries) {
          this.lockRetryCount++;
          await new Promise((r) => setTimeout(r, 250 * this.lockRetryCount));
          return this.readPositionsFile();
        }
        this.lockRetryCount = 0;
        return;
      }
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        await new Promise((r) => setTimeout(r, 500 * this.retryCount));
        return this.readPositionsFile();
      }
      throw error;
    }
  }

  private watchPositionsFile(): void {
    if (this.watcher) return;
    this.watcher = watch(this.logPath, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });
    this.watcher.on("change", async () => {
      try {
        await this.readPositionsFile();
        this.notifySubscribers();
      } catch (error) {
        if (!isLockError(error)) {
          console.error("✗ Error re-reading positions.csv:", error);
        }
      }
    });
    this.watcher.on("error", (err) => {
      console.error("✗ Positions watcher error:", err);
    });
  }

  private notifySubscribers(): void {
    for (const callback of this.updateCallbacks) {
      callback(this.positions.filter(isBrokerPosition));
    }
  }
}
