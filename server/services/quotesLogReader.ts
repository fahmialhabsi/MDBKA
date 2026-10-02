import fs from "fs";
import { watch } from "chokidar";

export interface QuoteSnapshot {
  timestamp: string;
  symbol: string;
  bid: number;
  ask: number;
}

export class QuotesLogReader {
  private logPath: string;
  private quotes: QuoteSnapshot[] = [];
  private watcher: ReturnType<typeof watch> | null = null;
  private updateCallbacks: ((quotes: QuoteSnapshot[]) => void)[] = [];
  private retryCount = 0;
  private maxRetries = 3;

  constructor(logPath: string) {
    this.logPath = logPath;
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

  private async readQuotesFile(): Promise<void> {
    try {
      if (!fs.existsSync(this.logPath)) {
        console.warn(`⚠ quotes.csv not found: ${this.logPath}`);
        return;
      }

      const data = fs.readFileSync(this.logPath, "utf-8");
      const lines = data.split("\n").filter((line) => line.trim());

      if (lines.length === 0) return;

      const rows = lines.slice(1);
      const parsed: QuoteSnapshot[] = [];

      for (const row of rows) {
        const [timestamp, symbol, bid, ask] = row.split(",");
        if (timestamp && symbol && bid && ask) {
          parsed.push({
            timestamp: timestamp.trim(),
            symbol: symbol.trim(),
            bid: parseFloat(bid),
            ask: parseFloat(ask),
          });
        }
      }

      this.quotes = parsed;
      this.retryCount = 0;
      console.log(`✓ quotes.csv loaded: ${parsed.length} rows`);
    } catch (error) {
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
        if ((error as NodeJS.ErrnoException)?.code === "EBUSY") {
          console.warn("⚠ quotes.csv still locked, retrying on next change");
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
