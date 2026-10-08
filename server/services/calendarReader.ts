import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BrokerId } from "../../src/types/broker";
import { brokerFromCompany } from "../routes/evaluationRoutes";

/**
 * Satpam Kalender K2a (9 Okt 2026) — pembaca kalender ekonomi MT5.
 *
 * Sumber: Common\Files\MDBKA_Calendar_<login>.csv dari service
 * MDBKACalendarService (12 kolom). Jam = JAM SERVER broker penulis
 * (Finex UTC+3, OTB UTC+2) → file dipilih per broker lewat kolom Company,
 * tidak dicampur. Gagal baca / file tak ada → null (satpam diabaikan,
 * penetapan Fahmi 9 Okt). Hanya membaca; tidak pernah throw.
 */

export type CalendarImportance = "HIGH" | "MODERATE" | "LOW" | "NONE";

export interface CalendarEvent {
  /** Jam server MT5 "YYYY.MM.DD HH:MM:SS". */
  readonly serverTime: string;
  readonly currency: string;
  readonly country: string;
  readonly importance: CalendarImportance;
  readonly event: string;
  readonly actual: number | null;
  readonly forecast: number | null;
  readonly previous: number | null;
  readonly impact: "POSITIVE" | "NEGATIVE" | "NA";
  readonly valueId: string;
}

export interface CalendarSnapshot {
  readonly broker: BrokerId;
  readonly file: string;
  readonly company: string;
  /** Jam server saat file ditulis (kolom Generated). */
  readonly generated: string;
  readonly events: readonly CalendarEvent[];
}

const IMPORTANCE = new Set(["HIGH", "MODERATE", "LOW", "NONE"]);
const MT5_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

function num(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse CSV kalender (MURNI). Baris rusak dilewati. */
export function parseCalendarCsv(csv: string): {
  company: string;
  generated: string;
  events: CalendarEvent[];
} {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let company = "";
  let generated = "";
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    if (c.length < 12) continue;
    const serverTime = c[0].trim();
    const importance = c[3].trim().toUpperCase();
    const currency = c[1].trim().toUpperCase();
    if (!MT5_TIME.test(serverTime) || !IMPORTANCE.has(importance) || currency === "") continue;
    const impact = c[8].trim().toUpperCase();
    events.push({
      serverTime,
      currency,
      country: c[2].trim(),
      importance: importance as CalendarImportance,
      event: c[4].trim(),
      actual: num(c[5]),
      forecast: num(c[6]),
      previous: num(c[7]),
      impact: impact === "POSITIVE" || impact === "NEGATIVE" ? impact : "NA",
      valueId: c[9].trim(),
    });
    if (company === "") company = c[10].trim();
    if (generated === "") generated = c[11].trim();
  }
  events.sort((a, b) => (a.serverTime < b.serverTime ? -1 : a.serverTime > b.serverTime ? 1 : 0));
  return { company, generated, events };
}

/**
 * File kalender TERBARU (waktu ubah) milik broker ini, atau null.
 * Beberapa login satu broker (demo/live) = isi kalender sama; ambil terbaru.
 */
export function readCalendarForBroker(
  commonDir: string,
  broker: BrokerId,
): CalendarSnapshot | null {
  let names: string[];
  try {
    names = readdirSync(commonDir).filter((n) => /^MDBKA_Calendar_\d+\.csv$/i.test(n));
  } catch {
    return null;
  }
  let best: { snap: CalendarSnapshot; mtime: number } | null = null;
  for (const name of names) {
    try {
      const path = join(commonDir, name);
      const mtime = statSync(path).mtimeMs;
      const parsed = parseCalendarCsv(readFileSync(path, "utf8"));
      if (brokerFromCompany(parsed.company) !== broker) continue;
      if (best !== null && best.mtime >= mtime) continue;
      best = {
        mtime,
        snap: { broker, file: name, company: parsed.company, generated: parsed.generated, events: parsed.events },
      };
    } catch {
      continue; // terkunci MT5 saat ditulis: coba lagi berikutnya
    }
  }
  return best === null ? null : best.snap;
}
