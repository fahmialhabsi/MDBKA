/**
 * P4 (13 Okt 2026) — STRATEGI "topdown": arah D1 ketat + breakout-retest H4.
 * MODUL MURNI. BACKTEST SAJA (status Buku Aturan UJI_DEMO). Rancangan alur
 * trader bagian 3 & keputusan bagian 6 (butir 1–5).
 *
 * BELI (JUAL = cermin):
 * 1. Arah D1 (dirakit dari H1, hari berjalan dibuang) = NAIK (d1Direction).
 *    D1 NETRAL / data kurang → TUNGGU.
 * 2. Candle H1 terakhir menutup satu blok H4 (jam server 03/07/11/15/19/23);
 *    selain itu TUNGGU (pola H4 hanya dinilai saat candle H4 tutup).
 * 3. Pola breakout-retest BELI pada candle H4 tertutup (breakoutRetestAt).
 * 4. SL = low candle retest − buffer broker; jarak SL dipaksa ≥ 0,5×ATR H4;
 *    > 3×ATR H4 → TUNGGU (terlalu lebar). TP = entry + 2× jarak SL.
 * Lot, batas Rupiah, gerbang biaya = applyRiskGates (rumus tunggal).
 *
 * Catatan jujur v1: pemicu = candle retest H4 itu sendiri (zona ±0,25×ATR di
 * dalam pola). Pemicu H1 terpisah dan angka bulat/level harian sebagai TP
 * belum dipakai. Butuh ±1.500 candle H1 (D1 ≥ 55 hari) → live 200 candle
 * selalu TUNGGU sampai ekspor D1 (F5).
 */
import type { StrategySetup } from "../calculations/decisionEngine";
import { atrWilder } from "../calculations/indicators";
import type { Candle } from "../calculations/swingDetector";
import type { BrokerSettings, MarketData } from "../types/analysis";
import { breakoutRetestAt } from "./breakoutRetest";
import { aggregateDaily, d1Direction } from "./dailyLevels";

export interface TopdownParams {
  readonly slMinAtr: number;
  readonly slMaxAtr: number;
  readonly rewardRisk: number;
}

export const TOPDOWN_PARAMS: TopdownParams = { slMinAtr: 0.5, slMaxAtr: 3, rewardRisk: 2 };

/** Jumlah candle H1 yang dilihat mesin tiap jam di backtest (D1 MA50 + kemiringan). */
export const TOPDOWN_WINDOW = 1500;

const TIME = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):/;

/** Rakit H4 dari H1 (blok 00/04/…/20 jam server); blok terakhir hanya bila lengkap s/d jam ke-4. */
export function aggregateH4(h1: readonly Candle[]): { readonly candles: Candle[]; readonly lastClosed: boolean } {
  const out: Candle[] = [];
  let key = "";
  let lastHour = -1;
  for (const c of h1) {
    const m = TIME.exec(c.time);
    if (m === null) continue;
    const hour = Number(m[4]);
    const block = Math.floor(hour / 4) * 4;
    const k = `${m[1]}.${m[2]}.${m[3]} ${String(block).padStart(2, "0")}:00`;
    const cur = out[out.length - 1];
    if (k !== key || cur === undefined) {
      out.push({ time: k, open: c.open, high: c.high, low: c.low, close: c.close });
      key = k;
    } else {
      out[out.length - 1] = { time: k, open: cur.open, high: Math.max(cur.high, c.high), low: Math.min(cur.low, c.low), close: c.close };
    }
    lastHour = hour;
  }
  const lastClosed = lastHour >= 0 && lastHour % 4 === 3;
  return { candles: lastClosed ? out : out.slice(0, -1), lastClosed };
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

export function topdownSetup(
  market: MarketData,
  broker: BrokerSettings,
  candles: readonly Candle[],
  p: TopdownParams = TOPDOWN_PARAMS,
): StrategySetup {
  const base = { score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0 };
  const wait = (why: string): StrategySetup => ({
    ...base, decision: "TUNGGU", entry: (market.bid + market.ask) / 2, stopLoss: null, takeProfit: null,
    riskDistance: null, targetDistance: null, factors: [why],
    waitWarning: "Top-down belum lengkap: arah D1 searah + breakout-retest H4 + candle penolakan.",
    waitExplanation: `Lebih baik menunggu: ${why}.`,
  });
  const d1 = d1Direction(aggregateDaily(candles));
  if (d1 === null) return wait("candle D1 belum cukup (butuh ≥ 55 hari)");
  if (d1.direction === "NETRAL") return wait(`arah D1 netral (${d1.reason})`);
  const h4 = aggregateH4(candles);
  if (!h4.lastClosed) return wait("menunggu candle H4 tutup");
  const atrH4 = atrWilder(h4.candles, 14);
  if (atrH4 === null || !(atrH4 > 0)) return wait("ATR H4 belum bisa dihitung");
  const pattern = breakoutRetestAt(h4.candles, atrH4);
  const want = d1.direction === "NAIK" ? "BELI" : "JUAL";
  if (pattern === null) return wait(`arah D1 ${d1.direction}, belum ada breakout-retest H4`);
  if (pattern.direction !== want) return wait(`pola ${pattern.direction} melawan arah D1 ${d1.direction}`);
  const retest = h4.candles[h4.candles.length - 1];
  const buy = want === "BELI";
  const entry = buy ? market.ask : market.bid;
  const rawSl = buy ? retest.low - broker.buffer : retest.high + broker.buffer;
  let risk = buy ? entry - rawSl : rawSl - entry;
  if (!(risk > 0)) return wait("harga sudah melewati ujung candle retest");
  if (risk > p.slMaxAtr * atrH4) return wait(`SL ${fmt(risk / atrH4)}× ATR H4 terlalu lebar (maks ${p.slMaxAtr}×)`);
  risk = Math.max(risk, p.slMinAtr * atrH4);
  const stopLoss = buy ? entry - risk : entry + risk;
  const takeProfit = buy ? entry + risk * p.rewardRisk : entry - risk * p.rewardRisk;
  return {
    ...base,
    decision: want,
    entry,
    stopLoss,
    takeProfit,
    riskDistance: risk,
    targetDistance: risk * p.rewardRisk,
    factors: [
      `Arah D1 ${d1.direction}: ${d1.reason}`,
      `Breakout-retest H4: ${pattern.reason}`,
      `SL ${fmt(risk / atrH4)}× ATR H4, TP = ${p.rewardRisk}× jarak SL`,
    ],
    waitWarning: "",
    waitExplanation: "",
  };
}
