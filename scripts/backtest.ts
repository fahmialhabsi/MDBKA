/**
 * B4 (12 Okt 2026) — perintah `npm run backtest`.
 * Contoh: npm run backtest -- --broker finex --equity 10000 --grup FOREX,FOREX_JPY
 *
 * Bahan: Common\Files\MDBKA_<simbol>_H1_LONG.csv (ExportLongH1MDBKA),
 * spread dari Common\Files\MDBKA_Margin_<Finex|OTB>.csv, kurs USD→Rp dari
 * data/fx/ecb-usdidr.json. HANYA MEMBACA — tidak menulis file apa pun.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCommonFilesDir } from "../server/routes/marginRoutes";
import { readUsdIdrBook, usdIdrOn } from "../server/services/ecbHistory";
import { FALLBACK_RATES, fetchECBRates } from "../src/services/fxRateService";
import { runBacktest, type BacktestRun } from "../src/lib/backtest";
import { buildBacktestReport } from "../src/lib/backtestReport";
import { getStrategy } from "../src/lib/strategyRegistry";
import {
  formatBacktestReport,
  parseBacktestArgs,
  parseSpreadsFromMargin,
  pickBacktestSymbols,
} from "../src/lib/backtestCli";

async function main(): Promise<number> {
  const parsed = parseBacktestArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    return 1;
  }
  const opt = parsed.options;
  const dir = resolveCommonFilesDir();
  const marginFile = join(dir, `MDBKA_Margin_${opt.marginTag}.csv`);
  if (!existsSync(marginFile)) {
    console.error(`File spread tidak ada: ${marginFile}. Jalankan ExportMarginMDBKA di terminal ${opt.marginTag}.`);
    return 1;
  }
  const spreads = parseSpreadsFromMargin(readFileSync(marginFile, "utf8"));
  const longFile = (s: string): string => join(dir, `MDBKA_${s}_H1_LONG.csv`);
  const picked = pickBacktestSymbols(spreads, (s) => existsSync(longFile(s)), opt);
  if (picked.symbols.length === 0) {
    console.error("Tidak ada simbol yang bisa diuji.", picked.notes.join("; "));
    return 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const kurs = usdIdrOn(readUsdIdrBook(join(process.cwd(), "data", "fx", "ecb-usdidr.json")), today);
  const ecb = await fetchECBRates();
  const extraNotes = [
    `Spread dari ${marginFile.split(/[\\/]/).pop() ?? marginFile}.`,
    ecb !== FALLBACK_RATES ? `Kurs silang ECB ${ecb.ecbDate ?? ecb.fetchedAt ?? "-"}.` : `Kurs silang: cadangan bawaan ${FALLBACK_RATES.fetchedAt ?? ""} (ECB tidak terjangkau).`,
    ...picked.notes,
  ];
  const rates = kurs === null ? ecb : { ...ecb, IDR: kurs.rate * ecb.USD };

  const runs: BacktestRun[] = [];
  for (const symbol of picked.symbols) {
    const run = runBacktest({
      symbol,
      brokerId: opt.brokerId,
      csv: readFileSync(longFile(symbol), "utf8"),
      equity: opt.equity,
      fxRates: rates,
      spread: spreads.get(symbol) ?? 0,
      strategy: opt.strategy,
    });
    runs.push(run);
    console.log(`  ${symbol.padEnd(12)} ${run.error ?? `${run.trades.length} trade`}`);
  }
  const report = buildBacktestReport(runs, kurs?.rate ?? null);
  console.log("");
  console.log(formatBacktestReport(report, {
    broker: opt.marginTag,
    equity: opt.equity,
    extraNotes,
    strategy: getStrategy(opt.strategy).label,
  }));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("Backtest gagal:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
