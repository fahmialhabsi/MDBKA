/**
 * Butir 1 G1 (9 Okt 2026) — halaman per golongan. MURNI.
 * `/?halaman=golongan&broker=finex|orbitraderberjangka&grup=FOREX&symbol=GBPUSD`
 * Tab golongan di atas, tab simbol ala MT5 (posisi terbuka di depan),
 * metrik akun Balance/Equity/Margin/Free Margin/Margin Level (USD + Rp).
 */
import type { BrokerId } from "../types/broker";
import { riskGroupOf, type RiskGroupId } from "./riskGroup";

export const GROUP_TABS: readonly { readonly id: RiskGroupId; readonly label: string }[] = [
  { id: "FOREX", label: "Forex" },
  { id: "FOREX_JPY", label: "Forex JPY" },
  { id: "LOGAM", label: "Logam" },
  { id: "MINYAK", label: "Minyak" },
  { id: "SAHAM_AS", label: "Saham AS" },
  { id: "INDEKS", label: "Indeks" },
];

export interface GroupPageParams {
  readonly broker: BrokerId;
  readonly group: RiskGroupId;
  readonly symbol: string;
}

export function groupPageUrl(p: { broker: BrokerId; group?: RiskGroupId; symbol?: string }): string {
  const q = new URLSearchParams({ halaman: "golongan", broker: p.broker });
  if (p.group) q.set("grup", p.group);
  if (p.symbol) q.set("symbol", p.symbol);
  return `/?${q.toString()}`;
}

export function parseGroupPage(search: string): GroupPageParams | null {
  const q = new URLSearchParams(search);
  if (q.get("halaman") !== "golongan") return null;
  const broker: BrokerId = q.get("broker") === "orbitraderberjangka" ? "orbitraderberjangka" : "finex";
  const g = q.get("grup");
  const group = GROUP_TABS.find((t) => t.id === g)?.id ?? "FOREX";
  return { broker, group, symbol: (q.get("symbol") ?? "").trim().toUpperCase() };
}

export interface SymbolTab {
  readonly symbol: string;
  /** Jumlah posisi terbuka simbol ini (0 = tidak ada). */
  readonly openCount: number;
}

/**
 * Tab simbol satu golongan: semua simbol Market Watch golongan itu, yang
 * punya posisi terbuka di depan (lalu urut abjad). Simbol posisi yang tak
 * ada di Market Watch tetap ikut (posisi tidak boleh tersembunyi).
 */
export function groupSymbolTabs(
  marketWatch: readonly string[],
  openSymbols: readonly string[],
  group: RiskGroupId,
): SymbolTab[] {
  const counts = new Map<string, number>();
  for (const s of openSymbols) {
    const k = s.trim().toUpperCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const all = new Set<string>();
  for (const s of [...marketWatch, ...counts.keys()]) {
    const k = s.trim().toUpperCase();
    if (k !== "" && riskGroupOf(k).id === group) all.add(k);
  }
  return [...all]
    .map((symbol) => ({ symbol, openCount: counts.get(symbol) ?? 0 }))
    .sort((a, b) => (b.openCount > 0 ? 1 : 0) - (a.openCount > 0 ? 1 : 0) || a.symbol.localeCompare(b.symbol));
}

export interface AccountMetric {
  readonly label: string;
  readonly usd: number | null;
  readonly idr: number | null;
  /** Margin Level: persen, bukan uang. */
  readonly percent?: number | null;
}

/** Metrik akun ala baris Toolbox MT5 (USD + Rupiah). Nilai absen → null (jujur). */
export function accountMetrics(
  eq: {
    readonly balance: number;
    readonly equity: number;
    readonly margin?: number;
    readonly freeMargin?: number;
    readonly marginLevel?: number;
  } | null,
  usdIdr: number | null,
): AccountMetric[] {
  const idr = (v: number | null | undefined): number | null =>
    v === null || v === undefined || usdIdr === null ? null : Math.round(v * usdIdr);
  const val = (v: number | undefined): number | null => (v === undefined ? null : v);
  return [
    { label: "Balance", usd: eq?.balance ?? null, idr: idr(eq?.balance) },
    { label: "Equity", usd: eq?.equity ?? null, idr: idr(eq?.equity) },
    { label: "Margin", usd: val(eq?.margin), idr: idr(eq?.margin) },
    { label: "Free Margin", usd: val(eq?.freeMargin), idr: idr(eq?.freeMargin) },
    { label: "Margin Level", usd: null, idr: null, percent: eq?.marginLevel ?? null },
  ];
}
