import { Router, type Request, type Response } from "express";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BrokerId } from "../../src/types/broker";
import { readUsdIdrBook, refreshUsdIdrBook, type UsdIdrBook } from "../services/ecbHistory";
import { buildHistoryView, type HistoryView } from "../services/historyView";
import { parseHistoryCsv } from "../types/historyCsv";
import { brokerFromCompany, parseAccountLabels } from "./evaluationRoutes";
import { resolveCommonFilesDir } from "./marginRoutes";

/**
 * Halaman History H2b (9 Okt 2026).
 * GET /api/history            → { accounts: [{ login, label, company, broker, kind }] }
 * GET /api/history/:login     → { account, view }  (view = buildHistoryView)
 *
 * Sumber: Common\Files\MDBKA_History_<login>.csv. Kurs: buku ECB harian
 * `data/fx/ecb-usdidr.json`, disegarkan dari ECB paling sering tiap 6 jam
 * (gagal → buku lama). kind = "live"/"demo" dari label ACCOUNT_LABELS.
 */
export type AccountKind = "live" | "demo" | null;

export interface HistoryAccount {
  readonly login: string;
  readonly label: string;
  readonly company: string;
  readonly broker: BrokerId | null;
  readonly kind: AccountKind;
}

export const ECB_REFRESH_MS = 6 * 3600 * 1000;

export function accountKind(label: string): AccountKind {
  if (/demo/i.test(label)) return "demo";
  if (/live|real/i.test(label)) return "live";
  return null;
}

function companyOf(csv: string): string {
  const firstData = csv.replace(/^\uFEFF/, "").split(/\r?\n/)[1] ?? "";
  return (firstData.split(",")[16] ?? "").trim();
}

export function listHistoryAccounts(
  commonDir: string,
  labels: Record<string, string>,
): HistoryAccount[] {
  if (!existsSync(commonDir)) return [];
  const out: HistoryAccount[] = [];
  for (const name of readdirSync(commonDir).sort()) {
    const m = /^MDBKA_History_(\d+)\.csv$/i.exec(name);
    if (m === null) continue;
    let csv: string;
    try {
      csv = readFileSync(join(commonDir, name), "utf8");
    } catch {
      continue;
    }
    const company = companyOf(csv);
    const label = labels[m[1]] ?? `${company || "Akun"} ${m[1]}`;
    out.push({ login: m[1], label, company, broker: brokerFromCompany(company), kind: accountKind(label) });
  }
  return out;
}

export function historyForLogin(
  commonDir: string,
  login: string,
  labels: Record<string, string>,
  book: UsdIdrBook,
): { account: HistoryAccount; view: HistoryView } | null {
  if (!/^\d+$/.test(login)) return null;
  const account = listHistoryAccounts(commonDir, labels).find((a) => a.login === login);
  if (account === undefined) return null;
  try {
    const csv = readFileSync(join(commonDir, `MDBKA_History_${login}.csv`), "utf8");
    return { account, view: buildHistoryView(parseHistoryCsv(csv), book) };
  } catch {
    return null;
  }
}

export function createHistoryRoutes(
  commonDir: string = resolveCommonFilesDir(),
  bookFile: string = join(process.cwd(), "data", "fx", "ecb-usdidr.json"),
): Router {
  const router = Router();
  let refreshing: Promise<UsdIdrBook> | null = null;

  const bookAgeMs = (): number => {
    try {
      return Date.now() - statSync(bookFile).mtimeMs;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const getBook = async (): Promise<UsdIdrBook> => {
    if (bookAgeMs() < ECB_REFRESH_MS) return readUsdIdrBook(bookFile);
    if (refreshing === null) {
      refreshing = refreshUsdIdrBook(bookFile).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  };
  const labels = (): Record<string, string> => parseAccountLabels(process.env?.["ACCOUNT_LABELS"]);

  router.get("/", (_req: Request, res: Response) => {
    res.json({ accounts: listHistoryAccounts(commonDir, labels()) });
  });
  router.get("/:login", async (req: Request, res: Response) => {
    try {
      const login = String(req.params.login ?? "");
      const result = historyForLogin(commonDir, login, labels(), await getBook());
      if (result === null) {
        res.status(404).json({ error: `History akun ${login} tidak ditemukan` });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  return router;
}
