/**
 * K1/K2 (Tahap 17, 15 Okt 2026) — rangkaian + label kartu pola (rancangan alur
 * trader 7.7–7.8, K-5). MURNI, tampilan/bahan saja.
 *  - Rangkaian: posisi simbol SAMA dan arah SAMA yang dibuka dalam jendela
 *    3 jam sejak open 1 (siklus Tim 2). Arah berlawanan = rangkaian lain.
 *  - R rangkaian (K-5) = total bersih semua posisi (komisi + swap termasuk)
 *    ÷ risiko uang open 1. Risiko open 1 tidak diketahui = R null.
 *  - Label (disetujui Fahmi 13 Okt 2026): Kasbi Bakar ≥ +1R; Popeda Sagu
 *    > +0,1R s.d. < +1R; Sagu Tumang −0,1R s.d. +0,1R; Pupare Rebus < −0,1R
 *    (rugi kecil > −0,9R, rugi penuh ≤ −0,9R).
 *  - Nomor kartu per label urut waktu mulai: "Kasbi Bakar #0001".
 *  - Data tidak lengkap (R tidak diketahui / trade sebelum pencatatan) ditandai, tanpa angka karangan.
 */
import { isLegacyGroup, type EvalTrade } from "./evaluationView";
import { serverTimeMs } from "./lossStreakGuard";
import { WINDOW_HOURS } from "./monitorCycle";

export type SeriesLabel = "Kasbi Bakar" | "Popeda Sagu" | "Sagu Tumang" | "Pupare Rebus";

export const LABEL_BOUNDS = { full: 1, small: 0.1, fullLoss: -0.9 } as const;

export interface SeriesCard {
  /** "Kasbi Bakar #0001"; null bila R tidak diketahui. */
  readonly cardName: string | null;
  readonly label: SeriesLabel | null;
  /** "rugi kecil" / "rugi penuh" untuk Pupare Rebus; selain itu null. */
  readonly lossNote: "rugi kecil" | "rugi penuh" | null;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly startTime: string;
  readonly positions: readonly string[];
  readonly net: number;
  readonly riskOpen1: number | null;
  readonly r: number | null;
  readonly complete: boolean;
}

export function labelForR(r: number): SeriesLabel {
  if (r >= LABEL_BOUNDS.full) return "Kasbi Bakar";
  if (r > LABEL_BOUNDS.small) return "Popeda Sagu";
  if (r >= -LABEL_BOUNDS.small) return "Sagu Tumang";
  return "Pupare Rebus";
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Kelompokkan trade tertutup menjadi rangkaian + kartu berlabel (urut waktu mulai). */
export function buildSeriesCards(trades: readonly EvalTrade[]): SeriesCard[] {
  const sorted = trades
    .map((t) => ({ t, ms: serverTimeMs(t.openTime) }))
    .filter((x): x is { t: EvalTrade; ms: number } => x.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  const groups: { start: number; list: EvalTrade[] }[] = [];
  for (const { t, ms } of sorted) {
    const g = groups.find(
      (x) => x.list[0]?.symbol === t.symbol && x.list[0]?.side === t.side && ms - x.start <= WINDOW_HOURS * 3_600_000,
    );
    if (g === undefined) groups.push({ start: ms, list: [t] });
    else g.list.push(t);
  }
  const counters = new Map<SeriesLabel, number>();
  return groups.map(({ list }) => {
    const open1 = list[0] as EvalTrade;
    const net = round2(list.reduce((s, t) => s + t.net, 0));
    const risk = open1.riskMoney ?? null;
    const r = risk !== null && risk > 0 ? round2(net / risk) : null;
    const label = r === null ? null : labelForR(r);
    let cardName: string | null = null;
    if (label !== null) {
      const n = (counters.get(label) ?? 0) + 1;
      counters.set(label, n);
      cardName = `${label} #${String(n).padStart(4, "0")}`;
    }
    return {
      cardName,
      label,
      lossNote: label === "Pupare Rebus" && r !== null ? (r <= LABEL_BOUNDS.fullLoss ? "rugi penuh" : "rugi kecil") : null,
      symbol: open1.symbol,
      side: open1.side,
      startTime: open1.openTime,
      positions: list.map((t) => t.positionId),
      net,
      riskOpen1: risk,
      r,
      complete: r !== null && !list.some((t) => isLegacyGroup(t.group)),
    };
  });
}
