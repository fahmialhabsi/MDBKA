import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceEvent } from "../../src/lib/evidencePace";
import { serverTimeMs } from "../../src/lib/lossStreakGuard";
import { riskGroupOf } from "../../src/lib/riskGroup";
import { readJsonlRecords } from "./jsonlStore";

/**
 * LB-1 (13 Okt 2026) — kumpulkan kejadian bukti dari catatan yang sudah ada:
 *  - data/bayangan/*.jsonl  → baris SELESAI (trade bayangan selesai)
 *  - data/keputusan/*.jsonl → jalur entry dengan setaraLive = true
 *  - History MT5 (evaluasi) → trade berkelompok UJI (komentar MDBKA-UJI)
 */
function listJsonl(dir: string): string[] {
  try {
    return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort() : [];
  } catch {
    return [];
  }
}

export function collectEvidenceEvents(
  dataDir: string,
  labTrades: readonly { readonly symbol: string; readonly closeTime: string }[],
): EvidenceEvent[] {
  const out: EvidenceEvent[] = [];
  for (const name of listJsonl(join(dataDir, "bayangan"))) {
    for (const r of readJsonlRecords(dataDir, `bayangan/${name}`, "bayangan/1").records) {
      if (r.fase !== "SELESAI" || typeof r.waktuUtc !== "string" || typeof r.simbol !== "string") continue;
      const at = Date.parse(r.waktuUtc);
      if (!Number.isFinite(at)) continue;
      out.push({ group: typeof r.golongan === "string" ? r.golongan : riskGroupOf(r.simbol).id, kind: "BAYANGAN", atMs: at });
    }
  }
  for (const name of listJsonl(join(dataDir, "keputusan"))) {
    for (const r of readJsonlRecords(dataDir, `keputusan/${name}`, "keputusan/1").records) {
      if (r.jalur !== "entry" || r.setaraLive !== true || typeof r.waktuUtc !== "string" || typeof r.simbol !== "string") continue;
      const at = Date.parse(r.waktuUtc);
      if (!Number.isFinite(at)) continue;
      out.push({ group: typeof r.golongan === "string" ? r.golongan : riskGroupOf(r.simbol).id, kind: "SETARA_LIVE", atMs: at });
    }
  }
  for (const t of labTrades) {
    const at = serverTimeMs(t.closeTime);
    if (at !== null) out.push({ group: riskGroupOf(t.symbol).id, kind: "UJI", atMs: at });
  }
  return out;
}
