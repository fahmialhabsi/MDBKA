import type { LiveQuoteLike } from "./csvQuote";
import type { ScanPlan } from "./symbolScanner";

/**
 * Kunci salin SL/TP (penetapan Fahmi 10 Okt 2026).
 *
 * Alur: tombol [SL] di kolom Arah pemindai (hanya status Lolos) menghitung
 * ulang rencana dari harga live lalu MENGUNCI-nya. Tombol [TP] memakai rencana
 * terkunci yang sama, hanya selama kunci masih berlaku:
 * - lewat COPY_LOCK_SECONDS (10 dtk) -> HABIS: ulangi dari SL;
 * - harga eksekusi live (BELI = Ask, JUAL = Bid) bergeser > COPY_DRIFT_SHARE
 *   (10%) dari jarak SL terhadap entry rencana -> BERGESER: TP mati, salin ulang;
 * - harga live tidak terbaca -> BERGESER juga (tidak bisa dibuktikan aman).
 * Modul MURNI (tanpa React) agar bisa dites. MDBKA tidak menempatkan order.
 */
export const COPY_LOCK_SECONDS = 10;
export const COPY_DRIFT_SHARE = 0.1;

export interface CopyLock {
  readonly symbol: string;
  readonly plan: ScanPlan;
  readonly startedMs: number;
  /**
   * 17 Okt 2026: tombol [Entry] (kolom Price Buy Stop/Sell Limit MT5) bisa memulai kunci yang sama.
   * Kunci dimulai [SL] (alur lama) = slCopied true; dimulai [Entry] = entryCopied true, SL & TP lalu
   * diambil dari rencana terkunci yang SAMA. Absen = perilaku lama (SL sudah disalin, Entry belum).
   */
  readonly entryCopied?: boolean;
  readonly slCopied?: boolean;
}

export type CopyStart = "ENTRY" | "SL";

/** Kunci dimulai tombol mana (bawaan SL = alur lama). */
export function lockSlCopied(lock: CopyLock): boolean {
  return lock.slCopied !== false;
}

export type CopyLockPhase = "SIAP_TP" | "HABIS" | "BERGESER";

export interface CopyLockState {
  readonly phase: CopyLockPhase;
  /** Sisa detik kunci (dibulatkan ke atas, minimal 0). */
  readonly remainingSec: number;
  /** Geser harga / jarak SL (0,1 = 10%); null bila tak bisa dihitung. */
  readonly driftShare: number | null;
  readonly reason: string;
}

/** Geser harga eksekusi live terhadap entry rencana, sebagai bagian jarak SL. */
export function planDriftShare(plan: ScanPlan, quote: LiveQuoteLike | null): number | null {
  if (quote === null) return null;
  const price = plan.direction === "BELI" ? quote.ask : quote.bid;
  const slDistance = Math.abs(plan.entry - plan.stopLoss);
  if (!Number.isFinite(price) || price <= 0 || !(slDistance > 0)) return null;
  return Math.abs(price - plan.entry) / slDistance;
}

export function startCopyLock(symbol: string, plan: ScanPlan, nowMs: number, first: CopyStart = "SL"): CopyLock {
  return { symbol, plan, startedMs: nowMs, entryCopied: first === "ENTRY", slCopied: first === "SL" };
}

export function copyLockState(lock: CopyLock, quote: LiveQuoteLike | null, nowMs: number): CopyLockState {
  const leftMs = COPY_LOCK_SECONDS * 1000 - (nowMs - lock.startedMs);
  const remainingSec = Math.max(0, Math.ceil(leftMs / 1000));
  const driftShare = planDriftShare(lock.plan, quote);
  if (leftMs <= 0) {
    return { phase: "HABIS", remainingSec: 0, driftShare, reason: `Waktu ${COPY_LOCK_SECONDS} dtk habis — salin ulang dari SL` };
  }
  if (driftShare === null) {
    return { phase: "BERGESER", remainingSec, driftShare, reason: "Harga live tidak terbaca — salin ulang dari SL" };
  }
  if (driftShare > COPY_DRIFT_SHARE) {
    const pct = Math.round(driftShare * 100);
    return { phase: "BERGESER", remainingSec, driftShare, reason: `Harga bergeser ${pct}% jarak SL (maks ${Math.round(COPY_DRIFT_SHARE * 100)}%) — salin ulang` };
  }
  return { phase: "SIAP_TP", remainingSec, driftShare, reason: `TP siap disalin (${remainingSec} dtk lagi)` };
}

export type CopyTone = "netral" | "siap" | "merah";

export interface CopyButtonsView {
  readonly entryLabel: string;
  readonly slLabel: string;
  readonly tpLabel: string;
  readonly tpEnabled: boolean;
  /** true = tombol itu menyalin dari rencana TERKUNCI; false = hitung ulang harga live lalu mulai kunci baru. */
  readonly entryFromLock: boolean;
  readonly slFromLock: boolean;
  readonly tone: CopyTone;
  /** Penjelasan singkat di bawah tombol (null = tidak ada). */
  readonly note: string | null;
}

/**
 * Tampilan tombol [SL]/[TP] di kolom Arah pemindai (MURNI).
 * - belum ada kunci: SL aktif, TP mati ("tekan SL dulu");
 * - SIAP_TP: TP aktif + hitung mundur;
 * - BERGESER: TP mati merah "harga bergeser — salin ulang";
 * - HABIS: kembali seperti awal + catatan waktu habis;
 * - selesai (TP sudah disalin): pengingat tekan Buy/Sell di MT5.
 */
export function copyButtonsView(
  lock: CopyLock | null,
  state: CopyLockState | null,
  done: boolean,
  doneWithEntry: boolean = false,
): CopyButtonsView {
  const awal = { entryFromLock: false, slFromLock: false };
  if (done) {
    return {
      ...awal,
      entryLabel: doneWithEntry ? "Entry ✓" : "Entry",
      slLabel: "SL ✓",
      tpLabel: "TP ✓",
      tpEnabled: false,
      tone: "siap",
      note: doneWithEntry ? "Entry, SL & TP tersalin — tekan Place di MT5 sekarang" : "SL & TP tersalin — tekan Buy/Sell di MT5 sekarang",
    };
  }
  if (lock === null || state === null) {
    return { ...awal, entryLabel: "Entry", slLabel: "SL", tpLabel: "TP", tpEnabled: false, tone: "netral", note: null };
  }
  if (state.phase === "HABIS") {
    return { ...awal, entryLabel: "Entry", slLabel: "SL", tpLabel: "TP", tpEnabled: false, tone: "netral", note: state.reason };
  }
  if (state.phase === "BERGESER") {
    return { ...awal, entryLabel: "Entry ulang", slLabel: "SL ulang", tpLabel: "harga bergeser — salin ulang", tpEnabled: false, tone: "merah", note: state.reason };
  }
  const n = state.remainingSec;
  const slDone = lockSlCopied(lock);
  return {
    entryLabel: lock.entryCopied === true ? "Entry ✓" : `Entry · ${n} dtk`,
    slLabel: slDone ? "SL ✓" : `SL · ${n} dtk`,
    tpLabel: slDone ? `TP · ${n} dtk` : "TP",
    tpEnabled: slDone,
    entryFromLock: true,
    slFromLock: !slDone,
    tone: "siap",
    note: slDone ? null : "Tempel Entry ke kolom Price, lalu tekan SL",
  };
}
