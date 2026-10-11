/**
 * B4 (12 Okt 2026) — bagian MURNI perintah `npm run backtest`.
 * Membaca argumen, spread dari file Margin MT5, memilih simbol, dan
 * menyusun teks rapor. Baca/tulis file ada di scripts/backtest.ts.
 */
import type { BrokerId } from "../types/broker";
import type { BacktestReport, BacktestSegment } from "./backtestReport";
import { riskGroupOf, type RiskGroupId } from "./riskGroup";

export interface BacktestCliOptions {
  readonly brokerId: BrokerId;
  /** Nama file Margin MT5: MDBKA_Margin_<tag>.csv. */
  readonly marginTag: "Finex" | "OTB";
  readonly equity: number;
  /** null = semua golongan. */
  readonly groups: readonly RiskGroupId[] | null;
  /** null = semua simbol yang punya data. */
  readonly symbols: readonly string[] | null;
}

export type ParsedArgs =
  | { readonly ok: true; readonly options: BacktestCliOptions }
  | { readonly ok: false; readonly error: string };

export const BACKTEST_USAGE =
  "Pakai: npm run backtest -- --broker finex|otb --equity 10000 [--grup FOREX,FOREX_JPY] [--simbol GBPUSD,EURUSD]";

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
  let marginTag: "Finex" | "OTB";
  if (broker === "finex") {
    brokerId = "finex";
    marginTag = "Finex";
  } else if (broker === "otb" || broker === "orbitraderberjangka") {
    brokerId = "orbitraderberjangka";
    marginTag = "OTB";
  } else if (broker === "mifx") {
    return { ok: false, error: "MIFX belum didukung: belum ada file MDBKA_Margin_MIFX.csv (sumber spread)." };
  } else {
    return { ok: false, error: `Broker wajib finex atau otb. ${BACKTEST_USAGE}` };
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
  return { ok: true, options: { brokerId, marginTag, equity, groups, symbols: list(get("--simbol")) } };
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

function segmentLines(label: string, s: BacktestSegment): string[] {
  return [
    `${label}`,
    `  Trade tutup        : ${s.n} (TP ${s.outcomes.TP} · SL ${s.outcomes.SL} · batas waktu ${s.outcomes.WAKTU})`,
    `  Tingkat menang     : ${pct(s.winRate)}  |  titik impas: ${pct(s.breakEvenWinRate)}`,
    `  Hasil bersih       : ${rp(s.totalIdr)}  (rata-rata ${rp(s.expectancyIdr)} per trade)`,
    `  Rata menang / rugi : ${rp(s.avgWinIdr)} / ${rp(s.avgLossIdr)}`,
    `  Rugi beruntun maks : ${s.worstLosingStreak} kali  |  turun terdalam: ${rp(s.maxDrawdownIdr)}`,
    `  Penilaian          : ${s.verdict === "UNTUNG" ? "UNTUNG" : s.verdict === "RUGI" ? "RUGI" : "BELUM CUKUP BUKTI"}`,
  ];
}

export function formatBacktestReport(
  report: BacktestReport,
  head: { readonly broker: string; readonly equity: number; readonly extraNotes: readonly string[] },
): string {
  const lines = [
    "=================== RAPOR UJI DATA LAMA MDBKA ===================",
    `Broker ${head.broker} · equity anggapan $${head.equity} · ${report.symbols.length} simbol`,
    `Periode ${report.startTime} s/d ${report.endTime} · batas latih|ujian ${report.splitTime}`,
    "",
    ...segmentLines("DATA LATIH (bagian awal)", report.latih),
    "",
    ...segmentLines("DATA UJIAN (bagian akhir)", report.ujian),
    "",
    `VONIS: ${report.verdict === "LAYAK_DEMO" ? "LAYAK DICOBA DI DEMO" : report.verdict === "TIDAK_LAYAK" ? "TIDAK LAYAK" : "BELUM CUKUP BUKTI"}`,
    `  ${report.verdictText}`,
    "",
    `Posisi masih terbuka saat data habis (tidak dihitung): ${report.openAtEnd}`,
    `Satpam TIDAK ikut diuji: ${report.skippedGuards.join(", ")}`,
    "Catatan:",
    ...[...report.notes, ...head.extraNotes].map((n) => `  - ${n}`),
    "=================================================================",
  ];
  return lines.join("\n");
}
