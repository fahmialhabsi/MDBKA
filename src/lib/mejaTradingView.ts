import { BROKER_IDS } from "./brokerRegistry";
import type { BrokerId } from "../types/broker";

/** Halaman Meja Trading (17 Okt 2026): `/?halaman=meja[&broker=finex]`. MURNI. */
export function mejaTradingUrl(broker: BrokerId | null): string {
  const q = new URLSearchParams({ halaman: "meja" });
  if (broker !== null) q.set("broker", broker);
  return `/?${q.toString()}`;
}

export function parseMejaTradingPage(search: string): { readonly broker: BrokerId } | null {
  const q = new URLSearchParams(search);
  if (q.get("halaman") !== "meja") return null;
  const b = q.get("broker");
  const broker = BROKER_IDS.find((id) => id === b) ?? "finex";
  return { broker };
}
