/**
 * Halaman History H3 (9 Okt 2026) — helper tampilan MURNI.
 * Halaman dibuka di tab baru: `/?halaman=history&broker=finex|orbitraderberjangka`.
 */
import type { BrokerId } from "../types/broker";

export type HistoryKind = "live" | "demo";

export interface HistoryAccountLike {
  readonly login: string;
  readonly label: string;
  readonly broker: BrokerId | null;
  readonly kind: HistoryKind | null;
}

export const HISTORY_PAGE_PARAM = "halaman";

export function historyPageUrl(broker: BrokerId): string {
  return `/?${HISTORY_PAGE_PARAM}=history&broker=${broker}`;
}

/** Baca query halaman; null = dashboard biasa. */
export function parseHistoryPage(search: string): { broker: BrokerId } | null {
  const q = new URLSearchParams(search);
  if (q.get(HISTORY_PAGE_PARAM) !== "history") return null;
  const b = q.get("broker");
  if (b === "finex" || b === "orbitraderberjangka") return { broker: b };
  return null;
}

/** Akun live & demo milik satu broker (yang pertama bila lebih dari satu). */
export function accountsForBroker(
  accounts: readonly HistoryAccountLike[],
  broker: BrokerId,
): Record<HistoryKind, HistoryAccountLike | null> {
  const mine = accounts.filter((a) => a.broker === broker);
  return {
    live: mine.find((a) => a.kind === "live") ?? null,
    demo: mine.find((a) => a.kind === "demo") ?? null,
  };
}

/** USD gaya Indonesia, 2 desimal: -10.05 → "-10,05"; 5000 → "5.000,00". */
export function formatUsd(n: number): string {
  return n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rupiah bulat bertanda: -180273 → "-Rp180.273"; null → "–". */
export function formatIdr(n: number | null): string {
  if (n === null) return "–";
  const abs = Math.round(Math.abs(n)).toLocaleString("id-ID");
  return `${n < 0 ? "-" : ""}Rp${abs}`;
}

/** Kolom Type & Direction ala MT5 (huruf kecil). */
export function mt5TypeText(type: string): string {
  return type.toLowerCase();
}
export function mt5DirectionText(type: string, entry: string): string {
  if (type === "BALANCE" || type === "CREDIT") return "";
  return entry.toLowerCase().replace("_", " ");
}
