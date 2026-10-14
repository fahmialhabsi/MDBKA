/**
 * TT-4 (Tahap 16, 15 Okt 2026) — Tim Tab Alerts: catatan peringatan buatan
 * MDBKA sendiri untuk posisi terbuka (rancangan tim bagian 4: alert manual
 * terminal tidak bisa dibaca). MURNI. Tiap peringatan punya kunci; peringatan
 * yang masih ada di laporan jam sebelumnya = BELUM DITINDAKLANJUTI (penting).
 * Peringatan: tanpa SL, saran titik impas (≥0,5R), time-stop Forex, struktur H1 rusak.
 */
import type { Candle } from "../calculations/swingDetector";
import { checkBreakeven, checkTimeStop } from "./exitMonitor";
import type { TabFindings, TabPosition } from "./tabReports";
import { structureBreak } from "./trailStop";

export interface AlertQuote {
  readonly bid: number;
  readonly ask: number;
}

export interface AlertsResult {
  readonly findings: TabFindings;
  /** Kunci peringatan aktif ("JENIS:#tiket"), untuk dibandingkan dengan jam berikutnya. */
  readonly keys: readonly string[];
}

export function alertsTabFindings(
  positions: readonly TabPosition[],
  quoteOf: (symbol: string) => AlertQuote | null,
  h1Of: (symbol: string) => readonly Candle[] | null,
  serverNow: string,
  previousKeys: ReadonlySet<string> | null,
): AlertsResult {
  const lines: string[] = [];
  const keys: string[] = [];
  let pending = 0;
  const add = (key: string, text: string): void => {
    keys.push(key);
    const again = previousKeys?.has(key) === true;
    if (again) pending++;
    lines.push(again ? `${text} — BELUM DITINDAKLANJUTI (sudah diperingatkan jam sebelumnya)` : text);
  };
  for (const p of positions) {
    const tag = `#${p.ticket} ${p.symbol} ${p.side}`;
    const direction = p.side === "BUY" ? "BELI" : "JUAL";
    if (!(p.sl > 0)) add(`TANPA_SL:${p.ticket}`, `${tag}: tanpa SL`);
    const ts = checkTimeStop({ entryTime: p.timeOpen, symbol: p.symbol }, serverNow);
    if (ts !== null) add(`TIMESTOP:${p.ticket}`, `${tag}: time-stop — ${ts.message}`);
    const q = quoteOf(p.symbol);
    if (q === null) {
      lines.push(`${tag}: harga terbaru tidak tersedia (peringatan harga tidak dinilai)`);
    } else if (p.priceOpen !== undefined) {
      const be = checkBreakeven({ direction, entryPrice: p.priceOpen, sl: p.sl }, q.bid, q.ask);
      if (be !== null) add(`IMPAS:${p.ticket}`, `${tag}: profit ${be.multiple.toFixed(2)}R — saran SL ke titik impas ${be.slTarget}`);
    }
    const sb = structureBreak(direction, h1Of(p.symbol));
    if (sb !== null) add(`STRUKTUR:${p.ticket}`, `${tag}: ${sb.message}`);
  }
  return {
    findings: {
      temuan: [`${keys.length} peringatan aktif, ${pending} belum ditindaklanjuti`, ...lines],
      kejadianPenting: pending > 0,
    },
    keys,
  };
}
