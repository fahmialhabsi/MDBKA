/**
 * Jam server MT5 & WIT di header (penetapan Fahmi 9 Okt 2026). MURNI.
 *
 * Zona server broker: Finex UTC+3, OTB UTC+2, MIFX UTC+3 (terverifikasi 10 Okt) (lihat .env MT5_TZ_OFFSET_*).
 * Bila quote live segar tersedia, selisih jam dideteksi dari quote itu
 * (aman saat pergantian jam musim); selain itu pakai bawaan. WIT = UTC+9
 * (sama dengan jam laptop Fahmi). Format 12 jam (AM/PM).
 */
import type { BrokerId } from "../types/broker";
import { parseSnapshotTime } from "./dataFreshness";

export const WIT_UTC_OFFSET = 9;
export const DEFAULT_SERVER_UTC_OFFSET: Readonly<Record<BrokerId, number>> = {
  finex: 3,
  orbitraderberjangka: 2,
  // M1a: perkiraan awal (belum terverifikasi; dideteksi dari quote segar saat pasar buka).
  mifx: 3,
};

/**
 * Selisih jam server terhadap UTC. Quote dianggap segar bila jamnya
 * berjarak ≤ 6 menit dari jam bulat (selisih ≤ 14 jam); selain itu bawaan.
 */
export function serverUtcOffsetHours(
  brokerId: BrokerId,
  quoteServerTime: string | null | undefined,
  nowUtcMs: number,
): number {
  const fallback = DEFAULT_SERVER_UTC_OFFSET[brokerId] ?? 3;
  const q = quoteServerTime === null || quoteServerTime === undefined ? null : parseSnapshotTime(quoteServerTime);
  if (q === null) return fallback;
  const hours = (q - nowUtcMs) / 3_600_000;
  const whole = Math.round(hours);
  if (Math.abs(whole) > 14 || Math.abs(hours - whole) * 60 > 6) return fallback;
  return whole;
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "10:00:15 PM · Jum 9 Okt" untuk jam UTC + offset (12 jam). */
export function formatClock12(nowUtcMs: number, offsetHours: number): string {
  const d = new Date(nowUtcMs + offsetHours * 3_600_000);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ampm = h24 < 12 ? "AM" : "PM";
  return (
    `${pad(h12)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${ampm} · ` +
    `${HARI[d.getUTCDay()]} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`
  );
}
