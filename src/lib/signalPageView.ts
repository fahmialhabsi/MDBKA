/**
 * Butir 3 P2 (9 Okt 2026) — halaman detail sinyal pemindai. MURNI.
 * URL: `/?halaman=sinyal&broker=finex&symbol=EURUSD&equity=4965.95`
 * (equity = nilai yang dipakai pemindai, agar lot & risiko sama).
 */
import type { BrokerId } from "../types/broker";
import { parseBrokerParam } from "./brokerRegistry";

export interface SignalPageParams {
  readonly broker: BrokerId;
  readonly symbol: string;
  readonly equity: number;
}

export function signalPageUrl(broker: BrokerId, symbol: string, equity: number): string {
  const q = new URLSearchParams({
    halaman: "sinyal",
    broker,
    symbol,
    equity: Number.isFinite(equity) && equity > 0 ? String(equity) : "0",
  });
  return `/?${q.toString()}`;
}

export function parseSignalPage(search: string): SignalPageParams | null {
  const q = new URLSearchParams(search);
  if (q.get("halaman") !== "sinyal") return null;
  const broker = parseBrokerParam(q.get("broker"));
  const symbol = (q.get("symbol") ?? "").trim();
  const equity = Number(q.get("equity") ?? "0");
  if (broker === null || symbol === "") return null;
  return { broker, symbol, equity: Number.isFinite(equity) && equity > 0 ? equity : 0 };
}
