/**
 * T-SIKLUS (Tahap 16, 15 Okt 2026) — siklus tinjau Tim 2 (rancangan alur
 * trader 7.6–7.7, K-1). MURNI, hanya saran tampilan.
 *  - Sejak posisi dibuka: siklus 30 menit; penilaian di menit 20–30 tiap siklus.
 *  - Keputusan dari data saat ini (urutan): struktur H1 rusak → KELUAR_AWAL;
 *    SL sudah ≥ titik impas → AMAN (boleh masuk lagi bila pemindai Lolos);
 *    profit ≥ 0,5R → GESER_SL_IMPAS; selain itu → TAHAN.
 *  - Jendela 3 jam: Forex/Forex JPY → TUTUP (time-stop lama); emas, minyak,
 *    indeks, saham → PANTAU_SELESAI (posisi tetap berjalan dengan SL/TP, K-1).
 * Waktu buka & sekarang wajib jam server MT5 ("YYYY.MM.DD HH:MM:SS"); lain = null.
 */
import { parseSnapshotTime } from "./dataFreshness";
import { BREAKEVEN_R_MULTIPLE, TIME_STOP_HOURS, timeStopApplies } from "./exitMonitor";
import type { StructureBreak } from "./trailStop";

export const CYCLE_MINUTES = 30;
export const REVIEW_FROM_MINUTE = 20;
export const WINDOW_HOURS = TIME_STOP_HOURS;

export type CycleDecision = "TAHAN" | "GESER_SL_IMPAS" | "AMAN" | "KELUAR_AWAL" | "TUTUP" | "PANTAU_SELESAI";

export interface CycleInput {
  readonly symbol: string;
  readonly direction: "BELI" | "JUAL";
  readonly entryPrice: number;
  readonly sl: number;
  readonly bid: number;
  readonly ask: number;
  readonly openTime: string;
  readonly serverNow: string;
  readonly broken: StructureBreak | null;
}

export interface CycleView {
  /** Siklus ke-n (1..6) dalam jendela; 0 = jendela selesai. */
  readonly cycle: number;
  readonly minuteInCycle: number;
  /** true = menit 20–30 siklus ini (Tim 2 sedang menilai). */
  readonly reviewing: boolean;
  readonly elapsedMinutes: number;
  readonly decision: CycleDecision;
  readonly message: string;
}

const MT5_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

function decide(input: CycleInput): { decision: CycleDecision; message: string } {
  if (input.broken !== null) return { decision: "KELUAR_AWAL", message: `Keluar lebih awal: ${input.broken.message}` };
  const buy = input.direction === "BELI";
  const safe = input.sl > 0 && (buy ? input.sl >= input.entryPrice : input.sl <= input.entryPrice);
  if (safe) {
    return {
      decision: "AMAN",
      message: "Posisi aman (SL di titik impas atau lebih baik). Boleh masuk lagi bila pemindai memberi Lolos (TAMBAH, maks 2 posisi, demo).",
    };
  }
  const risk = buy ? input.entryPrice - input.sl : input.sl - input.entryPrice;
  const ref = buy ? input.bid : input.ask;
  const profit = buy ? ref - input.entryPrice : input.entryPrice - ref;
  if (input.sl > 0 && risk > 0 && profit / risk + 1e-9 >= BREAKEVEN_R_MULTIPLE) {
    return { decision: "GESER_SL_IMPAS", message: `Profit ${(profit / risk).toFixed(2)}R (≥0,5R), struktur utuh: geser SL ke titik impas (lihat kotak Breakeven).` };
  }
  return { decision: "TAHAN", message: "Tahan: struktur utuh, profit belum 0,5R. SL/TP tetap." };
}

export function monitorCycle(input: CycleInput): CycleView | null {
  if (!MT5_TIME.test(input.openTime.trim()) || !MT5_TIME.test(input.serverNow.trim())) return null;
  const open = parseSnapshotTime(input.openTime);
  const now = parseSnapshotTime(input.serverNow);
  if (open === null || now === null || now < open) return null;
  const elapsed = Math.floor((now - open) / 60_000);
  if (elapsed >= WINDOW_HOURS * 60) {
    const forex = timeStopApplies(input.symbol);
    return {
      cycle: 0,
      minuteInCycle: 0,
      reviewing: false,
      elapsedMinutes: elapsed,
      decision: forex ? "TUTUP" : "PANTAU_SELESAI",
      message: forex
        ? `Jendela ${WINDOW_HOURS} jam selesai (Forex): tutup posisi (time-stop).`
        : `Jendela ${WINDOW_HOURS} jam selesai: masa pantau intensif berakhir; posisi tetap berjalan dengan SL/TP-nya (K-1).`,
    };
  }
  const minuteInCycle = elapsed % CYCLE_MINUTES;
  const d = decide(input);
  return {
    cycle: Math.floor(elapsed / CYCLE_MINUTES) + 1,
    minuteInCycle,
    reviewing: minuteInCycle >= REVIEW_FROM_MINUTE,
    elapsedMinutes: elapsed,
    decision: d.decision,
    message: d.message,
  };
}
