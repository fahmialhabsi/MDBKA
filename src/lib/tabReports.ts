/**
 * TT-1/TT-2 (13 Okt 2026) — tim tab MT5 per jam: Trade, Exposure, Calendar
 * (rancangan tim bagian 4 & 7). Murni: hanya menilai data yang diberikan.
 * Tidak menahan sinyal dan tidak mengubah tampilan; hasilnya baris `laporan_tim`.
 */
import type { BrokerId } from "../types/broker";
import { timeStopApplies, TIME_STOP_HOURS } from "./exitMonitor";
import type { GuardEntry, LaporanTimRecord } from "./jsonlRecord";
import { serverTimeMs } from "./lossStreakGuard";
import { riskGroupOf } from "./riskGroup";

export interface TabPosition {
  readonly ticket: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly sl: number;
  readonly tp: number;
  readonly timeOpen: string;
  /** TT-4: harga buka (positions.csv); absen = saran titik impas tidak dinilai. */
  readonly priceOpen?: number;
}

export interface TabEquity {
  readonly balance: number;
  readonly equity: number;
  /** Dari equity.csv MDBKAMultiLive (8+ kolom); absen = EA lama. */
  readonly margin?: number;
  readonly freeMargin?: number;
  /** Persen; absen bila tanpa posisi (MT5 menulis 0). */
  readonly marginLevel?: number;
}

export interface TabCalendarEvent {
  readonly serverTime: string;
  readonly currency: string;
  readonly importance: string;
  readonly event: string;
  readonly actual: number | null;
  readonly forecast: number | null;
}

export interface TabFindings {
  readonly temuan: readonly string[];
  readonly kejadianPenting: boolean;
}

const HOUR_MS = 3_600_000;
/** Ambang tim Trade: rugi mengambang ≥ 5% saldo dianggap kejadian penting. */
export const FLOATING_LOSS_ALERT = 0.05;
/** Tim Calendar: berita Tinggi dalam 60 mnt ke depan dilaporkan, ≤ 30 mnt = penting. */
export const NEWS_AHEAD_MIN = 60;
export const NEWS_URGENT_MIN = 30;
/** Usulan: margin level < 200% = kejadian penting (margin call broker umumnya ±100%). */
export const MARGIN_LEVEL_ALERT = 200;

const fmt2 = (v: number): string => (Math.round(v * 100) / 100).toString().replace(".", ",");

/** Tim Trade: posisi tanpa SL, posisi melewati time-stop, rugi mengambang besar. */
export function tradeTabFindings(positions: readonly TabPosition[], equity: TabEquity | null, serverNow: string): TabFindings {
  const temuan: string[] = [];
  let penting = false;
  const nowMs = serverTimeMs(serverNow);
  temuan.push(`${positions.length} posisi terbuka`);
  for (const p of positions) {
    if (!(p.sl > 0)) {
      temuan.push(`#${p.ticket} ${p.symbol} ${p.side} tanpa SL`);
      penting = true;
    }
    const openMs = serverTimeMs(p.timeOpen);
    if (nowMs !== null && openMs !== null && timeStopApplies(p.symbol) && nowMs - openMs >= TIME_STOP_HOURS * HOUR_MS) {
      const jam = Math.floor((nowMs - openMs) / HOUR_MS);
      temuan.push(`#${p.ticket} ${p.symbol} terbuka ${jam} jam — melewati time-stop ${TIME_STOP_HOURS} jam`);
      penting = true;
    }
  }
  if (equity === null) {
    temuan.push("Equity tidak tersedia");
  } else if (equity.balance > 0) {
    const floating = equity.equity - equity.balance;
    const share = floating / equity.balance;
    temuan.push(`Equity $${fmt2(equity.equity)}, mengambang $${fmt2(floating)} (${fmt2(share * 100)}% saldo)`);
    if (share <= -FLOATING_LOSS_ALERT) penting = true;
  }
  if (equity !== null && equity.freeMargin !== undefined && equity.margin !== undefined) {
    // Koreksi 13 Okt: equity.csv MDBKAMultiLive SUDAH memuat margin (dulu keliru ditulis "belum tersedia").
    const level = equity.marginLevel;
    temuan.push(
      `Margin $${fmt2(equity.margin)}, free margin $${fmt2(equity.freeMargin)}` +
        (level === undefined ? " (tanpa posisi: margin level tidak terdefinisi)" : `, margin level ${fmt2(level)}%`),
    );
    if (level !== undefined && level < MARGIN_LEVEL_ALERT) penting = true;
  } else {
    temuan.push("Margin/free margin tidak ada di equity.csv (EA lama)");
  }
  return { temuan, kejadianPenting: penting };
}

/** "EURUSD" / "EURUSD.x" / "XAUUSDm" → [basis, kuotasi] bila pola 6 huruf mata uang; selain itu null. */
function currencyPair(symbol: string): readonly [string, string] | null {
  const m = /^([A-Z]{3})([A-Z]{3})/.exec(symbol.toUpperCase());
  if (m === null) return null;
  const group = riskGroupOf(symbol).id;
  return group === "FOREX" || group === "FOREX_JPY" || group === "FOREX_TIDAK_LAZIM" || group === "LOGAM" ? [m[1], m[2]] : null;
}

/**
 * Tim Exposure: eksposur bersih per mata uang dan per golongan dalam LOT
 * (bukan USD: nilai kontrak per simbol belum dipakai di sini — jujur).
 * Peringatan bila ≥ 2 posisi menumpuk ke arah yang sama pada satu mata uang.
 */
export function exposureTabFindings(positions: readonly TabPosition[]): TabFindings {
  const perCurrency = new Map<string, { net: number; count: number; sameSign: boolean; sign: number }>();
  const perGroup = new Map<string, { gross: number; net: number }>();
  const add = (ccy: string, lots: number): void => {
    const cur = perCurrency.get(ccy) ?? { net: 0, count: 0, sameSign: true, sign: 0 };
    const sign = Math.sign(lots);
    perCurrency.set(ccy, {
      net: cur.net + lots,
      count: cur.count + 1,
      sameSign: cur.sameSign && (cur.sign === 0 || cur.sign === sign),
      sign: cur.sign === 0 ? sign : cur.sign,
    });
  };
  for (const p of positions) {
    const dir = p.side === "BUY" ? 1 : -1;
    const group = riskGroupOf(p.symbol).id;
    const g = perGroup.get(group) ?? { gross: 0, net: 0 };
    perGroup.set(group, { gross: g.gross + p.volume, net: g.net + dir * p.volume });
    const pair = currencyPair(p.symbol);
    if (pair !== null) {
      add(pair[0], dir * p.volume);
      add(pair[1], -dir * p.volume);
    }
  }
  const temuan: string[] = [];
  let penting = false;
  for (const [group, g] of [...perGroup.entries()].sort()) {
    temuan.push(`${group}: kotor ${fmt2(g.gross)} lot, bersih ${fmt2(g.net)} lot`);
  }
  for (const [ccy, c] of [...perCurrency.entries()].sort()) {
    const text = `${ccy}: bersih ${fmt2(c.net)} lot (${c.count} kaki)`;
    if (c.count >= 2 && c.sameSign) {
      temuan.push(`${text} — menumpuk searah`);
      penting = true;
    } else {
      temuan.push(text);
    }
  }
  if (positions.length === 0) temuan.push("Tanpa eksposur");
  return { temuan, kejadianPenting: penting };
}

/** Tim Calendar: berita Tinggi 60 mnt ke depan + rilis 60 mnt terakhir (Actual vs Forecast). */
export function calendarTabFindings(events: readonly TabCalendarEvent[] | null, serverNow: string): TabFindings {
  if (events === null) return { temuan: ["Kalender tidak tersedia"], kejadianPenting: false };
  const nowMs = serverTimeMs(serverNow);
  if (nowMs === null) return { temuan: ["Jam server tidak terbaca"], kejadianPenting: false };
  const temuan: string[] = [];
  let penting = false;
  const sorted = [...events].sort((a, b) => (a.serverTime < b.serverTime ? -1 : a.serverTime > b.serverTime ? 1 : 0));
  for (const e of sorted) {
    if (e.importance !== "HIGH") continue;
    const ms = serverTimeMs(e.serverTime);
    if (ms === null) continue;
    const min = Math.round((ms - nowMs) / 60_000);
    if (min >= 0 && min <= NEWS_AHEAD_MIN) {
      temuan.push(`Berita Tinggi ${e.currency} "${e.event}" ${min} mnt lagi (${e.serverTime})`);
      if (min <= NEWS_URGENT_MIN) penting = true;
    } else if (min < 0 && min >= -NEWS_AHEAD_MIN) {
      const diff =
        e.actual !== null && e.forecast !== null
          ? `Actual ${fmt2(e.actual)} vs Forecast ${fmt2(e.forecast)} (selisih ${fmt2(e.actual - e.forecast)})`
          : "Actual/Forecast belum lengkap";
      temuan.push(`Rilis ${e.currency} "${e.event}" ${-min} mnt lalu — ${diff}`);
    }
  }
  if (temuan.length === 0) temuan.push("Tidak ada berita Tinggi ±60 mnt");
  return { temuan, kejadianPenting: penting };
}

export interface TabReportMeta {
  readonly laporanId: string;
  readonly broker: BrokerId;
  readonly login: string | null;
  /** F3: dari identitas akun terbukti; absen = tidak-terbukti. */
  readonly jenisAkun?: "demo" | "live" | "tidak-terbukti";
  readonly tim: "TAB_TRADE" | "TAB_EXPOSURE" | "TAB_CALENDAR" | "TAB_JOURNAL" | "TAB_EXPERTS" | "TAB_ALERTS";
  readonly jendelaMulaiUtc: string;
  readonly jendelaSelesaiUtc: string;
  readonly sumberData: readonly { readonly berkas: string; readonly umurDetik: number | null }[];
  readonly kualitasData?: readonly GuardEntry[];
}

const HANDOFF: Readonly<Record<TabReportMeta["tim"], readonly string[]>> = {
  TAB_TRADE: ["T-MONITOR", "RISIKO_GABUNGAN"],
  TAB_EXPOSURE: ["RISIKO_GABUNGAN", "T-PENJAGA"],
  TAB_CALENDAR: ["T-PENJAGA", "TIM_6B"],
  TAB_JOURNAL: ["T-GERBANG", "T-AKUN"],
  TAB_EXPERTS: ["T-GERBANG"],
  TAB_ALERTS: ["T-MONITOR"],
};

export function buildTabReport(meta: TabReportMeta, findings: TabFindings): LaporanTimRecord {
  return {
    skema: "laporan_tim/1",
    laporanId: meta.laporanId,
    login: meta.login,
    broker: meta.broker,
    jenisAkun: meta.jenisAkun ?? "tidak-terbukti",
    tim: meta.tim,
    jendelaMulaiUtc: meta.jendelaMulaiUtc,
    jendelaSelesaiUtc: meta.jendelaSelesaiUtc,
    sumberData: meta.sumberData,
    kualitasData: meta.kualitasData ?? [],
    temuan: findings.temuan,
    kejadianPenting: findings.kejadianPenting,
    diserahkanKe: HANDOFF[meta.tim],
    mengoreksi: null,
  };
}

/** Jendela jam UTC penuh yang baru berakhir: 10:02Z → 09:00Z–10:00Z. */
export function lastHourWindow(nowUtcMs: number): { readonly start: string; readonly end: string } {
  const end = Math.floor(nowUtcMs / HOUR_MS) * HOUR_MS;
  const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 19) + "Z";
  return { start: iso(end - HOUR_MS), end: iso(end) };
}
