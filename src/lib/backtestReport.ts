/**
 * B3 (12 Okt 2026) — RAPOR ALAT UJI DATA LAMA. MODUL MURNI.
 *
 * Merangkum hasil runBacktest (satu atau beberapa simbol) menjadi angka
 * yang bisa dibaca orang awam: tingkat menang vs titik impas, hasil bersih
 * Rupiah setelah komisi, rugi beruntun terpanjang, dan turun terdalam.
 *
 * Data dibagi menurut WAKTU: bagian awal = data LATIH (boleh dipakai
 * menyetel aturan), bagian akhir = data UJIAN (tidak boleh diintip saat
 * menyetel). Strategi hanya "layak diuji di demo" bila untung di KEDUA
 * bagian dan masing-masing punya bukti minimal MIN_PROVEN_TRADES trade.
 *
 * Kurs USD→Rp memakai SATU angka dari pemanggil (kurs ECB terkini), bukan
 * kurs per tanggal — cukup untuk menilai strategi, bukan untuk pajak.
 */
import { candleTimeMs, type ScanRiskHold, type ScanStatus } from "./symbolScanner";
import { MIN_PROVEN_TRADES } from "./evaluationView";
import { RISK_GROUPS, riskGroupOf } from "./riskGroup";
import {
  BACKTEST_SKIPPED_GUARDS,
  type BacktestOutcome,
  type BacktestRun,
  type BacktestTrade,
  type CostHeldTrade,
} from "./backtest";

/** Porsi waktu untuk data latih (sisanya data ujian). */
export const BACKTEST_TRAIN_FRACTION = 0.7;

/**
 * B5a (12 Okt 2026): tingkat menang wajib MINIMAL sekian di atas titik impas
 * (0,03 = 3 poin persen). Untung tapi di bawah ini = "TIPIS" (bisa kebetulan).
 */
export const MIN_EDGE_OVER_BREAKEVEN = 0.03;

/**
 * B5b (12 Okt 2026): turun terdalam maksimal 25% modal → modal minimal =
 * turun terdalam ÷ 0,25 (= 4×). Modal di bawahnya = "MODAL_KURANG".
 */
export const MAX_DRAWDOWN_SHARE_OF_CAPITAL = 0.25;

/**
 * B5d (12 Okt 2026): "modal agar sinyal tidak ditahan risiko" memakai
 * persentil 80% — modal yang membuat 80% sinyal tertahan bisa lolos.
 */
export const SIGNAL_CAPITAL_COVERAGE = 0.8;

export interface SignalCapitalNeed {
  /** Modal (USD) agar 80% sinyal yang ditahan risiko bisa lolos; null = tidak ada/ tak bisa. */
  readonly signalCapitalUsd: number | null;
  /** Jam ditahan risiko yang BISA diatasi dengan menambah modal. */
  readonly fixableHolds: number;
  /** Jam ditahan karena batas golongan Rupiah — modal berapa pun tidak membantu. */
  readonly unfixableHolds: number;
}

/** Modal minimal per sinyal = risiko lot minimum ÷ persen risiko (hanya bila <= batas golongan). */
export function capitalForSignals(holds: readonly ScanRiskHold[]): SignalCapitalNeed {
  const needs: number[] = [];
  let unfixable = 0;
  for (const h of holds) {
    if (h.capUsd === null || h.riskAtMinLotUsd > h.capUsd || !(h.riskPercent > 0)) {
      unfixable += 1;
      continue;
    }
    needs.push(h.riskAtMinLotUsd / (h.riskPercent / 100));
  }
  needs.sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(needs.length * SIGNAL_CAPITAL_COVERAGE) - 1);
  return {
    signalCapitalUsd: needs.length > 0 ? Math.ceil(needs[idx] * 100) / 100 : null,
    fixableHolds: needs.length,
    unfixableHolds: unfixable,
  };
}

export interface CapitalTopUp {
  /** Modal total yang dibutuhkan (USD). */
  readonly neededUsd: number;
  readonly neededIdr: number | null;
  /** Dana yang perlu DITAMBAHKAN (0 = modal sudah cukup). */
  readonly topUpUsd: number;
  readonly topUpIdr: number | null;
}

/**
 * Dana tambahan = yang terbesar dari (a) modal agar sinyal tidak ditahan
 * risiko, (b) modal agar turun terdalam <= 25% modal — dikurangi modal kini.
 * null = belum bisa dihitung (tanpa sinyal & tanpa trade).
 */
export function capitalTopUp(
  equityUsd: number,
  signalCapitalUsd: number | null,
  drawdownCapitalIdr: number | null,
  usdIdr: number | null,
): CapitalTopUp | null {
  const kurs = usdIdr !== null && usdIdr > 0 ? usdIdr : null;
  const fromDrawdown = drawdownCapitalIdr !== null && kurs !== null ? drawdownCapitalIdr / kurs : null;
  const parts = [signalCapitalUsd, fromDrawdown].filter((v): v is number => v !== null && v > 0);
  if (parts.length === 0) return null;
  const neededUsd = Math.ceil(Math.max(...parts) * 100) / 100;
  const topUpUsd = Math.max(0, Math.ceil((neededUsd - equityUsd) * 100) / 100);
  return {
    neededUsd,
    neededIdr: kurs === null ? null : Math.ceil(neededUsd * kurs),
    topUpUsd,
    topUpIdr: kurs === null ? null : Math.ceil(topUpUsd * kurs),
  };
}

export type SegmentVerdict = "BELUM_CUKUP" | "UNTUNG" | "TIPIS" | "RUGI";
export type BacktestVerdict = "BELUM_CUKUP" | "LAYAK_DEMO" | "TIDAK_LAYAK" | "MODAL_KURANG";

export interface BacktestSegment {
  /** Trade yang sudah tutup (TERBUKA tidak dihitung). */
  readonly n: number;
  readonly wins: number;
  /** 0..1; null bila n = 0. */
  readonly winRate: number | null;
  /** Tingkat menang minimum agar tidak rugi (0..1); null bila belum bisa dihitung. */
  readonly breakEvenWinRate: number | null;
  /** B5a: tingkat menang − titik impas (0..1); null bila belum bisa dihitung. */
  readonly edge: number | null;
  readonly outcomes: Readonly<Record<Exclude<BacktestOutcome, "TERBUKA">, number>>;
  readonly totalUsd: number;
  /** null bila kurs Rupiah tidak tersedia. */
  readonly totalIdr: number | null;
  readonly expectancyIdr: number | null;
  readonly avgWinIdr: number | null;
  readonly avgLossIdr: number | null;
  readonly worstLosingStreak: number;
  /** Turun terdalam dari puncak saldo uji (Rupiah, angka positif). */
  readonly maxDrawdownIdr: number | null;
  readonly verdict: SegmentVerdict;
}

export interface BacktestReport {
  readonly symbols: readonly string[];
  readonly startTime: string;
  readonly endTime: string;
  /** Batas waktu latih | ujian. */
  readonly splitTime: string;
  readonly usdIdr: number | null;
  readonly all: BacktestSegment;
  readonly latih: BacktestSegment;
  readonly ujian: BacktestSegment;
  /** Posisi yang masih terbuka saat data habis (tidak dihitung). */
  readonly openAtEnd: number;
  /** B5b: modal minimal (Rp) agar turun terdalam <= 25% modal; null bila tak terhitung. */
  readonly requiredCapitalIdr: number | null;
  /** B5b: modal yang dinilai (Rp); null = tidak dicek. */
  readonly capitalIdr: number | null;
  /** B5d: jumlah jam per status pemindai (semua simbol). */
  readonly statusTotals: Readonly<Partial<Record<ScanStatus, number>>>;
  /** B5d: modal agar sinyal yang ditahan risiko bisa lolos. */
  readonly signalCapital: SignalCapitalNeed;
  readonly verdict: BacktestVerdict;
  readonly verdictText: string;
  readonly skippedGuards: readonly string[];
  readonly notes: readonly string[];
}

function rupiah(usd: number, usdIdr: number | null): number | null {
  return usdIdr === null ? null : Math.round(usd * usdIdr);
}

export function summarizeTrades(
  trades: readonly BacktestTrade[],
  usdIdr: number | null,
): BacktestSegment {
  const closed = trades.filter((t) => t.outcome !== "TERBUKA");
  const n = closed.length;
  const winsList = closed.filter((t) => t.netUsd > 0);
  const lossList = closed.filter((t) => t.netUsd <= 0);
  const totalUsd = Math.round(closed.reduce((a, t) => a + t.netUsd, 0) * 100) / 100;
  const avgWinUsd = winsList.length > 0 ? winsList.reduce((a, t) => a + t.netUsd, 0) / winsList.length : null;
  const avgLossUsd = lossList.length > 0 ? Math.abs(lossList.reduce((a, t) => a + t.netUsd, 0)) / lossList.length : null;
  const breakEvenWinRate =
    avgWinUsd !== null && avgLossUsd !== null && avgWinUsd + avgLossUsd > 0
      ? avgLossUsd / (avgWinUsd + avgLossUsd)
      : null;

  let streak = 0;
  let worst = 0;
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const t of closed) {
    streak = t.netUsd <= 0 ? streak + 1 : 0;
    worst = Math.max(worst, streak);
    equity += t.netUsd;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  const count = (o: BacktestOutcome): number => closed.filter((t) => t.outcome === o).length;
  const expectancyUsd = n > 0 ? totalUsd / n : null;
  const winRate = n > 0 ? winsList.length / n : null;
  const edge = winRate !== null && breakEvenWinRate !== null ? winRate - breakEvenWinRate : null;
  return {
    n,
    wins: winsList.length,
    winRate,
    breakEvenWinRate,
    edge,
    outcomes: { TP: count("TP"), SL: count("SL"), WAKTU: count("WAKTU") },
    totalUsd,
    totalIdr: rupiah(totalUsd, usdIdr),
    expectancyIdr: expectancyUsd === null ? null : rupiah(expectancyUsd, usdIdr),
    avgWinIdr: avgWinUsd === null ? null : rupiah(avgWinUsd, usdIdr),
    avgLossIdr: avgLossUsd === null ? null : rupiah(avgLossUsd, usdIdr),
    worstLosingStreak: worst,
    maxDrawdownIdr: rupiah(Math.round(drawdown * 100) / 100, usdIdr),
    verdict:
      n < MIN_PROVEN_TRADES
        ? "BELUM_CUKUP"
        : totalUsd <= 0
          ? "RUGI"
          : edge === null || edge < MIN_EDGE_OVER_BREAKEVEN
            ? "TIPIS"
            : "UNTUNG",
  };
}

function formatMs(ms: number): string {
  const d = new Date(ms);
  const p = (v: number): string => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Rapor gabungan beberapa simbol (urut jam tutup trade). */
export function buildBacktestReport(
  runs: readonly BacktestRun[],
  usdIdr: number | null,
  trainFraction: number = BACKTEST_TRAIN_FRACTION,
  /** B5b: modal (USD) yang dinilai; absen/null = cek modal dilewati (dicatat). */
  equityUsd: number | null = null,
): BacktestReport {
  const ok = runs.filter((r) => r.error === null);
  const kurs = usdIdr !== null && Number.isFinite(usdIdr) && usdIdr > 0 ? usdIdr : null;
  const starts = ok.map((r) => candleTimeMs(r.startTime)).filter((v): v is number => v !== null);
  const ends = ok.map((r) => candleTimeMs(r.endTime)).filter((v): v is number => v !== null);
  const startMs = starts.length > 0 ? Math.min(...starts) : null;
  const endMs = ends.length > 0 ? Math.max(...ends) : null;
  const splitMs = startMs !== null && endMs !== null ? startMs + (endMs - startMs) * trainFraction : null;

  const trades = ok
    .flatMap((r) => r.trades)
    .slice()
    .sort((a, b) => (candleTimeMs(a.exitTime) ?? 0) - (candleTimeMs(b.exitTime) ?? 0));
  const isTrain = (t: BacktestTrade): boolean =>
    splitMs !== null && (candleTimeMs(t.signalTime) ?? Number.POSITIVE_INFINITY) < splitMs;
  const latih = summarizeTrades(trades.filter(isTrain), kurs);
  const ujian = summarizeTrades(trades.filter((t) => !isTrain(t)), kurs);

  const all = summarizeTrades(trades, kurs);
  const requiredCapitalIdr =
    all.maxDrawdownIdr === null || all.n === 0 ? null : Math.ceil(all.maxDrawdownIdr / MAX_DRAWDOWN_SHARE_OF_CAPITAL);
  const statusTotals: Partial<Record<ScanStatus, number>> = {};
  for (const r of ok) {
    for (const [k, v] of Object.entries(r.statusCount) as Array<[ScanStatus, number | undefined]>) {
      statusTotals[k] = (statusTotals[k] ?? 0) + (v ?? 0);
    }
  }
  const signalCapital = capitalForSignals(ok.flatMap((r) => r.riskHolds ?? []));
  // Tanpa bukti trade karena sinyal ditahan modal kecil → vonis MODAL_KURANG (bukan "belum cukup").
  const heldByCapital =
    all.n < MIN_PROVEN_TRADES &&
    signalCapital.signalCapitalUsd !== null &&
    equityUsd !== null &&
    signalCapital.signalCapitalUsd > equityUsd;
  const capitalIdr = equityUsd !== null && kurs !== null ? Math.round(equityUsd * kurs) : null;
  const tipis = latih.verdict === "TIPIS" || ujian.verdict === "TIPIS";
  const verdict: BacktestVerdict =
    heldByCapital
      ? "MODAL_KURANG"
      : latih.verdict === "BELUM_CUKUP" || ujian.verdict === "BELUM_CUKUP"
      ? "BELUM_CUKUP"
      : latih.verdict !== "UNTUNG" || ujian.verdict !== "UNTUNG"
        ? "TIDAK_LAYAK"
        : capitalIdr !== null && requiredCapitalIdr !== null && capitalIdr < requiredCapitalIdr
          ? "MODAL_KURANG"
          : "LAYAK_DEMO";
  const pct = (v: number): string => `${Math.round(v * 100)} poin`;
  const verdictText =
    verdict === "LAYAK_DEMO"
      ? `Untung jelas (≥ ${pct(MIN_EDGE_OVER_BREAKEVEN)} di atas titik impas) di data latih DAN data ujian — layak dicoba di akun demo (belum di akun live).`
      : verdict === "MODAL_KURANG" && heldByCapital
        ? `Sinyal ada (${signalCapital.fixableHolds} candle) tetapi DITAHAN: modal terlalu kecil untuk lot minimum broker — strategi belum bisa dinilai dengan modal ini.`
      : verdict === "MODAL_KURANG"
        ? `Strategi lulus, tetapi modal terlalu kecil: turun terdalam butuh modal minimal Rp${(requiredCapitalIdr ?? 0).toLocaleString("id-ID")} — JANGAN dipakai dengan modal ini.`
        : verdict === "TIDAK_LAYAK"
          ? tipis && latih.verdict !== "RUGI" && ujian.verdict !== "RUGI"
            ? `Untung terlalu TIPIS (< ${pct(MIN_EDGE_OVER_BREAKEVEN)} di atas titik impas) — bisa kebetulan; jangan dipakai, tetap TUNGGU.`
            : "Rugi atau untung terlalu tipis di data latih/ujian — jangan dipakai; tetap TUNGGU."
          : `Bukti belum cukup (minimal ${MIN_PROVEN_TRADES} trade di latih DAN ujian) — belum bisa dinilai.`;

  const notes: string[] = [
    "Spread dianggap tetap (spread masa lalu tidak tercatat MT5).",
    "Slippage tidak dihitung; swap menginap dihitung dari mode broker (Finex: swap mati = 0).",
    ...(() => {
      const unknown = trades.filter((t) => t.outcome !== "TERBUKA" && t.swapUsd === null).length;
      return unknown > 0 ? [`Swap tidak bisa dihitung untuk ${unknown} trade (dianggap 0).`] : [];
    })(),
    kurs === null
      ? "Kurs Rupiah tidak tersedia — hasil hanya dalam USD."
      : `Kurs tetap Rp${Math.round(kurs).toLocaleString("id-ID")}/USD untuk semua trade.`,
    ...(capitalIdr === null ? ["Cek modal dilewati (modal/kurs tidak diberikan)."] : []),
  ];
  for (const r of runs) {
    if (r.error !== null) notes.push(`${r.symbol}: ${r.error}`);
  }

  return {
    symbols: runs.map((r) => r.symbol),
    startTime: startMs === null ? "" : formatMs(startMs),
    endTime: endMs === null ? "" : formatMs(endMs),
    splitTime: splitMs === null ? "" : formatMs(splitMs),
    usdIdr: kurs,
    all,
    latih,
    ujian,
    openAtEnd: trades.filter((t) => t.outcome === "TERBUKA").length,
    requiredCapitalIdr,
    capitalIdr,
    statusTotals,
    signalCapital,
    verdict,
    verdictText,
    skippedGuards: BACKTEST_SKIPPED_GUARDS,
    notes,
  };
}

/** PL-1: tingkat porsi biaya (batas Mode Aman 10%). */
export const COST_TIERS: readonly { readonly key: string; readonly from: number; readonly to: number }[] = [
  { key: "10–15%", from: 0.1, to: 0.15 },
  { key: "15–20%", from: 0.15, to: 0.2 },
  { key: "20–30%", from: 0.2, to: 0.3 },
  { key: "≥30%", from: 0.3, to: Number.POSITIVE_INFINITY },
];

export interface CostHeldRow {
  /** "FOREX · 10–15%" dst. */
  readonly key: string;
  readonly group: string;
  readonly tier: string;
  readonly n: number;
  readonly tp: number;
  readonly sl: number;
  readonly time: number;
  readonly avgR: number | null;
  readonly netUsd: number;
}

/**
 * PL-1 (13 Okt 2026, T-PELUANG tahap 1) — hasil "seandainya diambil" sinyal
 * DITAHAN_BIAYA per golongan × tingkat porsi biaya. Posisi TERBUKA (data habis)
 * dan porsi biaya tidak diketahui tidak dihitung. Hanya bahan bukti: gerbang
 * biaya 10% TIDAK berubah (aturan mutlak 2).
 */
export function summarizeCostHeld(runs: readonly BacktestRun[]): CostHeldRow[] {
  const acc = new Map<string, { group: string; tier: string; trades: CostHeldTrade[] }>();
  for (const run of runs) {
    const group = riskGroupOf(run.symbol).id;
    for (const t of run.costHeldTrades ?? []) {
      if (t.outcome === "TERBUKA" || t.costShareOfRisk === null) continue;
      const share = t.costShareOfRisk;
      const tier = COST_TIERS.find((c) => share >= c.from && share < c.to);
      if (tier === undefined) continue;
      const key = `${group} · ${tier.key}`;
      const cur = acc.get(key) ?? { group, tier: tier.key, trades: [] };
      cur.trades.push(t);
      acc.set(key, cur);
    }
  }
  const groupOrder = Object.keys(RISK_GROUPS);
  const tierOrder = COST_TIERS.map((c) => c.key);
  return [...acc.entries()]
    .map(([key, v]) => {
      const n = v.trades.length;
      return {
        key,
        group: v.group,
        tier: v.tier,
        n,
        tp: v.trades.filter((t) => t.outcome === "TP").length,
        sl: v.trades.filter((t) => t.outcome === "SL").length,
        time: v.trades.filter((t) => t.outcome === "WAKTU").length,
        avgR: n > 0 ? Math.round((v.trades.reduce((s, t) => s + t.rMultiple, 0) / n) * 100) / 100 : null,
        netUsd: Math.round(v.trades.reduce((s, t) => s + t.netUsd, 0) * 100) / 100,
      };
    })
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
}

/** Bagian rapor teks untuk `npm run backtest`. */
export function formatCostHeldSection(rows: readonly CostHeldRow[], usdIdr: number | null): string {
  const lines = [
    "Seandainya diambil — sinyal DITAHAN_BIAYA (PL-1, hanya bukti; gerbang biaya 10% tidak berubah)",
    "SL/TP dari usulan strategi sebelum gerbang; lot minimum broker; spread, komisi, dan swap ikut dihitung.",
  ];
  if (rows.length === 0) {
    lines.push("  Tidak ada sinyal ditahan biaya yang selesai disimulasikan.");
    return lines.join("\n");
  }
  for (const r of rows) {
    const rp = usdIdr === null ? "" : ` (≈Rp${Math.round(r.netUsd * usdIdr).toLocaleString("id-ID")})`;
    const proof = r.n >= MIN_PROVEN_TRADES ? "" : ` — belum cukup (${r.n}/${MIN_PROVEN_TRADES})`;
    lines.push(
      `  ${r.key.padEnd(24)} n=${String(r.n).padStart(3)}  TP ${r.tp} · SL ${r.sl} · waktu ${r.time}  rata-rata ${r.avgR === null ? "-" : `${r.avgR}R`}  bersih $${r.netUsd}${rp}${proof}`,
    );
  }
  return lines.join("\n");
}
