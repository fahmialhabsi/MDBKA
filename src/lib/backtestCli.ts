/**
 * B4 (12 Okt 2026) — bagian MURNI perintah `npm run backtest`.
 * Membaca argumen, spread dari file Margin MT5, memilih simbol, dan
 * menyusun teks rapor. Baca/tulis file ada di scripts/backtest.ts.
 */
import type { BrokerId } from "../types/broker";
import type { BacktestReport, BacktestSegment, BacktestVerdict, CapitalTopUp } from "./backtestReport";
import { riskGroupOf, type RiskGroupId } from "./riskGroup";
import { DEFAULT_STRATEGY_ID, parseStrategyId, STRATEGY_IDS, type StrategyId } from "./strategyRegistry";

export interface BacktestCliOptions {
  readonly brokerId: BrokerId;
  /** Nama file Margin MT5: MDBKA_Margin_<tag>.csv. */
  readonly marginTag: "Finex" | "OTB" | "MIFX";
  readonly equity: number;
  /** null = semua golongan. */
  readonly groups: readonly RiskGroupId[] | null;
  /** null = semua simbol yang punya data. */
  readonly symbols: readonly string[] | null;
  /** S2: strategi yang diuji (default "skor"). */
  readonly strategy: StrategyId;
  /** E1: percobaan batas waktu Forex (jam); absen = 3 jam (live); null = tanpa batas. */
  readonly timeStopHours?: number | null;
  /** E2: timeframe uji (H1 = data asli; H4 = dirakit dari H1). */
  readonly timeframe: "H1" | "H4";
}

export type ParsedArgs =
  | { readonly ok: true; readonly options: BacktestCliOptions }
  | { readonly ok: false; readonly error: string };

export const BACKTEST_USAGE =
  "Pakai: npm run backtest -- --broker finex|otb|mifx --equity 10000 [--grup FOREX,FOREX_JPY] [--simbol GBPUSD,EURUSD] [--strategi skor] [--batas-waktu 3|6|12|0] [--timeframe H1|H4]";

const GROUP_IDS: readonly RiskGroupId[] = [
  "FOREX", "FOREX_JPY", "FOREX_TIDAK_LAZIM", "LOGAM", "MINYAK", "INDEKS",
  "SAHAM_AS", "SAHAM_LAIN", "LAINNYA",
];

export function parseBacktestArgs(argv: readonly string[]): ParsedArgs {
  const get = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1].trim() : null;
  };
  const broker = (get("--broker") ?? "").toLowerCase();
  let brokerId: BrokerId;
  let marginTag: "Finex" | "OTB" | "MIFX";
  if (broker === "finex") {
    brokerId = "finex";
    marginTag = "Finex";
  } else if (broker === "otb" || broker === "orbitraderberjangka") {
    brokerId = "orbitraderberjangka";
    marginTag = "OTB";
  } else if (broker === "mifx") {
    // E2c (12 Okt 2026): spread dari MDBKA_Margin_MIFX.csv (ExportMarginMDBKA di terminal MIFX).
    brokerId = "mifx";
    marginTag = "MIFX";
  } else {
    return { ok: false, error: `Broker wajib finex, otb, atau mifx. ${BACKTEST_USAGE}` };
  }
  const equity = Number(get("--equity") ?? "");
  if (!Number.isFinite(equity) || equity <= 0) {
    return { ok: false, error: `Equity wajib angka > 0 (USD). ${BACKTEST_USAGE}` };
  }
  const list = (raw: string | null): string[] | null =>
    raw === null || raw === "" ? null : raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  const groupsRaw = list(get("--grup"));
  let groups: RiskGroupId[] | null = null;
  if (groupsRaw !== null) {
    const upper = groupsRaw.map((g) => g.toUpperCase());
    const bad = upper.filter((g) => !GROUP_IDS.includes(g as RiskGroupId));
    if (bad.length > 0) return { ok: false, error: `Golongan tidak dikenal: ${bad.join(", ")}. Pilihan: ${GROUP_IDS.join(", ")}` };
    groups = upper as RiskGroupId[];
  }
  const strategyRaw = get("--strategi");
  const strategy = strategyRaw === null ? DEFAULT_STRATEGY_ID : parseStrategyId(strategyRaw);
  if (strategy === null) {
    return { ok: false, error: `Strategi tidak dikenal: ${strategyRaw ?? ""}. Pilihan: ${STRATEGY_IDS.join(", ")}` };
  }
  const tsRaw = get("--batas-waktu");
  let timeStopHours: number | null | undefined;
  if (tsRaw !== null) {
    const h = Number(tsRaw);
    if (!Number.isInteger(h) || h < 0 || h > 240) {
      return { ok: false, error: `Batas waktu wajib bilangan jam 0–240 (0 = tanpa batas). ${BACKTEST_USAGE}` };
    }
    timeStopHours = h === 0 ? null : h;
  }
  const tfRaw = (get("--timeframe") ?? "H1").toUpperCase();
  if (tfRaw !== "H1" && tfRaw !== "H4") {
    return { ok: false, error: `Timeframe wajib H1 atau H4. ${BACKTEST_USAGE}` };
  }
  const timeframe: "H1" | "H4" = tfRaw;
  return {
    ok: true,
    options: {
      brokerId, marginTag, equity, groups, symbols: list(get("--simbol")), strategy, timeframe,
      ...(timeStopHours !== undefined ? { timeStopHours } : {}),
    },
  };
}

/** Spread per simbol (Ask − Bid) dari MDBKA_Margin_<broker>.csv. */
export function parseSpreadsFromMargin(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 3) continue;
    const symbol = cols[0].trim();
    const ask = Number(cols[1]);
    const bid = Number(cols[2]);
    if (symbol !== "" && Number.isFinite(ask) && Number.isFinite(bid) && ask > bid && bid > 0) {
      out.set(symbol, Number((ask - bid).toPrecision(12)));
    }
  }
  return out;
}

/** Simbol yang diuji: punya spread DAN file _H1_LONG.csv, sesuai filter. */
export function pickBacktestSymbols(
  spreads: ReadonlyMap<string, number>,
  hasLongFile: (symbol: string) => boolean,
  options: Pick<BacktestCliOptions, "groups" | "symbols">,
): { symbols: string[]; notes: string[] } {
  const notes: string[] = [];
  const wanted = options.symbols?.map((s) => s.toUpperCase()) ?? null;
  const symbols: string[] = [];
  for (const symbol of [...spreads.keys()].sort()) {
    if (wanted !== null && !wanted.includes(symbol.toUpperCase())) continue;
    if (options.groups !== null && !options.groups.includes(riskGroupOf(symbol).id)) continue;
    if (!hasLongFile(symbol)) {
      notes.push(`${symbol}: file MDBKA_${symbol}_H1_LONG.csv belum ada (jalankan ExportLongH1MDBKA)`);
      continue;
    }
    symbols.push(symbol);
  }
  if (wanted !== null) {
    for (const w of wanted) {
      if (![...spreads.keys()].some((s) => s.toUpperCase() === w)) notes.push(`${w}: tidak ada di file Margin (spread tidak diketahui)`);
    }
  }
  return { symbols, notes };
}

function rp(v: number | null): string {
  if (v === null) return "-";
  const s = `Rp${Math.abs(v).toLocaleString("id-ID")}`;
  return v < 0 ? `−${s}` : s;
}

function pct(v: number | null): string {
  return v === null ? "-" : `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  LOLOS: "lolos (jadi trade)",
  TUNGGU: "tunggu (tak ada pola)",
  DITAHAN_RISIKO: "ditahan risiko/modal",
  DITAHAN_BIAYA: "ditahan biaya",
  DATA: "data belum lengkap",
  PASAR_TUTUP: "pasar tutup",
};

function usd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** B5d: baris "jam per status" + modal yang dibutuhkan + dana tambahan. */
export function capitalLines(
  report: BacktestReport,
  equityUsd: number,
  topUp: CapitalTopUp | null,
  retestEquityUsd: number | null,
  /**
   * Vonis strategi SAAT modal cukup (uji ulang bila ada, selain itu rapor utama).
   * TIDAK_LAYAK → dana tambahan TIDAK disarankan (hanya memperbesar rugi).
   */
  judged: { readonly verdict: BacktestVerdict; readonly totalIdr: number | null } | null = null,
): string[] {
  const totals = Object.entries(report.statusTotals)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => `${STATUS_LABEL[k] ?? k} ${(v ?? 0).toLocaleString("id-ID")}`);
  const sc = report.signalCapital;
  const lines = [`Candle per status   : ${totals.length > 0 ? totals.join(" · ") : "-"}`];
  if (sc.signalCapitalUsd !== null) {
    lines.push(`Modal agar 80% sinyal tak ditahan risiko: ${usd(sc.signalCapitalUsd)} (dari ${sc.fixableHolds.toLocaleString("id-ID")} candle ditahan)`);
  }
  if (sc.unfixableHolds > 0) {
    lines.push(`${sc.unfixableHolds.toLocaleString("id-ID")} candle ditahan BATAS GOLONGAN Rupiah — tidak bisa diatasi dengan menambah modal.`);
  }
  if (retestEquityUsd !== null) {
    lines.push(`(Diuji ulang otomatis dengan modal ${usd(retestEquityUsd)} untuk menghitung turun terdalam.)`);
  }
  if (judged !== null && judged.verdict === "TIDAK_LAYAK") {
    lines.push(
      `DANA TAMBAHAN       : JANGAN menambah dana. Dengan modal cukup pun strategi ini ${judged.totalIdr !== null && judged.totalIdr > 0 ? "UNTUNG TERLALU TIPIS (bisa kebetulan)" : "RUGI"}${judged.totalIdr !== null ? ` (hasil uji ${rp(judged.totalIdr)})` : ""} —`,
      "                      menambah dana hanya memperbesar kerugian. Tetap TUNGGU.",
    );
  } else if (topUp === null) {
    lines.push("DANA TAMBAHAN       : belum bisa dihitung (tidak ada sinyal maupun trade).");
  } else if (topUp.topUpUsd <= 0) {
    lines.push(`DANA TAMBAHAN       : tidak perlu — modal ${usd(equityUsd)} sudah >= kebutuhan ${usd(topUp.neededUsd)}.`);
  } else {
    lines.push(
      `DANA TAMBAHAN       : Anda perlu menambah modal ${usd(topUp.topUpUsd)} (${rp(topUp.topUpIdr)})`,
      `                      → total modal ${usd(topUp.neededUsd)} (${rp(topUp.neededIdr)}).`,
      "                      Catatan: modal cukup BUKAN berarti strategi untung — lihat VONIS.",
    );
  }
  return lines;
}

function segmentLines(label: string, s: BacktestSegment): string[] {
  return [
    `${label}`,
    `  Trade tutup        : ${s.n} (TP ${s.outcomes.TP} · SL ${s.outcomes.SL} · batas waktu ${s.outcomes.WAKTU})`,
    `  Tingkat menang     : ${pct(s.winRate)}  |  titik impas: ${pct(s.breakEvenWinRate)}  |  selisih: ${s.edge === null ? "-" : `${s.edge >= 0 ? "+" : "−"}${(Math.abs(s.edge) * 100).toFixed(1).replace(".", ",")} poin`}`,
    `  Hasil bersih       : ${rp(s.totalIdr)}  (rata-rata ${rp(s.expectancyIdr)} per trade)`,
    `  Rata menang / rugi : ${rp(s.avgWinIdr)} / ${rp(s.avgLossIdr)}`,
    `  Rugi beruntun maks : ${s.worstLosingStreak} kali  |  turun terdalam: ${rp(s.maxDrawdownIdr)}`,
    `  Penilaian          : ${s.verdict === "UNTUNG" ? "UNTUNG" : s.verdict === "RUGI" ? "RUGI" : s.verdict === "TIPIS" ? "UNTUNG TIPIS (bisa kebetulan)" : "BELUM CUKUP BUKTI"}`,
  ];
}

export function formatBacktestReport(
  report: BacktestReport,
  head: {
    readonly broker: string;
    readonly equity: number;
    readonly extraNotes: readonly string[];
    /** S2: nama strategi yang diuji (absen = tidak ditulis). */
    readonly strategy?: string;
    /** E1: teks batas waktu percobaan (absen = tidak ditulis). */
    readonly timeStop?: string;
    /** E2: timeframe uji (absen = tidak ditulis). */
    readonly timeframe?: string;
    /** B5d: dana tambahan (absen = baris modal tidak ditulis). */
    readonly topUp?: CapitalTopUp | null;
    readonly retestEquityUsd?: number | null;
    readonly judged?: { readonly verdict: BacktestVerdict; readonly totalIdr: number | null } | null;
  },
): string {
  const lines = [
    "=================== RAPOR UJI DATA LAMA MDBKA ===================",
    `Broker ${head.broker} · equity anggapan $${head.equity} · ${report.symbols.length} simbol`,
    ...(head.strategy !== undefined ? [`Strategi: ${head.strategy}`] : []),
    ...(head.timeStop !== undefined ? [`Batas waktu Forex: ${head.timeStop}`] : []),
    ...(head.timeframe !== undefined ? [`Timeframe: ${head.timeframe}`] : []),
    `Periode ${report.startTime} s/d ${report.endTime} · batas latih|ujian ${report.splitTime}`,
    "",
    ...segmentLines("DATA LATIH (bagian awal)", report.latih),
    "",
    ...segmentLines("DATA UJIAN (bagian akhir)", report.ujian),
    "",
    `VONIS: ${report.verdict === "LAYAK_DEMO" ? "LAYAK DICOBA DI DEMO" : report.verdict === "TIDAK_LAYAK" ? "TIDAK LAYAK" : report.verdict === "MODAL_KURANG" ? "MODAL KURANG" : "BELUM CUKUP BUKTI"}`,
    `  ${report.verdictText}`,
    `Modal minimal (turun terdalam ≤ 25% modal): ${rp(report.requiredCapitalIdr)}  |  modal dinilai: ${rp(report.capitalIdr)}`,
    ...(head.topUp !== undefined ? capitalLines(report, head.equity, head.topUp, head.retestEquityUsd ?? null, head.judged ?? null) : []),
    "",
    `Posisi masih terbuka saat data habis (tidak dihitung): ${report.openAtEnd}`,
    `Satpam TIDAK ikut diuji: ${report.skippedGuards.join(", ")}`,
    "Catatan:",
    ...[...report.notes, ...head.extraNotes].map((n) => `  - ${n}`),
    "=================================================================",
  ];
  return lines.join("\n");
}
