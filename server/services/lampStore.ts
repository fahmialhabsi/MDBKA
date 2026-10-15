import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BacktestLampRow } from "../../src/lib/greenLamps";

/**
 * LAMPU-1 (15 Okt 2026) — rapor lampu 1 per golongan di data/lampu/.
 * Satu berkas per strategi + broker (ditimpa saat backtest diulang dengan --simpan-lampu).
 */
const VERDICTS = new Set(["BELUM_CUKUP", "LAYAK_DEMO", "TIDAK_LAYAK", "MODAL_KURANG"]);

export function saveBacktestLamps(dataDir: string, strategy: string, broker: string, rows: readonly BacktestLampRow[]): string {
  const dir = join(dataDir, "lampu");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `backtest-${strategy}-${broker}.json`);
  writeFileSync(file, JSON.stringify({ skema: "lampu-backtest/1", rows }, null, 2) + "\n", "utf8");
  return file;
}

function isRow(v: unknown): v is BacktestLampRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.group === "string" &&
    typeof r.verdict === "string" &&
    VERDICTS.has(r.verdict) &&
    typeof r.equityUsd === "number" &&
    typeof r.strategy === "string" &&
    typeof r.broker === "string" &&
    typeof r.dateUtc === "string"
  );
}

/** Semua baris rapor tersimpan, urut tanggal; berkas rusak dilewati. */
export function readBacktestLamps(dataDir: string): BacktestLampRow[] {
  const dir = join(dataDir, "lampu");
  if (!existsSync(dir)) return [];
  const out: BacktestLampRow[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.startsWith("backtest-") || !name.endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, name), "utf8")) as { rows?: unknown };
      if (Array.isArray(j.rows)) out.push(...j.rows.filter(isRow));
    } catch {
      // berkas rusak: dilewati (jujur: lampu 1 tetap BELUM untuk golongan itu)
    }
  }
  return out.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
}
