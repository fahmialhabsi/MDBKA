import type { HistoryDeal } from "../types/historyCsv";
import type { TradeEntryRecord } from "./tradeEntryLog";

/**
 * Langkah 4c (Mode Aman, 8 Okt 2026) — evaluasi trade tertutup.
 *
 * Deal History MT5 dipasangkan per PositionId (IN ↔ OUT), digabung dengan
 * catatan entry 4b (tiket = PositionId) untuk SL awal + status pemindai
 * saat entry. Hasil bersih = profit + komisi + swap + fee (angka MT5 asli).
 * R dihitung dari harga (sebelum biaya) dan hanya bila SL awal diketahui.
 */
export type ExitReason = "TP" | "SL" | "MANUAL";

/** Kelompok status: status pemindai saat entry, atau alasan tanpa scan. */
export type EntryGroup = string;
export const GROUP_BEFORE_LOG = "SEBELUM_PENCATATAN";
export const GROUP_NO_LOG = "TANPA_CATATAN";

export interface EvaluatedTrade {
  readonly positionId: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly openPrice: number;
  readonly closePrice: number;
  readonly net: number;
  /** Langkah 5e: profit kotor MT5 (tanpa komisi/swap/fee) → USD per gerak harga untuk MFE/MAE Rupiah. */
  readonly grossProfit: number;
  readonly commission: number;
  readonly swap: number;
  readonly durationMin: number | null;
  readonly exit: ExitReason;
  readonly sl: number | null;
  readonly rMultiple: number | null;
  readonly group: EntryGroup;
}

export interface TradeStats {
  readonly n: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number | null;
  readonly net: number;
  readonly avgWin: number | null;
  readonly avgLoss: number | null;
  readonly expectancy: number | null;
  readonly avgR: number | null;
  readonly rCount: number;
}

export interface TradeEvaluation {
  readonly trades: readonly EvaluatedTrade[];
  readonly overall: TradeStats;
  readonly byGroup: Readonly<Record<EntryGroup, TradeStats>>;
  readonly bySymbol: Readonly<Record<string, TradeStats>>;
  readonly openPositions: number;
}

/** "YYYY.MM.DD HH:MM:SS" → ms (jam server; hanya untuk selisih). */
function serverMs(time: string): number | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):?(\d{2})?/.exec(time.trim());
  if (m === null) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

function exitReason(comment: string): ExitReason {
  const c = comment.trim().toLowerCase();
  if (c.startsWith("[tp")) return "TP";
  if (c.startsWith("[sl")) return "SL";
  return "MANUAL";
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
/** Buang sisa float pada rata-rata harga (111.09400000000001 → 111.094). */
const cleanPrice = (v: number): number => Number(v.toPrecision(10));

export function computeStats(trades: readonly EvaluatedTrade[]): TradeStats {
  const n = trades.length;
  const winList = trades.filter((t) => t.net > 0);
  const lossList = trades.filter((t) => t.net <= 0);
  const sum = (xs: readonly EvaluatedTrade[]): number =>
    xs.reduce((s, t) => s + t.net, 0);
  const withR = trades.filter((t) => t.rMultiple !== null);
  return {
    n,
    wins: winList.length,
    losses: lossList.length,
    winRate: n > 0 ? winList.length / n : null,
    net: round2(sum(trades)),
    avgWin: winList.length > 0 ? round2(sum(winList) / winList.length) : null,
    avgLoss: lossList.length > 0 ? round2(sum(lossList) / lossList.length) : null,
    expectancy: n > 0 ? round2(sum(trades) / n) : null,
    avgR:
      withR.length > 0
        ? Math.round((withR.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / withR.length) * 100) / 100
        : null,
    rCount: withR.length,
  };
}

function groupStats(
  trades: readonly EvaluatedTrade[],
  keyOf: (t: EvaluatedTrade) => string,
): Record<string, TradeStats> {
  const groups = new Map<string, EvaluatedTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: Record<string, TradeStats> = {};
  for (const [k, list] of groups) out[k] = computeStats(list);
  return out;
}

export function evaluateTrades(
  deals: readonly HistoryDeal[],
  entries: readonly TradeEntryRecord[],
): TradeEvaluation {
  const entryByTicket = new Map(entries.map((e) => [e.ticket, e]));
  const byPosition = new Map<string, HistoryDeal[]>();
  for (const d of deals) {
    if (d.type !== "BUY" && d.type !== "SELL") continue;
    if (d.positionId === "" || d.positionId === "0") continue;
    byPosition.set(d.positionId, [...(byPosition.get(d.positionId) ?? []), d]);
  }

  const trades: EvaluatedTrade[] = [];
  let openPositions = 0;
  for (const [positionId, list] of byPosition) {
    const ins = list.filter((d) => d.entry === "IN");
    const outs = list.filter((d) => d.entry === "OUT" || d.entry === "OUT_BY");
    const inVol = ins.reduce((s, d) => s + d.volume, 0);
    const outVol = outs.reduce((s, d) => s + d.volume, 0);
    if (ins.length === 0 || outs.length === 0 || outVol + 1e-9 < inVol) {
      openPositions++;
      continue;
    }
    const first = ins[0];
    const last = outs[outs.length - 1];
    const side = first.type as "BUY" | "SELL";
    const openPrice = cleanPrice(ins.reduce((s, d) => s + d.price * d.volume, 0) / inVol);
    const closePrice = cleanPrice(outs.reduce((s, d) => s + d.price * d.volume, 0) / outVol);
    const total = (k: "profit" | "commission" | "swap" | "fee"): number =>
      list.reduce((s, d) => s + d[k], 0);
    const net = total("profit") + total("commission") + total("swap") + total("fee");
    const openMs = serverMs(first.serverTime);
    const closeMs = serverMs(last.serverTime);
    const entry = entryByTicket.get(positionId);
    const sl = entry !== undefined && entry.sl > 0 ? entry.sl : null;
    const riskDist = sl === null ? 0 : side === "BUY" ? openPrice - sl : sl - openPrice;
    const move = side === "BUY" ? closePrice - openPrice : openPrice - closePrice;
    const group =
      entry === undefined
        ? GROUP_NO_LOG
        : entry.preExisting || entry.scan === null
          ? GROUP_BEFORE_LOG
          : entry.scan.status;
    trades.push({
      positionId,
      symbol: first.symbol,
      side,
      volume: inVol,
      openTime: first.serverTime,
      closeTime: last.serverTime,
      openPrice,
      closePrice,
      net: round2(net),
      grossProfit: round2(total("profit")),
      commission: round2(total("commission")),
      swap: round2(total("swap")),
      durationMin:
        openMs !== null && closeMs !== null ? Math.round((closeMs - openMs) / 60000) : null,
      exit: exitReason(last.comment),
      sl,
      rMultiple: riskDist > 0 ? Math.round((move / riskDist) * 100) / 100 : null,
      group,
    });
  }
  trades.sort((a, b) => b.closeTime.localeCompare(a.closeTime));

  return {
    trades,
    overall: computeStats(trades),
    byGroup: groupStats(trades, (t) => t.group),
    bySymbol: groupStats(trades, (t) => t.symbol),
    openPositions,
  };
}
