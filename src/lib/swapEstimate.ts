/**
 * SW2 (10 Okt 2026) — perkiraan swap mengikuti MODE broker (MODUL MURNI).
 *
 * Bukti History MT5 & file MDBKA_Specs (9–10 Okt):
 * - Finex: SwapMode 0 (DISABLED) di 82/82 simbol → swap tidak dikenakan
 *   (US30 menginap 8→9 Okt swap 0,00), walau SwapLong/Short tercantum.
 * - OTB: SwapMode 5 (INTEREST_CURRENT) = persen TAHUNAN dari harga, tahun
 *   bank 360 hari (dok. MQL5). Simbol OTB lain (US*.DEC, CLU) swap 0.
 *   AUDUSD_ORB 0,10 −1,5% Tue→Thu = 4 hari (Rabu ×3) = −1,16 ✓;
 *   AUDCAD_ORB 0,10 −0,75% Fri→Tue = 2 hari = −0,29 ✓; META.US 0,10 −10%
 *   Tue→Fri = 3 hari (Rabu TIDAK ×3) = −0,06 ✓.
 * Hari tagih = setiap pergantian hari jam server (00:00) yang menutup hari
 * Senin–Jumat; hari triple ×3 (forex/CFD Rabu; saham Jumat — belum terbukti).
 * Ini PERKIRAAN; swap asli MT5 (SW1) selalu didahulukan.
 */
import type { BrokerId } from "../types/broker";
import { getInstrumentSpec32 } from "./instrumentSpecs32";
import { isStockSymbol } from "./stockPortfolio";

export type BrokerSwapMode = "MATI" | "PERSEN_TAHUNAN";

export function swapModeForBroker(broker: BrokerId): BrokerSwapMode {
  return broker === "finex" ? "MATI" : "PERSEN_TAHUNAN";
}

const SERVER_TIME = /^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

function serverMs(t: string): number | null {
  const m = SERVER_TIME.exec(t.trim());
  if (m === null) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

/** Jumlah hari tagih swap antara jam server entry dan sekarang (triple dihitung 3). */
export function swapChargeDays(entryServer: string, nowServer: string, tripleWeekday: number): number | null {
  const start = serverMs(entryServer);
  const end = serverMs(nowServer);
  if (start === null || end === null || end < start) return null;
  const DAY = 86_400_000;
  let days = 0;
  // Pergantian hari pertama setelah entry.
  for (let midnight = Math.floor(start / DAY) * DAY + DAY; midnight <= end; midnight += DAY) {
    const charged = new Date(midnight - DAY).getUTCDay(); // hari yang ditutup
    if (charged === 0 || charged === 6) continue;
    days += charged === tripleWeekday ? 3 : 1;
  }
  return days;
}

export interface SwapEstimate {
  readonly mode: BrokerSwapMode;
  readonly chargeDays: number;
  /** USD, negatif = biaya. */
  readonly value: number;
}

export function estimateSwap(
  input: {
    readonly symbol: string;
    readonly broker: BrokerId;
    readonly direction: "BELI" | "JUAL";
    readonly lot: number;
    /** Harga acuan (harga sekarang bila ada, selain itu harga entry). */
    readonly price: number;
    readonly entryServer: string;
    readonly nowServer: string;
  },
  convertToUsd: (amount: number, currency: string) => number | null,
): SwapEstimate | null {
  const mode = swapModeForBroker(input.broker);
  const spec = getInstrumentSpec32(input.symbol.trim());
  const triple = isStockSymbol(input.symbol) ? 5 : (spec?.swap3DayWeekday ?? 3);
  const chargeDays = swapChargeDays(input.entryServer, input.nowServer, triple);
  if (chargeDays === null) return null;
  if (mode === "MATI") return { mode, chargeDays, value: 0 };
  if (spec === null || !(input.lot > 0) || !(input.price > 0)) return null;
  const rate = input.direction === "BELI" ? spec.swapLong : spec.swapShort;
  const perDayQuote = (input.lot * spec.leverage * input.price * rate) / 100 / 360;
  const perDayUsd = convertToUsd(perDayQuote, spec.quoteCurrency);
  if (perDayUsd === null || !Number.isFinite(perDayUsd)) return null;
  return { mode, chargeDays, value: Math.round(perDayUsd * chargeDays * 100) / 100 };
}
