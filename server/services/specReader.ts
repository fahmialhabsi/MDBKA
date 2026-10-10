import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareSpecs, parseSpecsCsv, type SpecDiff } from "../../src/lib/specCompare";
import type { BrokerId } from "../../src/types/broker";
import { brokerFromCompany } from "../routes/evaluationRoutes";

/**
 * V2b (10 Okt 2026) — pembaca spesifikasi simbol MT5 per broker.
 * Sumber: Common\Files\MDBKA_Specs_<login>.csv (MDBKACalendarService, tiap 300 dtk).
 * File dipilih per broker lewat kolom Company (TERBARU menang), lalu dibandingkan
 * dengan spec32 (src/lib/specCompare.ts). Tidak ada / gagal baca → null
 * (satpam spesifikasi diabaikan, sama dengan satpam kalender/sesi). Tidak pernah throw.
 */
export interface SpecSnapshot {
  readonly broker: BrokerId;
  readonly file: string;
  readonly generated: string;
  readonly symbols: number;
  readonly diffs: readonly SpecDiff[];
}

export function readSpecsForBroker(commonDir: string, broker: BrokerId): SpecSnapshot | null {
  let names: string[];
  try {
    names = readdirSync(commonDir).filter((n) => /^MDBKA_Specs_\d+\.csv$/i.test(n));
  } catch {
    return null;
  }
  let best: { snap: SpecSnapshot; mtime: number } | null = null;
  for (const name of names) {
    try {
      const path = join(commonDir, name);
      const mtime = statSync(path).mtimeMs;
      if (best !== null && best.mtime >= mtime) continue;
      const parsed = parseSpecsCsv(readFileSync(path, "utf8"));
      if (brokerFromCompany(parsed.company) !== broker || parsed.specs.length === 0) continue;
      best = {
        mtime,
        snap: { broker, file: name, generated: parsed.generated, symbols: parsed.specs.length, diffs: compareSpecs(parsed) },
      };
    } catch {
      continue;
    }
  }
  return best === null ? null : best.snap;
}
