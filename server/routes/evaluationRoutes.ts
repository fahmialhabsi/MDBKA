import { Router, type Request, type Response } from "express";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrokerId } from "../../src/types/broker";
import { evaluateTrades, type TradeEvaluation } from "../services/tradeEvaluation";
import { summarizeAccountBalance, type AccountBalance } from "../services/accountBalance";
import { readTradeEntries } from "../services/tradeEntryLog";
import { excursionCacheFile, readExcursionCache } from "../services/excursionCache";
import type { TradeExcursion } from "../services/tradeExcursion";
import { parseHistoryCsv } from "../types/historyCsv";
import { resolveCommonFilesDir } from "./marginRoutes";
import { readCandleCsvTf, type CandleTimeframe } from "./candlesRoutes";
import { parseCsvCandles } from "../../src/lib/csvCandleParser";
import type { Candle } from "../../src/calculations/swingDetector";
import { buildPatternCards, contextFromDecision, fingerprintNotes, type CardContext, type FingerprintNote, type PatternCardView } from "../../src/lib/patternCards";
import { parseJsonlText, type KeputusanRecord } from "../../src/lib/jsonlRecord";
import { cautionNotes } from "../../src/lib/cautionNotes";
import { lampRows, type LampCard } from "../../src/lib/greenLamps";
import { riskGroupOf } from "../../src/lib/riskGroup";
import { readBacktestLamps } from "../services/lampStore";

/**
 * Langkah 4c — GET /api/evaluation
 * → { accounts: [{ login, label, company, broker, evaluation }] }
 *
 * Sumber: Common\Files\MDBKA_History_<login>.csv (MDBKAHistoryService) +
 * data/trades/entries-<broker>.jsonl (langkah 4b). Broker dikenali dari
 * kolom Company. Label akun opsional dari env ACCOUNT_LABELS, mis.
 * "91811209:Finex live,61823011:Finex demo,70930952:OTB demo".
 */
export interface AccountEvaluation {
  readonly login: string;
  readonly label: string;
  readonly company: string;
  readonly broker: BrokerId | null;
  readonly evaluation: TradeEvaluation;
  /** Langkah B: saldo & setoran dari History (akun login maupun tidak). */
  readonly balance: AccountBalance;
  /**
   * Langkah 5c: MFE/MAE per positionId dari buku `excursion-<broker>.jsonl`
   * (diisi latar belakang, langkah 5b4). Trade yang belum tercatat tidak
   * ada di sini → UI menampilkan "sedang dihitung".
   */
  readonly excursions: Readonly<Record<string, TradeExcursion>>;
  /** R-3 (15 Okt 2026): mata uang akun dari kolom AccountCurrency History ("USD", "IDR"; kosong = ""). */
  readonly currency: string;
}

export function parseAccountLabels(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? "").split(",")) {
    const [login, ...rest] = part.split(":");
    const label = rest.join(":").trim();
    if ((login ?? "").trim() !== "" && label !== "") out[login.trim()] = label;
  }
  return out;
}

export function brokerFromCompany(company: string): BrokerId | null {
  if (/orbi/i.test(company)) return "orbitraderberjangka";
  if (/finex/i.test(company)) return "finex";
  // M1b: PT Monex Investindo Futures (MIFX).
  if (/monex/i.test(company)) return "mifx";
  // X3c (12 Okt 2026): Exness Technologies Ltd — kalender, sesi, spesifikasi & bukti History.
  if (/exness/i.test(company)) return "exness";
  return null;
}

function companyOf(csv: string): string {
  const firstData = csv.replace(/^\uFEFF/, "").split(/\r?\n/)[1] ?? "";
  return (firstData.split(",")[16] ?? "").trim();
}

/** Ambil catatan MFE/MAE milik satu akun (kunci `<login>:<positionId>`). */
export function excursionsForLogin(
  tradesDir: string,
  broker: string,
  login: string,
): Record<string, TradeExcursion> {
  const out: Record<string, TradeExcursion> = {};
  const prefix = `${login}:`;
  for (const [key, rec] of readExcursionCache(excursionCacheFile(tradesDir, broker))) {
    if (!key.startsWith(prefix)) continue;
    out[key.slice(prefix.length)] = {
      coverage: rec.coverage,
      ticks: rec.ticks,
      firstTick: rec.firstTick,
      lastTick: rec.lastTick,
      mfe: rec.mfe,
      mae: rec.mae,
      mfeAt: rec.mfeAt,
      maeAt: rec.maeAt,
      mfeR: rec.mfeR,
      maeR: rec.maeR,
    };
  }
  return out;
}

export function collectAccountEvaluations(
  commonDir: string,
  tradesDir: string,
  labels: Record<string, string>,
): AccountEvaluation[] {
  if (!existsSync(commonDir)) return [];
  const out: AccountEvaluation[] = [];
  for (const name of readdirSync(commonDir).sort()) {
    const m = /^MDBKA_History_(\d+)\.csv$/i.exec(name);
    if (m === null) continue;
    const login = m[1];
    let csv: string;
    try {
      csv = readFileSync(join(commonDir, name), "utf8");
    } catch {
      continue; // terkunci MT5 saat ditulis: coba lagi pada request berikutnya
    }
    const deals = parseHistoryCsv(csv);
    const company = companyOf(csv);
    const broker = brokerFromCompany(company);
    const entries =
      broker === null ? [] : readTradeEntries(join(tradesDir, `entries-${broker}.jsonl`));
    out.push({
      login,
      label: labels[login] ?? `${company || "Akun"} ${login}`,
      company,
      broker,
      evaluation: evaluateTrades(deals, entries),
      balance: summarizeAccountBalance(deals),
      excursions: broker === null ? {} : excursionsForLogin(tradesDir, broker, login),
      currency: deals.find((d) => d.accountCurrency !== "")?.accountCurrency.toUpperCase() ?? "",
    });
  }
  return out;
}

/** K5: kartu terbaru yang dikirim per akun (catatan sidik jari dihitung dari SEMUA kartu). */
export const CARDS_PER_ACCOUNT = 30;
export const CARDS_CACHE_MS = 60_000;

export interface AccountCards {
  readonly login: string;
  readonly label: string;
  readonly broker: BrokerId | null;
  readonly total: number;
  readonly cards: readonly PatternCardView[];
  readonly notes: readonly FingerprintNote[];
  /** TI-3: catatan sidik jari tingkat 2 (+ rezim volatilitas + sesi). */
  readonly notes2: readonly FingerprintNote[];
  /** PR-2: catatan waspada per simbol (hanya peringatan). */
  readonly cautions: ReturnType<typeof cautionNotes>;
  /** LAMPU-1: bahan lampu 2/3 (semua kartu, bukan hanya 30 terbaru). */
  readonly lampCards: readonly LampCard[];
}

/** LAMPU-1: ringkasan baris keputusan entry per tiket (konteks + setara Live + jenis akun + gerbang data). */
export interface EntryDecision {
  readonly context: CardContext;
  readonly setaraLive: boolean | null;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti";
  readonly dataViolation: boolean;
}

/** TI-3: konteks entry per tiket dari data/keputusan/keputusan-<broker>-*.jsonl (jalur entry). */
export function entryContexts(dataDir: string, broker: BrokerId): Map<string, CardContext> {
  return new Map([...entryDecisions(dataDir, broker)].map(([k, v]) => [k, v.context]));
}

export function entryDecisions(dataDir: string, broker: BrokerId): Map<string, EntryDecision> {
  const out = new Map<string, EntryDecision>();
  const dir = join(dataDir, "keputusan");
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (!name.startsWith(`keputusan-${broker}-`) || !name.endsWith(".jsonl")) continue;
    let text: string;
    try {
      text = readFileSync(join(dir, name), "utf8");
    } catch {
      continue;
    }
    for (const raw of parseJsonlText(text, "keputusan/1").records) {
      const rec = raw as unknown as KeputusanRecord;
      if (rec.jalur !== "entry" || typeof rec.tiket !== "string" || rec.tiket === "") continue;
      out.set(rec.tiket, {
        context: contextFromDecision(rec),
        setaraLive: rec.setaraLive ?? null,
        jenisAkun: rec.jenisAkun,
        dataViolation: rec.hasil.status === "DATA",
      });
    }
  }
  return out;
}

/** K5 (Tahap 17): kartu pola per akun dari History + candle H1/D1 Common\Files. */
export function collectAccountCards(
  commonDir: string,
  tradesDir: string,
  labels: Record<string, string>,
): AccountCards[] {
  const cache = new Map<string, readonly Candle[] | null>();
  const candlesOf = (tf: CandleTimeframe) => (symbol: string): readonly Candle[] | null => {
    const key = `${tf}|${symbol}`;
    if (!cache.has(key)) {
      const found = readCandleCsvTf(commonDir, symbol, tf);
      cache.set(key, found === null ? null : parseCsvCandles(found.csv).candles);
    }
    return cache.get(key) ?? null;
  };
  return collectAccountEvaluations(commonDir, tradesDir, labels).map((a) => {
    const dec = a.broker === null ? new Map<string, EntryDecision>() : entryDecisions(dirname(tradesDir), a.broker);
    const ctx = new Map([...dec].map(([k, v]) => [k, v.context]));
    const views = buildPatternCards(a.evaluation.trades, a.excursions, candlesOf("H1"), candlesOf("D1"), (id) => ctx.get(id) ?? null);
    const notes = fingerprintNotes(views);
    return {
      login: a.login,
      label: a.label,
      broker: a.broker,
      total: views.length,
      cards: views.slice(0, CARDS_PER_ACCOUNT),
      notes,
      notes2: fingerprintNotes(views, 2),
      cautions: cautionNotes(views, notes, Date.now()),
      lampCards: views.map((v) => {
        const d = v.card.positions[0] === undefined ? undefined : dec.get(v.card.positions[0]);
        return {
          group: riskGroupOf(v.card.symbol).id,
          r: v.card.r,
          complete: v.card.complete,
          setaraLive: d?.setaraLive ?? null,
          jenisAkun: d?.jenisAkun ?? null,
          dataViolation: d?.dataViolation ?? false,
        };
      }),
    };
  });
}

export function createEvaluationRoutes(
  commonDir: string = resolveCommonFilesDir(),
  tradesDir: string = join(process.cwd(), "data", "trades"),
): Router {
  const router = Router();
  router.get("/", (_req: Request, res: Response) => {
    try {
      const labels = parseAccountLabels(process.env?.["ACCOUNT_LABELS"]);
      res.json({ accounts: collectAccountEvaluations(commonDir, tradesDir, labels) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  // K5: GET /api/evaluation/cards → { accounts: AccountCards[] } (cache 60 dtk; History besar).
  let cached: { at: number; accounts: AccountCards[] } | null = null;
  const cards = (): AccountCards[] => {
    if (cached === null || Date.now() - cached.at > CARDS_CACHE_MS) {
      const labels = parseAccountLabels(process.env?.["ACCOUNT_LABELS"]);
      cached = { at: Date.now(), accounts: collectAccountCards(commonDir, tradesDir, labels) };
    }
    return cached.accounts;
  };
  router.get("/cards", (_req: Request, res: Response) => {
    try {
      res.json({ accounts: cards() });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  // LAMPU-1: GET /api/evaluation/lamps → { rows } status 3 lampu per golongan (tampilan saja).
  router.get("/lamps", (_req: Request, res: Response) => {
    try {
      res.json({ rows: lampRows(cards().flatMap((a) => a.lampCards), readBacktestLamps(dirname(tradesDir))) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  // PR-2: GET /api/evaluation/cautions?broker= → { cautions } dari akun broker itu.
  router.get("/cautions", (req: Request, res: Response) => {
    try {
      const broker = typeof req.query.broker === "string" ? req.query.broker : "";
      res.json({ cautions: cards().filter((a) => a.broker === broker).flatMap((a) => a.cautions) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  return router;
}
