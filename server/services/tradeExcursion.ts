/**
 * Langkah 5a (Mode Aman, 8 Okt 2026) — MFE/MAE per trade dari arsip tick.
 *
 * MFE (Maximum Favorable Excursion) = gerak terbaik searah posisi selama
 * trade terbuka; MAE (Maximum Adverse Excursion) = gerak terburuk melawan.
 * Satuan selisih harga (positif = untung); R bila SL awal diketahui.
 *
 * - Harga yang dinilai = harga tutup posisi: BUY → bid, SELL → ask.
 * - Waktu dicocokkan lewat jam server MT5 (`ts_raw` tick vs openTime/
 *   closeTime History) → kebal salah offset zona `ts_utc`.
 * - Cakupan jujur: PENUH bila tick pertama ≤ 60 dtk setelah buka dan tick
 *   terakhir ≤ 60 dtk sebelum tutup; PARSIAL bila ada celah di ujung;
 *   TANPA_DATA bila tak satu tick pun dalam rentang.
 * - Fungsi murni: pemanggil menyaring tick per simbol (langkah 5b).
 */
export const EXCURSION_EDGE_TOLERANCE_SEC = 60;

export type ExcursionCoverage = "PENUH" | "PARSIAL" | "TANPA_DATA";

export interface ExcursionTrade {
  readonly side: "BUY" | "SELL";
  readonly openTime: string;
  readonly closeTime: string;
  readonly openPrice: number;
  readonly sl: number | null;
}

export interface ExcursionTick {
  readonly ts_raw: string;
  readonly bid: number;
  readonly ask: number;
}

export interface TradeExcursion {
  readonly coverage: ExcursionCoverage;
  readonly ticks: number;
  readonly firstTick: string | null;
  readonly lastTick: string | null;
  readonly mfe: number | null;
  readonly mae: number | null;
  readonly mfeAt: string | null;
  readonly maeAt: string | null;
  readonly mfeR: number | null;
  readonly maeR: number | null;
}

/** "YYYY.MM.DD HH:MM:SS" → ms (jam server; hanya untuk selisih). */
export function serverMs(time: string): number | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):?(\d{2})?/.exec(time.trim());
  if (m === null) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

/** Buang sisa float (0.0032799999999999496 → 0.00328). */
const clean = (v: number): number => Number(v.toPrecision(10));
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function computeExcursion(
  trade: ExcursionTrade,
  ticks: Iterable<ExcursionTick>,
): TradeExcursion {
  const openMs = serverMs(trade.openTime);
  const closeMs = serverMs(trade.closeTime);
  let n = 0;
  let firstMs = Infinity;
  let lastMs = -Infinity;
  let firstTick: string | null = null;
  let lastTick: string | null = null;
  let mfe = -Infinity;
  let mae = Infinity;
  let mfeAt: string | null = null;
  let maeAt: string | null = null;

  if (openMs !== null && closeMs !== null) {
    for (const t of ticks) {
      const ms = serverMs(t.ts_raw);
      if (ms === null || ms < openMs || ms > closeMs) continue;
      const px = trade.side === "BUY" ? t.bid : t.ask;
      if (!Number.isFinite(px) || px <= 0) continue;
      const move = trade.side === "BUY" ? px - trade.openPrice : trade.openPrice - px;
      n++;
      if (ms < firstMs) { firstMs = ms; firstTick = t.ts_raw; }
      if (ms > lastMs) { lastMs = ms; lastTick = t.ts_raw; }
      if (move > mfe) { mfe = move; mfeAt = t.ts_raw; }
      if (move < mae) { mae = move; maeAt = t.ts_raw; }
    }
  }

  if (n === 0 || openMs === null || closeMs === null) {
    return {
      coverage: "TANPA_DATA", ticks: 0, firstTick: null, lastTick: null,
      mfe: null, mae: null, mfeAt: null, maeAt: null, mfeR: null, maeR: null,
    };
  }

  const tol = EXCURSION_EDGE_TOLERANCE_SEC * 1000;
  const full = firstMs - openMs <= tol && closeMs - lastMs <= tol;
  const risk =
    trade.sl === null || trade.sl <= 0
      ? 0
      : trade.side === "BUY"
        ? trade.openPrice - trade.sl
        : trade.sl - trade.openPrice;
  return {
    coverage: full ? "PENUH" : "PARSIAL",
    ticks: n,
    firstTick,
    lastTick,
    mfe: clean(mfe),
    mae: clean(mae),
    mfeAt,
    maeAt,
    mfeR: risk > 0 ? round2(mfe / risk) : null,
    maeR: risk > 0 ? round2(mae / risk) : null,
  };
}
