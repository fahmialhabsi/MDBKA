/**
 * T-AUDIT (13 Okt 2026) — TIM AUDIT TRADE. MURNI. Permintaan Fahmi:
 * "data dan fakta yang berbicara", bukan tafsiran.
 *
 * Untuk SETIAP trade (backtest sekarang; trade demo/live memakai pembangun
 * yang sama menyusul) disusun BERKAS PERKARA dari candle apa adanya:
 *   jam & harga masuk, SL, TP, R:R rencana, porsi biaya, posisi indikator
 *   (MA50, RSI, CCI, MACD, ATR H1/H4), arah D1 + angkanya, pola H4
 *   (level, jam tembus, jam uji ulang), level harian kemarin, jam & hari,
 *   lalu perjalanan harga sampai keluar: MFE/MAE (R), jam ke MFE, sempat
 *   +0,5R / +1R, hasil, R, USD.
 * Sebab rugi diberi kode dengan aturan pasti (tanpa tafsiran).
 * Peringatan = kelompok faktor yang rugi jauh di bawah rata-rata dengan
 * jumlah cukup (ambang dikunci di sini, sebelum melihat data).
 * Peringatan BUKAN perbaikan: setiap versi strategi baru wajib merujuk ID
 * peringatan (Buku Aturan `auditRujukan`) dan diuji ulang latih → ujian.
 */
import type { Candle } from "../calculations/swingDetector";
import { atrWilder, computeIndicators } from "../calculations/indicators";
import type { BacktestTrade } from "./backtest";
import { breakoutRetestAt } from "./breakoutRetest";
import { parseCsvCandles } from "./csvCandleParser";
import { aggregateDaily, d1Direction, dailyLevels } from "./dailyLevels";
import { CAUSE_ROUTES, type LossCause } from "./lossLesson";
import { candleTimeMs } from "./symbolScanner";
import { aggregateH4 } from "./topdownStrategy";

/** Ambang dikunci SEBELUM melihat data (bukan disetel agar hasil tampak bagus). */
export const AUDIT_RULES = {
  /** MFE < 0,3R lalu kena SL = langsung melawan sejak masuk. */
  againstMfeR: 0.3,
  /** MFE ≥ 0,5R lalu rugi = sempat untung lalu berbalik. */
  reversalMfeR: 0.5,
  /** Jarak SL < 0,5 × ATR H1 = SL terlalu dekat. */
  tightSlAtrH1: 0.5,
  /** Porsi biaya ≥ 10% risiko = biaya besar (sama dengan gerbang Mode Aman). */
  costShare: 0.1,
  /** Peringatan: n kelompok ≥ 5, menang ≥ 15 poin di bawah rata-rata, rata-rata R < 0. */
  warnMinN: 5,
  warnWinGap: 0.15,
} as const;

export interface TradeDossier {
  readonly no: number;
  readonly symbol: string;
  readonly direction: "BELI" | "JUAL";
  readonly signalTime: string;
  readonly hour: number | null;
  readonly weekday: string | null;
  readonly entry: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly rrPlan: number | null;
  readonly costShareOfRisk: number | null;
  readonly ma50: number | null;
  readonly rsi: number | null;
  readonly cci: number | null;
  readonly macd: number | null;
  readonly macdSignal: number | null;
  readonly atrH1: number | null;
  readonly atrH4: number | null;
  readonly priceVsMa50: "SEARAH" | "MELAWAN" | null;
  readonly macdSearah: boolean | null;
  readonly d1Direction: "NAIK" | "TURUN" | "NETRAL" | null;
  readonly d1DistAtr: number | null;
  readonly riskAtrH1: number | null;
  readonly riskAtrH4: number | null;
  readonly patternLevel: number | null;
  readonly breakoutTime: string | null;
  readonly retestTime: string | null;
  readonly breakoutToRetestBars: number | null;
  readonly prevHigh: number | null;
  readonly prevLow: number | null;
  /** Jarak ke level harian lawan (BELI: high kemarin di atas; JUAL: low kemarin di bawah) dalam R; null = tidak ada di depan. */
  readonly roomToDailyR: number | null;
  readonly outcome: string;
  readonly exitTime: string;
  readonly bars: number;
  readonly rMultiple: number;
  readonly netUsd: number;
  readonly mfeR: number | null;
  readonly maeR: number | null;
  readonly hoursToMfe: number | null;
  readonly reachedHalfR: boolean | null;
  readonly reachedOneR: boolean | null;
  readonly win: boolean;
  readonly lossCause: LossCause | "TANPA_SEBAB_PASTI" | null;
}

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const r2 = (v: number): number => Math.round(v * 100) / 100;

export interface DossierInput {
  readonly symbol: string;
  readonly csv: string;
  readonly trades: readonly BacktestTrade[];
  /** Jumlah candle yang dilihat mesin saat sinyal (sama dengan backtest). */
  readonly window: number;
  readonly spread: number;
}

export function buildDossiers(input: DossierInput): TradeDossier[] {
  const candles = parseCsvCandles(input.csv).candles;
  const indexOf = new Map<string, number>();
  candles.forEach((c, i) => indexOf.set(String(c.time ?? ""), i));
  const s = input.spread > 0 ? input.spread : 0;
  return input.trades.map((t, k) => {
    const at = indexOf.get(t.signalTime) ?? -1;
    const exitAt = indexOf.get(t.exitTime) ?? -1;
    const view: Candle[] = at >= 0 ? candles.slice(Math.max(0, at - input.window + 1), at + 1) : [];
    const ind = view.length > 0 ? computeIndicators(view) : null;
    const buy = t.direction === "BELI";
    const risk = Math.abs(t.entry - t.stopLoss);
    const d1 = view.length > 0 ? d1Direction(aggregateDaily(view)) : null;
    const h4 = view.length > 0 ? aggregateH4(view) : null;
    const atrH4 = h4 !== null ? atrWilder(h4.candles, 14) : null;
    const pattern = h4 !== null && h4.lastClosed ? breakoutRetestAt(h4.candles, atrH4) : null;
    const h4Index = (time: string | null): number => (time === null || h4 === null ? -1 : h4.candles.findIndex((c) => c.time === time));
    const levels = view.length > 0 ? dailyLevels(view) : null;
    const room =
      levels === null || risk <= 0
        ? null
        : buy
          ? levels.prevHigh !== null && levels.prevHigh > t.entry ? r2((levels.prevHigh - t.entry) / risk) : null
          : levels.prevLow !== null && levels.prevLow < t.entry ? r2((t.entry - levels.prevLow) / risk) : null;
    // Perjalanan harga: candle sesudah sinyal s/d candle keluar (BELI keluar di bid, JUAL di ask = candle + spread).
    let mfe: number | null = null;
    let mae: number | null = null;
    let mfeAt: number | null = null;
    if (at >= 0 && exitAt > at && risk > 0) {
      for (let i = at + 1; i <= exitAt; i++) {
        const c = candles[i];
        const fav = buy ? (c.high - t.entry) / risk : (t.entry - (c.low + s)) / risk;
        const adv = buy ? (t.entry - c.low) / risk : (c.high + s - t.entry) / risk;
        if (mfe === null || fav > mfe) {
          mfe = fav;
          mfeAt = i;
        }
        mae = mae === null ? adv : Math.max(mae, adv);
      }
    }
    const sigMs = candleTimeMs(t.signalTime);
    const mfeMs = mfeAt === null ? null : candleTimeMs(String(candles[mfeAt].time ?? ""));
    const date = sigMs === null ? null : new Date(sigMs);
    const close = view.length > 0 ? view[view.length - 1].close : null;
    const win = t.netUsd > 0;
    const partial: Omit<TradeDossier, "lossCause"> = {
      no: k + 1,
      symbol: input.symbol,
      direction: t.direction,
      signalTime: t.signalTime,
      hour: date === null ? null : date.getUTCHours(),
      weekday: date === null ? null : DAYS[date.getUTCDay()],
      entry: t.entry,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      rrPlan: risk > 0 ? r2(Math.abs(t.takeProfit - t.entry) / risk) : null,
      costShareOfRisk: t.costShareOfRisk ?? null,
      ma50: ind?.ma50 ?? null,
      rsi: ind === null ? null : r2(ind.rsi),
      cci: ind === null ? null : r2(ind.cci),
      macd: ind?.macd ?? null,
      macdSignal: ind?.macdSignal ?? null,
      atrH1: ind?.atr ?? null,
      atrH4: atrH4 === null ? null : r2(atrH4),
      priceVsMa50: ind === null || close === null ? null : (buy ? close > ind.ma50 : close < ind.ma50) ? "SEARAH" : "MELAWAN",
      macdSearah: ind === null ? null : buy ? ind.macd > ind.macdSignal : ind.macd < ind.macdSignal,
      d1Direction: d1?.direction ?? null,
      d1DistAtr: d1 === null ? null : r2((d1.close - d1.ma) / d1.atr),
      riskAtrH1: ind === null || !(ind.atr > 0) ? null : r2(risk / ind.atr),
      riskAtrH4: atrH4 === null || !(atrH4 > 0) ? null : r2(risk / atrH4),
      patternLevel: pattern?.level ?? null,
      breakoutTime: pattern?.breakoutTime ?? null,
      retestTime: pattern?.retestTime ?? null,
      breakoutToRetestBars: pattern === null ? null : h4Index(pattern.retestTime) - h4Index(pattern.breakoutTime),
      prevHigh: levels?.prevHigh ?? null,
      prevLow: levels?.prevLow ?? null,
      roomToDailyR: room,
      outcome: t.outcome,
      exitTime: t.exitTime,
      bars: t.bars,
      rMultiple: t.rMultiple,
      netUsd: t.netUsd,
      mfeR: mfe === null ? null : r2(mfe),
      maeR: mae === null ? null : r2(mae),
      hoursToMfe: sigMs === null || mfeMs === null ? null : Math.round((mfeMs - sigMs) / 3_600_000),
      reachedHalfR: mfe === null ? null : mfe >= 0.5,
      reachedOneR: mfe === null ? null : mfe >= 1,
      win,
    };
    return { ...partial, lossCause: win ? null : lossCauseOf(partial) };
  });
}

/** Sebab rugi dengan aturan pasti; urutan = prioritas. */
export function lossCauseOf(d: Omit<TradeDossier, "lossCause">): LossCause | "TANPA_SEBAB_PASTI" {
  const against = d.d1Direction !== null && ((d.direction === "BELI" && d.d1Direction !== "NAIK") || (d.direction === "JUAL" && d.d1Direction !== "TURUN"));
  if (against) return "MELAWAN_ARAH_D1";
  if (d.riskAtrH1 !== null && d.riskAtrH1 < AUDIT_RULES.tightSlAtrH1) return "SL_TERLALU_DEKAT";
  if (d.costShareOfRisk !== null && d.costShareOfRisk >= AUDIT_RULES.costShare) return "BIAYA_BESAR";
  if (d.mfeR !== null && d.mfeR >= AUDIT_RULES.reversalMfeR) return "BERBALIK_SETELAH_0_5R";
  if (d.mfeR !== null && d.mfeR < AUDIT_RULES.againstMfeR) return "MELAWAN_SEJAK_MASUK";
  return "TANPA_SEBAB_PASTI";
}

export interface FactorFinding {
  readonly id: string;
  readonly factor: string;
  readonly bucket: string;
  readonly n: number;
  readonly wins: number;
  readonly winRate: number;
  readonly avgR: number;
  readonly netUsd: number;
  readonly warning: boolean;
}

type Bucketer = (d: TradeDossier) => string | null;

/** Kelompok faktor — batas dikunci sebelum melihat data. */
export const AUDIT_FACTORS: ReadonlyArray<readonly [string, Bucketer]> = [
  ["arah", (d) => d.direction],
  ["simbol", (d) => d.symbol || null],
  ["rsi", (d) => (d.rsi === null ? null : d.rsi < 30 ? "<30" : d.rsi < 50 ? "30-50" : d.rsi < 70 ? "50-70" : "≥70")],
  ["harga_vs_ma50", (d) => d.priceVsMa50],
  ["macd_searah", (d) => (d.macdSearah === null ? null : d.macdSearah ? "ya" : "tidak")],
  ["jarak_d1_atr", (d) => (d.d1DistAtr === null ? null : Math.abs(d.d1DistAtr) < 0.5 ? "<0,5" : Math.abs(d.d1DistAtr) < 1.5 ? "0,5-1,5" : "≥1,5")],
  ["sl_atr_h4", (d) => (d.riskAtrH4 === null ? null : d.riskAtrH4 < 1 ? "<1" : d.riskAtrH4 < 2 ? "1-2" : "≥2")],
  ["ruang_ke_level_harian_r", (d) => (d.roomToDailyR === null ? "tidak_ada" : d.roomToDailyR < 1 ? "<1R" : d.roomToDailyR < 2 ? "1-2R" : "≥2R")],
  ["tembus_ke_uji_h4", (d) => (d.breakoutToRetestBars === null ? null : d.breakoutToRetestBars <= 2 ? "1-2" : d.breakoutToRetestBars <= 4 ? "3-4" : "5-6")],
  ["jam_server", (d) => (d.hour === null ? null : d.hour < 8 ? "00-07" : d.hour < 16 ? "08-15" : "16-23")],
  ["hari", (d) => d.weekday],
];

export function factorFindings(dossiers: readonly TradeDossier[]): FactorFinding[] {
  const n = dossiers.length;
  if (n === 0) return [];
  const overall = dossiers.filter((d) => d.win).length / n;
  const out: FactorFinding[] = [];
  for (const [factor, bucketOf] of AUDIT_FACTORS) {
    const groups = new Map<string, TradeDossier[]>();
    for (const d of dossiers) {
      const b = bucketOf(d);
      if (b === null) continue;
      groups.set(b, [...(groups.get(b) ?? []), d]);
    }
    for (const [bucket, list] of [...groups.entries()].sort()) {
      const wins = list.filter((d) => d.win).length;
      const winRate = wins / list.length;
      const avgR = r2(list.reduce((a, d) => a + d.rMultiple, 0) / list.length);
      out.push({
        id: `W-${factor}:${bucket}`,
        factor,
        bucket,
        n: list.length,
        wins,
        winRate,
        avgR,
        netUsd: r2(list.reduce((a, d) => a + d.netUsd, 0)),
        warning: list.length >= AUDIT_RULES.warnMinN && winRate <= overall - AUDIT_RULES.warnWinGap && avgR < 0,
      });
    }
  }
  return out;
}

export interface CauseCount {
  readonly cause: LossCause | "TANPA_SEBAB_PASTI";
  readonly n: number;
  readonly share: number;
  readonly rekomendasi: string | null;
  readonly penerima: readonly string[];
}

export function causeCounts(dossiers: readonly TradeDossier[]): CauseCount[] {
  const losers = dossiers.filter((d) => d.lossCause !== null);
  const map = new Map<CauseCount["cause"], number>();
  for (const d of losers) if (d.lossCause !== null) map.set(d.lossCause, (map.get(d.lossCause) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cause, n]) => ({
      cause,
      n,
      share: n / losers.length,
      rekomendasi: cause === "TANPA_SEBAB_PASTI" ? null : CAUSE_ROUTES[cause].rekomendasi,
      penerima: cause === "TANPA_SEBAB_PASTI" ? [] : CAUSE_ROUTES[cause].penerima,
    }));
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export function formatAuditSection(dossiers: readonly TradeDossier[]): string {
  const lines = ["TIM AUDIT TRADE (T-AUDIT) — fakta per trade, tanpa tafsiran"];
  if (dossiers.length === 0) {
    lines.push("  Tidak ada trade untuk diaudit.");
    return lines.join("\n");
  }
  const wins = dossiers.filter((d) => d.win).length;
  const mfeLosers = dossiers.filter((d) => !d.win && d.mfeR !== null).map((d) => d.mfeR ?? 0);
  lines.push(`  ${dossiers.length} trade · menang ${wins} (${pct(wins / dossiers.length)})`);
  if (mfeLosers.length > 0) {
    const sorted = [...mfeLosers].sort((a, b) => a - b);
    lines.push(`  Trade rugi: MFE median ${sorted[Math.floor(sorted.length / 2)]}R · sempat ≥ +0,5R: ${mfeLosers.filter((m) => m >= 0.5).length}/${mfeLosers.length} · sempat ≥ +1R: ${mfeLosers.filter((m) => m >= 1).length}/${mfeLosers.length}`);
  }
  lines.push("  Sebab rugi (aturan pasti):");
  for (const c of causeCounts(dossiers)) {
    lines.push(`    ${c.cause.padEnd(24)} ${c.n} (${pct(c.share)})${c.rekomendasi === null ? "" : ` → ${c.rekomendasi} [${c.penerima.join(", ")}]`}`);
  }
  const findings = factorFindings(dossiers);
  const warns = findings.filter((f) => f.warning);
  lines.push(`  PERINGATAN (n ≥ ${AUDIT_RULES.warnMinN}, menang ≥ ${Math.round(AUDIT_RULES.warnWinGap * 100)} poin di bawah rata-rata ${pct(wins / dossiers.length)}, rata-rata R < 0):`);
  if (warns.length === 0) lines.push("    Tidak ada — data belum menunjukkan kelompok yang jelas lebih buruk.");
  for (const w of warns) lines.push(`    ${w.id.padEnd(36)} n=${w.n} menang ${pct(w.winRate)} rata-rata ${w.avgR}R bersih $${w.netUsd}`);
  lines.push("  Aturan: versi strategi baru WAJIB merujuk ID peringatan di Buku Aturan (auditRujukan) dan diuji ulang latih → ujian.");
  lines.push("  Berkas perkara lengkap per trade: tambahkan --simpan-audit (CSV di data/audit/).");
  return lines.join("\n");
}

const CSV_COLS: readonly (keyof TradeDossier)[] = [
  "no", "symbol", "direction", "signalTime", "hour", "weekday", "entry", "stopLoss", "takeProfit", "rrPlan", "costShareOfRisk",
  "ma50", "rsi", "cci", "macd", "macdSignal", "atrH1", "atrH4", "priceVsMa50", "macdSearah", "d1Direction", "d1DistAtr",
  "riskAtrH1", "riskAtrH4", "patternLevel", "breakoutTime", "retestTime", "breakoutToRetestBars", "prevHigh", "prevLow",
  "roomToDailyR", "outcome", "exitTime", "bars", "rMultiple", "netUsd", "mfeR", "maeR", "hoursToMfe", "reachedHalfR",
  "reachedOneR", "win", "lossCause",
];

export function auditCsv(dossiers: readonly TradeDossier[]): string {
  const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/[,\n]/g, " "));
  return [CSV_COLS.join(","), ...dossiers.map((d) => CSV_COLS.map((c) => cell(d[c])).join(","))].join("\n") + "\n";
}
