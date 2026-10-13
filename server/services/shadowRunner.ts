import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { OpenPositionLike } from "../../src/lib/correlationGuard";
import { jsonlRelativePath, type BayanganRecord } from "../../src/lib/jsonlRecord";
import type { NewsEventLike } from "../../src/lib/newsGuard";
import type { TradeSession } from "../../src/lib/sessionGuard";
import { asBayangan, condenseTicks, finishShadow, openShadows, shadowCandidate, shadowOpenKey } from "../../src/lib/shadowBook";
import { evaluateShadowTrade, type ShadowTick } from "../../src/lib/shadowTrade";
import { lastCandleTimeMs, scanSymbolDetailed } from "../../src/lib/symbolScanner";
import type { ExchangeRates } from "../../src/services/fxRateService";
import type { BrokerId } from "../../src/types/broker";
import { collectCandleItems, type CandleSource } from "../routes/candlesRoutes";
import { appendJsonlRecord, readJsonlRecords } from "./jsonlStore";

/**
 * TB-2 (13 Okt 2026) — pelari trade bayangan di server (rancangan tim 11.1).
 * 1) createShadowsOnce: pindai semua simbol broker dengan konteks yang sama
 *    dengan pencatat entry; sinyal BELI/JUAL yang DITAHAN → baris DIBUAT.
 * 2) settleShadowsOnce: ikuti bayangan yang masih berjalan dengan arsip tick
 *    (data/history/<finex|otb>/ticks-YYYY-MM-DD.jsonl) → baris SELESAI.
 * Tidak mengirim order, tidak mengubah tampilan. Gagal = dicatat di log saja.
 */
export interface ShadowSource {
  readonly broker: BrokerId;
  readonly quotes: CandleSource;
  readonly commonDir: string;
  readonly getEquity: () => number | null;
  readonly getFxRates: () => ExchangeRates | null;
  readonly getPauseReason?: (serverTime: string) => string | null;
  readonly getNewsEvents?: () => readonly NewsEventLike[] | null;
  readonly getSessions?: () => readonly TradeSession[] | null;
  readonly getSpecHolds?: () => ReadonlyMap<string, string> | null;
  readonly getOpenPositions?: () => readonly OpenPositionLike[];
}

const DAY_MS = 86_400_000;
const SYMBOL_TAG = '"symbol":"';

function utcSecond(d: Date): string {
  return d.toISOString().slice(0, 19) + "Z";
}

function safe<T>(fn: (() => T) | undefined, fallback: T): T {
  if (fn === undefined) return fallback;
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Berkas bayangan bulan ini dan bulan lalu (bayangan bisa berjalan melewati awal bulan). */
export function shadowFiles(broker: BrokerId, now: Date): string[] {
  const thisMonth = jsonlRelativePath("bayangan", broker, utcSecond(now));
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - DAY_MS);
  const lastMonth = jsonlRelativePath("bayangan", broker, utcSecond(prev));
  return [lastMonth, thisMonth];
}

export function readShadowBook(dataDir: string, broker: BrokerId, now: Date): BayanganRecord[] {
  const out: BayanganRecord[] = [];
  for (const rel of shadowFiles(broker, now)) {
    for (const raw of readJsonlRecords(dataDir, rel, "bayangan/1").records) {
      const rec = asBayangan(raw);
      if (rec !== null) out.push(rec);
    }
  }
  return out;
}

/** Satu putaran pembuatan; mengembalikan jumlah bayangan baru. */
export function createShadowsOnce(
  src: ShadowSource,
  dataDir: string,
  now: Date,
  newId: () => string = () => randomUUID(),
): number {
  const equity = safe(src.getEquity, null);
  if (equity === null) return 0;
  const running = new Set(openShadows(readShadowBook(dataDir, src.broker, now)).map(shadowOpenKey));
  const items = collectCandleItems(src.quotes, src.commonDir);
  const reference = items.reduce<number | null>((max, i) => {
    const t = lastCandleTimeMs(i.csv);
    return t !== null && (max === null || t > max) ? t : max;
  }, null);
  const fxRates = safe(src.getFxRates, null);
  const newsEvents = safe(src.getNewsEvents, null);
  const sessions = safe(src.getSessions, null);
  const specHolds = safe(src.getSpecHolds, null);
  const openPositions = safe(src.getOpenPositions, []);
  // Jeda 3-rugi dinilai SEKALI per putaran (membaca History MT5 itu mahal) pada jam server terbaru.
  const latestServer = items.reduce<string | null>((max, i) => {
    const t = i.quote?.timestamp ?? null;
    return t !== null && (max === null || t > max) ? t : max;
  }, null);
  const getPause = src.getPauseReason;
  const pauseReason = latestServer === null || getPause === undefined ? null : safe(() => getPause(latestServer), null);
  let created = 0;
  for (const item of items) {
    const serverNow = item.quote?.timestamp ?? null;
    if (serverNow === null) continue;
    let detail;
    try {
      detail = scanSymbolDetailed({
        symbol: item.symbol,
        brokerId: src.broker,
        csv: item.csv,
        quote: item.quote,
        equity,
        fxRates,
        referenceCandleMs: reference,
        openPositions,
        pauseReason,
        newsEvents,
        newsNow: serverNow,
        sessions,
        specHolds,
        openingNowMs: now.getTime(),
      });
    } catch {
      continue;
    }
    const rec = shadowCandidate(detail.row, detail.setup, {
      bayanganId: newId(),
      waktuUtc: utcSecond(now),
      broker: src.broker,
      signalServerTime: serverNow,
    });
    if (rec === null || running.has(shadowOpenKey(rec))) continue;
    appendJsonlRecord(dataDir, jsonlRelativePath("bayangan", src.broker, rec.waktuUtc), rec);
    running.add(shadowOpenKey(rec));
    created++;
  }
  return created;
}

function dayMs(serverTime: string): number | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(serverTime);
  return m === null ? null : Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function symbolOf(line: string): string | null {
  const i = line.indexOf(SYMBOL_TAG);
  if (i < 0) return null;
  const start = i + SYMBOL_TAG.length;
  const end = line.indexOf('"', start);
  return end < 0 ? null : line.slice(start, end);
}

/** Nama berkas tick harian yang perlu dibaca untuk satu bayangan (sinyal −1 hari s/d batas amatan +1 hari, maks hari ini +1). */
export function shadowTickFiles(open: BayanganRecord, now: Date, maxObserveHours: number): string[] {
  const from = dayMs(open.waktuSinyalServer);
  if (from === null) return [];
  const until = Math.min(from + (maxObserveHours / 24 + 1) * DAY_MS, Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS);
  const out: string[] = [];
  for (let d = from - DAY_MS; d <= until; d += DAY_MS) out.push(`ticks-${new Date(d).toISOString().slice(0, 10)}.jsonl`);
  return out;
}

/**
 * Ringkasan per bayangan di memori proses: berkas hari lampau yang sudah
 * dibaca + tick ekstremnya (condenseTicks). Hilang saat server restart
 * (dibaca ulang sekali). Mencegah arsip GB dibaca ulang tiap putaran.
 */
export type ShadowTickCache = Map<string, { readonly doneFiles: Set<string>; kept: ShadowTick[] }>;

function fileDayMs(name: string): number | null {
  const m = /^ticks-(\d{4})-(\d{2})-(\d{2})\.jsonl$/.exec(name);
  return m === null ? null : Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Satu putaran penyelesaian; mengembalikan jumlah bayangan yang selesai. */
export async function settleShadowsOnce(
  broker: BrokerId,
  dataDir: string,
  archiveDir: string,
  now: Date,
  maxObserveHours = 120,
  cache: ShadowTickCache = new Map(),
): Promise<number> {
  const opens = openShadows(readShadowBook(dataDir, broker, now));
  if (opens.length === 0) return 0;
  // Berkas bertanggal < kemarin (UTC) dianggap tidak berubah lagi.
  const stableBefore = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS;
  const ticks = new Map<string, ShadowTick[]>();
  const fresh = new Map<string, Map<string, ShadowTick[]>>();
  const byFile = new Map<string, Set<string>>();
  for (const o of opens) {
    const c = cache.get(o.bayanganId);
    ticks.set(o.bayanganId, [...(c?.kept ?? [])]);
    fresh.set(o.bayanganId, new Map());
    for (const name of shadowTickFiles(o, now, maxObserveHours)) {
      if (c?.doneFiles.has(name) === true) continue;
      byFile.set(name, (byFile.get(name) ?? new Set<string>()).add(o.simbol));
    }
  }
  for (const name of [...byFile.keys()].sort()) {
    const file = path.join(archiveDir, name);
    if (!fs.existsSync(file)) continue;
    const wanted = byFile.get(name) ?? new Set<string>();
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf-8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      const sym = symbolOf(line);
      if (sym === null || !wanted.has(sym)) continue;
      let rec: { ts_raw?: unknown; bid?: unknown; ask?: unknown };
      try {
        rec = JSON.parse(line) as { ts_raw?: unknown; bid?: unknown; ask?: unknown };
      } catch {
        continue;
      }
      if (typeof rec.ts_raw !== "string" || typeof rec.bid !== "number" || typeof rec.ask !== "number") continue;
      for (const o of opens) {
        if (o.simbol === sym && rec.ts_raw > o.waktuSinyalServer && cache.get(o.bayanganId)?.doneFiles.has(name) !== true) {
          const tick = { tsServer: rec.ts_raw, bid: rec.bid, ask: rec.ask };
          ticks.get(o.bayanganId)?.push(tick);
          const perFile = fresh.get(o.bayanganId);
          perFile?.set(name, [...(perFile.get(name) ?? []), tick]);
        }
      }
    }
  }
  let settled = 0;
  for (const o of opens) {
    let result;
    try {
      result = evaluateShadowTrade(
        {
          symbol: o.simbol,
          direction: o.arah,
          signalServerTime: o.waktuSinyalServer,
          entry: o.entry,
          stopLoss: o.sl,
          takeProfit: o.tp,
          heldBy: o.ditahanOleh,
          maxObserveHours,
        },
        ticks.get(o.bayanganId) ?? [],
      );
    } catch {
      continue;
    }
    const done = finishShadow(o, result, utcSecond(now));
    if (done === null) {
      // Masih berjalan: ringkas berkas hari lampau yang baru dibaca.
      const c = cache.get(o.bayanganId) ?? { doneFiles: new Set<string>(), kept: [] };
      for (const [name, list] of fresh.get(o.bayanganId) ?? new Map<string, ShadowTick[]>()) {
        const day = fileDayMs(name);
        if (day === null || day >= stableBefore) continue;
        c.kept = [...c.kept, ...condenseTicks(o, list)];
        c.doneFiles.add(name);
      }
      for (const name of shadowTickFiles(o, now, maxObserveHours)) {
        const day = fileDayMs(name);
        if (day !== null && day < stableBefore && !(fresh.get(o.bayanganId)?.has(name) ?? false)) c.doneFiles.add(name);
      }
      cache.set(o.bayanganId, c);
      continue;
    }
    appendJsonlRecord(dataDir, jsonlRelativePath("bayangan", broker, done.waktuUtc), done);
    cache.delete(o.bayanganId);
    settled++;
  }
  return settled;
}

export const SHADOW_FIRST_DELAY_MS = 60_000;
export const SHADOW_INTERVAL_MS = 10 * 60 * 1000;

/** Jadwal latar: 1 menit setelah start, lalu tiap 10 menit; tidak bertumpuk. */
export function startShadowSchedule(
  run: () => Promise<string>,
  log: (msg: string) => void = console.log,
  firstDelayMs: number = SHADOW_FIRST_DELAY_MS,
  intervalMs: number = SHADOW_INTERVAL_MS,
): { stop: () => void; tick: () => Promise<boolean> } {
  let running = false;
  const tick = async (): Promise<boolean> => {
    if (running) return false;
    running = true;
    try {
      const msg = await run();
      if (msg !== "") log(msg);
    } catch (e) {
      log(`⚠ Trade bayangan gagal: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running = false;
    }
    return true;
  };
  const first = setTimeout(() => void tick(), firstDelayMs);
  const every = setInterval(() => void tick(), intervalMs);
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
    tick,
  };
}
