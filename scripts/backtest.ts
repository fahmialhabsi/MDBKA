/**
 * B4 (12 Okt 2026) — perintah `npm run backtest`.
 * Contoh: npm run backtest -- --broker finex --equity 10000 --grup FOREX,FOREX_JPY
 *
 * Bahan: Common\Files\MDBKA_<simbol>_H1_LONG.csv (ExportLongH1MDBKA),
 * spread dari Common\Files\MDBKA_Margin_<Finex|OTB>.csv, kurs USD→Rp dari
 * data/fx/ecb-usdidr.json. Hanya membaca, KECUALI --simpan-audit (T-AUDIT):
 * berkas perkara CSV ke data/audit/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCommonFilesDir } from "../server/routes/marginRoutes";
import { readUsdIdrBook, usdIdrOn } from "../server/services/ecbHistory";
import { FALLBACK_RATES, fetchECBRates } from "../src/services/fxRateService";
import { BACKTEST_WINDOW, runBacktest, type BacktestRun } from "../src/lib/backtest";
import { buildBacktestReport, capitalTopUp, formatCostHeldSection, formatGroupSection, groupReports, summarizeCostHeld } from "../src/lib/backtestReport";
import { getStrategy, STRATEGY_WINDOWS } from "../src/lib/strategyRegistry";
import { aggregateCandleCsv } from "../src/lib/candleAggregate";
import { auditCsv, buildDossiers, formatAuditSection, type TradeDossier } from "../src/lib/tradeAudit";
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
  // P4: topdown merakit D1/H4 sendiri dari H1 — timeframe lain akan salah.
  const window = STRATEGY_WINDOWS[opt.strategy];
  if (window !== undefined && opt.timeframe !== "H1") {
    console.error(`Strategi ${opt.strategy} hanya untuk data H1 (merakit D1/H4 sendiri). Hapus --timeframe ${opt.timeframe}.`);
    return 1;
  }
  const dir = resolveCommonFilesDir();
  const marginFile = join(dir, `MDBKA_Margin_${opt.marginTag}.csv`);
  if (!existsSync(marginFile)) {
    console.error(`File spread tidak ada: ${marginFile}. Jalankan ExportMarginMDBKA di terminal ${opt.marginTag}.`);
    return 1;
  }
  const spreads = parseSpreadsFromMargin(readFileSync(marginFile, "utf8"));
  const longFile = (s: string): string => join(dir, `MDBKA_${s}_H1_LONG.csv`);
  // E2b: H4 asli dari MT5 (ExportLongH1MDBKA InpPeriod=H4) didahulukan; tidak ada → dirakit dari H1.
  const h4File = (s: string): string => join(dir, `MDBKA_${s}_H4_LONG.csv`);
  const h4Native = (s: string): boolean => opt.timeframe === "H4" && existsSync(h4File(s));
  // E3: M15 hanya dari file asli MT5 (ExportLongH1MDBKA InpPeriod=M15) — tidak bisa dirakit dari H1.
  const m15File = (s: string): string => join(dir, `MDBKA_${s}_M15_LONG.csv`);
  const hasData = (s: string): boolean => existsSync(opt.timeframe === "M15" ? m15File(s) : longFile(s));
  const picked = pickBacktestSymbols(spreads, hasData, opt);
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
    ...(opt.timeframe === "H4"
      ? [`Sumber H4: ${picked.symbols.filter(h4Native).length} simbol file asli MT5, ${picked.symbols.filter((s) => !h4Native(s)).length} simbol dirakit dari H1.`]
      : []),
  ];
  const rates = kurs === null ? ecb : { ...ecb, IDR: kurs.rate * ecb.USD };

  // T-AUDIT: CSV yang diuji per simbol (berkas perkara memakai candle yang SAMA).
  const csvUsed = new Map<string, string>();
  const runAll = (equity: number, log: boolean): BacktestRun[] =>
    picked.symbols.map((symbol) => {
      const csv = opt.timeframe === "M15"
        ? readFileSync(m15File(symbol), "utf8")
        : h4Native(symbol)
        ? readFileSync(h4File(symbol), "utf8")
        : opt.timeframe === "H4"
          ? aggregateCandleCsv(readFileSync(longFile(symbol), "utf8"), 4)
          : readFileSync(longFile(symbol), "utf8");
      if (log) csvUsed.set(symbol, csv);
      const run = runBacktest({
        symbol,
        brokerId: opt.brokerId,
        csv,
        ...(opt.timeframe === "H4" ? { barHours: 4 } : opt.timeframe === "M15" ? { barHours: 0.25 } : {}),
        equity,
        fxRates: rates,
        spread: spreads.get(symbol) ?? 0,
        strategy: opt.strategy,
        ...(window !== undefined ? { window } : {}),
        ...(opt.timeStopHours !== undefined ? { timeStopHours: opt.timeStopHours } : {}),
      });
      if (log) console.log(`  ${symbol.padEnd(12)} ${run.error ?? `${run.trades.length} trade`}`);
      return run;
    });
  const usdIdr = kurs?.rate ?? null;
  const runs = runAll(opt.equity, true);
  const report = buildBacktestReport(runs, kurs?.rate ?? null, undefined, opt.equity);

  // B5d: modal agar sinyal tak ditahan risiko > modal kini → uji ulang dengan modal itu
  // untuk mengetahui turun terdalam (bahan modal minimal), lalu hitung dana tambahan.
  const signalCapital = report.signalCapital.signalCapitalUsd;
  let retestEquityUsd: number | null = null;
  let drawdownCapitalIdr = report.requiredCapitalIdr;
  let judged = { verdict: report.verdict, totalIdr: report.all.totalIdr };
  if (signalCapital !== null && signalCapital > opt.equity) {
    retestEquityUsd = signalCapital;
    console.log(`  (uji ulang dengan modal $${signalCapital} ...)`);
    const retest = buildBacktestReport(runAll(signalCapital, false), usdIdr, undefined, signalCapital);
    drawdownCapitalIdr = Math.max(drawdownCapitalIdr ?? 0, retest.requiredCapitalIdr ?? 0) || null;
    judged = { verdict: retest.verdict, totalIdr: retest.all.totalIdr };
  }
  const topUp = capitalTopUp(opt.equity, signalCapital, drawdownCapitalIdr, usdIdr);
  console.log("");
  console.log(formatBacktestReport(report, {
    broker: opt.marginTag,
    equity: opt.equity,
    extraNotes,
    strategy: getStrategy(opt.strategy).label,
    timeStop:
      opt.timeStopHours === undefined
        ? "3 jam (aturan live)"
        : opt.timeStopHours === null
          ? "TANPA batas (percobaan)"
          : `${opt.timeStopHours} jam (percobaan)`,
    timeframe: opt.timeframe === "H4" ? "H4 (dirakit dari 4 candle H1)" : opt.timeframe === "M15" ? "M15 (file asli MT5)" : "H1",
    topUp,
    retestEquityUsd,
    judged,
  }));
  // PL-1: hasil "seandainya diambil" sinyal yang ditahan biaya (bukti T-PELUANG).
  console.log("");
  console.log(formatCostHeldSection(summarizeCostHeld(runs), usdIdr));
  // T-AUDIT: berkas perkara setiap trade + sebab rugi + peringatan (fakta, bukan tafsiran).
  const dossiers: TradeDossier[] = runs.flatMap((run) =>
    run.error !== null
      ? []
      : buildDossiers({ symbol: run.symbol, csv: csvUsed.get(run.symbol) ?? "", trades: run.trades, window: window ?? BACKTEST_WINDOW, spread: spreads.get(run.symbol) ?? 0 }),
  ).map((d, i) => ({ ...d, no: i + 1 }));
  console.log("");
  console.log(formatAuditSection(dossiers));
  if (process.argv.includes("--simpan-audit")) {
    const dirAudit = join(process.cwd(), "data", "audit");
    mkdirSync(dirAudit, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const file = join(dirAudit, `audit-${opt.strategy}-${opt.brokerId}-${stamp}.csv`);
    writeFileSync(file, auditCsv(dossiers), "utf8");
    console.log(`  Berkas perkara disimpan: ${file}`);
  }
  // P5: vonis latih/ujian per golongan (bukti tidak dicampur antar golongan).
  console.log("");
  console.log(formatGroupSection(groupReports(runs, usdIdr)));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("Backtest gagal:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
