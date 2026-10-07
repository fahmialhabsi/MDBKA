import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  lastCandleTimeMs,
  scanSymbol,
  type ScanStatus,
} from "../../src/lib/symbolScanner";
import type { ExchangeRates } from "../../src/services/fxRateService";
import type { BrokerId } from "../../src/types/broker";
import { collectCandleItems, type CandleSource } from "../routes/candlesRoutes";
import type { BrokerPosition } from "../types/positions";

/**
 * Langkah 4b (Mode Aman, 8 Okt 2026) — catatan entry posisi.
 *
 * Setiap tiket posisi BARU di positions.csv dicatat SEKALI ke JSONL
 * (append-only): SL/TP awal (History MT5 tidak menyimpannya) + hasil
 * pemindai Mode Aman saat posisi pertama terlihat. Dipasangkan dengan
 * History (PositionId = tiket) di langkah 4c untuk membuktikan apakah
 * setup "Lolos" benar-benar menang.
 *
 * Posisi yang SUDAH terbuka saat backend start ditandai preExisting dan
 * tanpa scan (analisa saat entry tidak diketahui — tanpa angka fiktif).
 */
export interface EntryScan {
  readonly status: ScanStatus;
  readonly direction: "BELI" | "JUAL" | "TUNGGU" | null;
  readonly score: number | null;
  readonly costShareOfRisk: number | null;
  readonly reason: string;
}

export interface TradeEntryRecord {
  readonly ticket: string;
  readonly broker: BrokerId;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly priceOpen: number;
  readonly sl: number;
  readonly tp: number;
  readonly timeOpen: string;
  readonly firstSeenUtc: string;
  readonly preExisting: boolean;
  readonly equity: number | null;
  readonly scan: EntryScan | null;
}

export interface TradeEntryLogOptions {
  readonly file: string;
  readonly broker: BrokerId;
  readonly commonDir: string;
  readonly quotes: CandleSource;
  readonly getEquity: () => number | null;
  readonly getFxRates: () => ExchangeRates | null;
  readonly now?: () => Date;
}

export interface TradeEntryLog {
  readonly file: string;
  /** Catat tiket baru dari snapshot posisi; mengembalikan yang baru dicatat. */
  ingest(positions: readonly BrokerPosition[]): TradeEntryRecord[];
  readAll(): TradeEntryRecord[];
}

function readRecords(file: string): TradeEntryRecord[] {
  if (!existsSync(file)) return [];
  const out: TradeEntryRecord[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const rec = JSON.parse(line) as TradeEntryRecord;
      if (typeof rec.ticket === "string") out.push(rec);
    } catch {
      // Baris rusak (mis. terpotong saat mati listrik): lewati, jangan tebak.
    }
  }
  return out;
}

export function createTradeEntryLog(opts: TradeEntryLogOptions): TradeEntryLog {
  const now = opts.now ?? (() => new Date());
  const known = new Set(readRecords(opts.file).map((r) => r.ticket));
  let first = true;

  const scanFor = (symbol: string, equity: number | null): EntryScan => {
    const items = collectCandleItems(opts.quotes, opts.commonDir);
    const item = items.find((i) => i.symbol === symbol);
    if (item === undefined || equity === null) {
      return {
        status: "DATA",
        direction: null,
        score: null,
        costShareOfRisk: null,
        reason:
          item === undefined
            ? "CSV candle simbol tidak ada saat entry"
            : "Equity live tidak tersedia saat entry",
      };
    }
    const reference = items.reduce<number | null>((max, i) => {
      const t = lastCandleTimeMs(i.csv);
      return t !== null && (max === null || t > max) ? t : max;
    }, null);
    const row = scanSymbol({
      symbol,
      brokerId: opts.broker,
      csv: item.csv,
      quote: item.quote,
      equity,
      fxRates: opts.getFxRates(),
      referenceCandleMs: reference,
    });
    return {
      status: row.status,
      direction: row.direction,
      score: row.score,
      costShareOfRisk: row.costShareOfRisk,
      reason: row.reason,
    };
  };

  return {
    file: opts.file,
    ingest(positions) {
      const preExisting = first;
      first = false;
      const added: TradeEntryRecord[] = [];
      for (const p of positions) {
        if (known.has(p.ticket)) continue;
        const equity = opts.getEquity();
        let scan: EntryScan | null = null;
        if (!preExisting) {
          try {
            scan = scanFor(p.symbol, equity);
          } catch (e) {
            scan = {
              status: "DATA",
              direction: null,
              score: null,
              costShareOfRisk: null,
              reason: `Pemindai gagal: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
        }
        const rec: TradeEntryRecord = {
          ticket: p.ticket,
          broker: opts.broker,
          symbol: p.symbol,
          side: p.side,
          volume: p.volume,
          priceOpen: p.priceOpen,
          sl: p.sl,
          tp: p.tp,
          timeOpen: p.timeOpen,
          firstSeenUtc: now().toISOString(),
          preExisting,
          equity,
          scan,
        };
        mkdirSync(dirname(opts.file), { recursive: true });
        appendFileSync(opts.file, `${JSON.stringify(rec)}\n`, "utf8");
        known.add(p.ticket);
        added.push(rec);
      }
      return added;
    },
    readAll() {
      return readRecords(opts.file);
    },
  };
}
