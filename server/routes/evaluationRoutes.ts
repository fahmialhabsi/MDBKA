import { Router, type Request, type Response } from "express";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrokerId } from "../../src/types/broker";
import { evaluateTrades, type TradeEvaluation } from "../services/tradeEvaluation";
import { summarizeAccountBalance, type AccountBalance } from "../services/accountBalance";
import { readTradeEntries } from "../services/tradeEntryLog";
import { excursionCacheFile, readExcursionCache } from "../services/excursionCache";
import type { TradeExcursion } from "../services/tradeExcursion";
import { parseHistoryCsv } from "../types/historyCsv";
import { resolveCommonFilesDir } from "./marginRoutes";

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
    });
  }
  return out;
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
  return router;
}
