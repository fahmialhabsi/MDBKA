/** TB-1 (13 Okt 2026) — trade bayangan: mengikuti sinyal yang ditahan dengan harga nyata. Murni. */
import { TIME_STOP_HOURS, timeStopApplies } from "./exitMonitor";
import { serverTimeMs } from "./lossStreakGuard";
import type { ScanStatus } from "./symbolScanner";

export const DEFAULT_MAX_OBSERVE_HOURS = 120; // usulan rancangan; dikunci per versi aturan

export type ShadowOutcome = "TP" | "SL" | "WAKTU" | "BATAS_AMATAN" | "BERJALAN";

export interface ShadowTick {
  readonly tsServer: string; // jam server MT5 "YYYY.MM.DD HH:MM:SS"
  readonly bid: number;
  readonly ask: number;
}

export interface ShadowTradeInput {
  readonly symbol: string;
  readonly direction: "BELI" | "JUAL";
  readonly signalServerTime: string;
  readonly entry: number; // ask saat sinyal untuk BELI, bid untuk JUAL
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly heldBy: ScanStatus; // status penahan dari pemindai
  readonly maxObserveHours?: number; // default DEFAULT_MAX_OBSERVE_HOURS
}

export interface ShadowTradeResult {
  readonly outcome: ShadowOutcome;
  readonly exitServerTime: string | null;
  readonly exitPrice: number | null;
  readonly r: number | null; // dibulatkan 2 desimal; null untuk BATAS_AMATAN dan BERJALAN
  readonly maxFavorableR: number | null; // MFE dalam R, 2 desimal; null bila belum ada tick
  readonly maxAdverseR: number | null; // MAE dalam R (angka positif), 2 desimal
}

const HOUR_MS = 60 * 60 * 1000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPositivePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** null = sah; selain itu alasan. */
export function validateShadowInput(input: ShadowTradeInput): string | null {
  if (!isPositivePrice(input.entry) || !isPositivePrice(input.stopLoss) || !isPositivePrice(input.takeProfit)) {
    return "Harga entry, SL, dan TP harus angka lebih dari 0";
  }
  if (serverTimeMs(input.signalServerTime) === null) {
    return `Jam sinyal tidak terbaca: ${input.signalServerTime}`;
  }
  if (input.direction === "BELI" && !(input.stopLoss < input.entry && input.entry < input.takeProfit)) {
    return "BELI: harus SL < entry < TP";
  }
  if (input.direction === "JUAL" && !(input.takeProfit < input.entry && input.entry < input.stopLoss)) {
    return "JUAL: harus TP < entry < SL";
  }
  if (input.maxObserveHours !== undefined && !(Number.isFinite(input.maxObserveHours) && input.maxObserveHours > 0)) {
    return "Batas amatan harus angka jam lebih dari 0";
  }
  return null;
}

function rOf(input: ShadowTradeInput, price: number): number {
  return input.direction === "BELI"
    ? (price - input.entry) / (input.entry - input.stopLoss)
    : (input.entry - price) / (input.stopLoss - input.entry);
}

export function evaluateShadowTrade(input: ShadowTradeInput, ticks: readonly ShadowTick[]): ShadowTradeResult {
  const reason = validateShadowInput(input);
  const signalMs = serverTimeMs(input.signalServerTime);
  if (reason !== null || signalMs === null) throw new Error(reason ?? "Input trade bayangan tidak sah");

  const maxObserveMs = (input.maxObserveHours ?? DEFAULT_MAX_OBSERVE_HOURS) * HOUR_MS;
  const timeStopMs = timeStopApplies(input.symbol) ? TIME_STOP_HOURS * HOUR_MS : null;
  const isBuy = input.direction === "BELI";

  // Salin lalu urutkan; tick yang jamnya tidak terbaca atau <= jam sinyal diabaikan.
  const ordered = ticks
    .map((tick) => ({ tick, ms: serverTimeMs(tick.tsServer) }))
    .filter((item): item is { tick: ShadowTick; ms: number } => item.ms !== null && item.ms > signalMs)
    .sort((a, b) => a.ms - b.ms);

  let mfe: number | null = null;
  let mae: number | null = null;

  for (const { tick, ms } of ordered) {
    const price = isBuy ? tick.bid : tick.ask;
    if (!Number.isFinite(price)) continue;
    const tickR = rOf(input, price);
    mfe = mfe === null ? tickR : Math.max(mfe, tickR);
    mae = mae === null ? tickR : Math.min(mae, tickR);

    const finish = (outcome: ShadowOutcome, exitPrice: number | null): ShadowTradeResult => ({
      outcome,
      exitServerTime: tick.tsServer,
      exitPrice,
      r: exitPrice === null ? null : round2(rOf(input, exitPrice)),
      maxFavorableR: mfe === null ? null : round2(mfe),
      maxAdverseR: mae === null ? null : round2(Math.max(0, -mae)),
    });

    if (isBuy ? price <= input.stopLoss : price >= input.stopLoss) return finish("SL", input.stopLoss);
    if (isBuy ? price >= input.takeProfit : price <= input.takeProfit) return finish("TP", input.takeProfit);
    if (timeStopMs !== null && ms - signalMs >= timeStopMs) return finish("WAKTU", price);
    if (ms - signalMs >= maxObserveMs) return finish("BATAS_AMATAN", null);
  }

  return {
    outcome: "BERJALAN",
    exitServerTime: null,
    exitPrice: null,
    r: null,
    maxFavorableR: mfe === null ? null : round2(mfe),
    maxAdverseR: mae === null ? null : round2(Math.max(0, -mae)),
  };
}
