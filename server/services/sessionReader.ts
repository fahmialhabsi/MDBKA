import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BrokerId } from "../../src/types/broker";
import type { TradeSession } from "../../src/lib/sessionGuard";
import { brokerFromCompany } from "../routes/evaluationRoutes";

/**
 * Satpam Sesi S2 (9 Okt 2026) — pembaca jam trading resmi broker.
 * Sumber: Common\Files\MDBKA_Sessions_<login>.csv dari MDBKACalendarService
 * (Symbol,Day,Index,FromMin,ToMin,Company,Generated; jam SERVER broker).
 * File dipilih per broker lewat kolom Company. Tidak ada / gagal baca → null
 * (satpam diabaikan, sama dengan Satpam Kalender). Tidak pernah throw.
 */
export interface SessionSnapshot {
  readonly broker: BrokerId;
  readonly file: string;
  readonly generated: string;
  readonly sessions: readonly TradeSession[];
}

/** Parse CSV sesi (MURNI). Baris rusak dilewati. */
export function parseSessionsCsv(csv: string): { company: string; generated: string; sessions: TradeSession[] } {
  const sessions: TradeSession[] = [];
  let company = "";
  let generated = "";
  for (const line of csv.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1)) {
    const c = line.split(",");
    if (c.length < 7) continue;
    const symbol = c[0].trim().toUpperCase();
    const day = Number(c[1]);
    const fromMin = Number(c[3]);
    const toMin = Number(c[4]);
    if (symbol === "" || !Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!Number.isInteger(fromMin) || !Number.isInteger(toMin) || fromMin < 0 || toMin > 1440 || toMin <= fromMin) continue;
    sessions.push({ symbol, day, fromMin, toMin });
    if (company === "") company = c[5].trim();
    if (generated === "") generated = c[6].trim();
  }
  return { company, generated, sessions };
}

/** File sesi TERBARU milik broker ini, atau null. */
export function readSessionsForBroker(commonDir: string, broker: BrokerId): SessionSnapshot | null {
  let names: string[];
  try {
    names = readdirSync(commonDir).filter((n) => /^MDBKA_Sessions_\d+\.csv$/i.test(n));
  } catch {
    return null;
  }
  let best: { snap: SessionSnapshot; mtime: number } | null = null;
  for (const name of names) {
    try {
      const path = join(commonDir, name);
      const mtime = statSync(path).mtimeMs;
      const parsed = parseSessionsCsv(readFileSync(path, "utf8"));
      if (brokerFromCompany(parsed.company) !== broker) continue;
      if (best !== null && best.mtime >= mtime) continue;
      best = { mtime, snap: { broker, file: name, generated: parsed.generated, sessions: parsed.sessions } };
    } catch {
      continue;
    }
  }
  return best === null ? null : best.snap;
}
