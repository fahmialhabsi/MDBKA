/**
 * LAMPU-1 (15 Okt 2026) — status 3 lampu hijau per golongan (fondasi C5, K-8).
 * MURNI, tampilan saja; tidak mengubah keputusan dan tidak menyentuh Live.
 *  Lampu 1 (backtest): rapor tersimpan (`npm run backtest -- ... --simpan-lampu`)
 *    dengan equity akun Live; HIJAU bila vonis golongan LAYAK_DEMO (bukan
 *    MODAL_KURANG / TIDAK_LAYAK / BELUM_CUKUP).
 *  Lampu 2 (demo): rangkaian (kartu) akun DEMO yang open 1-nya entry setara Live
 *    (mode LIVE, J2): ≥ 20, rata-rata R > 0, rugi terbesar ≤ 1R (+ toleransi
 *    biaya LAMP2_LOSS_TOLERANCE_R, usulan — menunggu keputusan Fahmi), tanpa
 *    entry saat gerbang kualitas data menahan (status DATA).
 *  Lampu 3 (percobaan Live): baru dihitung setelah lampu 1 & 2 hijau: ≥ 20
 *    rangkaian akun LIVE, rata-rata R > 0 dan tidak lebih buruk dari demo > 0,2R.
 */
import { RISK_GROUPS } from "./riskGroup";

export const LAMP_MIN_SERIES = 20;
/** Usulan Claude: SL kena + spread/komisi sering memberi −1,01 s.d. −1,08R; menunggu keputusan Fahmi. */
export const LAMP2_LOSS_TOLERANCE_R = 0.1;
export const LAMP3_MAX_DROP_R = 0.2;

export type LampState = "HIJAU" | "MERAH" | "BELUM";

export interface LampCard {
  readonly group: string;
  readonly r: number | null;
  readonly complete: boolean;
  /** Dari baris keputusan entry open 1; tidak ada catatan = null. */
  readonly setaraLive: boolean | null;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti" | null;
  /** Open 1 dibuka saat pemindai berstatus DATA (gerbang kualitas data menahan). */
  readonly dataViolation: boolean;
}

export interface BacktestLampRow {
  readonly group: string;
  readonly verdict: "BELUM_CUKUP" | "LAYAK_DEMO" | "TIDAK_LAYAK" | "MODAL_KURANG";
  readonly equityUsd: number;
  readonly strategy: string;
  readonly broker: string;
  readonly dateUtc: string;
}

export interface Lamp {
  readonly state: LampState;
  readonly text: string;
}

export interface LampRow {
  readonly group: string;
  readonly label: string;
  readonly lamp1: Lamp;
  readonly lamp2: Lamp;
  readonly lamp3: Lamp;
}

const fmtR = (v: number): string => `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}R`;

function seriesStats(cards: readonly LampCard[]): { n: number; avg: number | null; worst: number | null } {
  const rs = cards.map((c) => c.r).filter((r): r is number => r !== null);
  if (rs.length === 0) return { n: 0, avg: null, worst: null };
  return { n: rs.length, avg: rs.reduce((s, r) => s + r, 0) / rs.length, worst: Math.min(...rs) };
}

function lamp1For(rows: readonly BacktestLampRow[]): Lamp {
  if (rows.length === 0) return { state: "BELUM", text: "Belum ada rapor backtest tersimpan (--simpan-lampu)" };
  const best = rows.find((r) => r.verdict === "LAYAK_DEMO");
  if (best !== undefined) return { state: "HIJAU", text: `LAYAK_DEMO · ${best.strategy} ${best.broker}, equity $${best.equityUsd} (${best.dateUtc.slice(0, 10)})` };
  const last = rows[rows.length - 1] as BacktestLampRow;
  return { state: last.verdict === "BELUM_CUKUP" ? "BELUM" : "MERAH", text: `${last.verdict} · ${last.strategy} ${last.broker}, equity $${last.equityUsd} (${last.dateUtc.slice(0, 10)})` };
}

function lamp2For(cards: readonly LampCard[]): { lamp: Lamp; avg: number | null } {
  const ok = cards.filter((c) => c.complete && c.jenisAkun === "demo" && c.setaraLive === true);
  const s = seriesStats(ok);
  const violations = ok.filter((c) => c.dataViolation).length;
  const base = `${s.n}/${LAMP_MIN_SERIES} rangkaian setara Live${s.avg === null ? "" : ` · rata-rata ${fmtR(s.avg)} · terburuk ${fmtR(s.worst ?? 0)}`}`;
  if (s.n < LAMP_MIN_SERIES || s.avg === null || s.worst === null) return { lamp: { state: "BELUM", text: base }, avg: s.avg };
  const reasons: string[] = [];
  if (!(s.avg > 0)) reasons.push("rata-rata ≤ 0");
  if (s.worst < -(1 + LAMP2_LOSS_TOLERANCE_R)) reasons.push("ada rugi > 1R");
  if (violations > 0) reasons.push(`${violations} entry saat data ditahan`);
  return { lamp: { state: reasons.length === 0 ? "HIJAU" : "MERAH", text: reasons.length === 0 ? base : `${base} · ${reasons.join(", ")}` }, avg: s.avg };
}

function lamp3For(cards: readonly LampCard[], ready: boolean, demoAvg: number | null): Lamp {
  if (!ready) return { state: "BELUM", text: "Menunggu lampu 1 & 2 hijau" };
  const s = seriesStats(cards.filter((c) => c.complete && c.jenisAkun === "live"));
  const base = `${s.n}/${LAMP_MIN_SERIES} rangkaian Live lot minimum${s.avg === null ? "" : ` · rata-rata ${fmtR(s.avg)}`}`;
  if (s.n < LAMP_MIN_SERIES || s.avg === null || demoAvg === null) return { state: "BELUM", text: base };
  const ok = s.avg > 0 && demoAvg - s.avg <= LAMP3_MAX_DROP_R;
  return { state: ok ? "HIJAU" : "MERAH", text: ok ? base : `${base} · ${s.avg > 0 ? "lebih buruk dari demo > 0,2R" : "rata-rata ≤ 0"}` };
}

/** Status 3 lampu untuk setiap golongan yang punya kartu atau rapor. */
export function lampRows(cards: readonly LampCard[], backtests: readonly BacktestLampRow[]): LampRow[] {
  const groups = new Set<string>([...cards.map((c) => c.group), ...backtests.map((b) => b.group)]);
  const order = Object.keys(RISK_GROUPS);
  return [...groups]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((group) => {
      const mine = cards.filter((c) => c.group === group);
      const lamp1 = lamp1For(backtests.filter((b) => b.group === group));
      const l2 = lamp2For(mine);
      const lamp3 = lamp3For(mine, lamp1.state === "HIJAU" && l2.lamp.state === "HIJAU", l2.avg);
      return { group, label: RISK_GROUPS[group as keyof typeof RISK_GROUPS]?.label ?? group, lamp1, lamp2: l2.lamp, lamp3 };
    });
}
