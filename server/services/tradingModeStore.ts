import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { effectiveMode, parseTradingMode, type EffectiveMode, type TradingMode } from "../../src/lib/tradingMode";
import type { ProvenKind } from "../../src/lib/accountIdentity";

/**
 * Tahap 13 (13 Okt 2026) — saklar mode per broker di data/mode-akun.json
 * (ikut Backup). Tidak ada / rusak → semua LIVE (aman). DEMO hanya
 * tersimpan bila server broker membuktikan akun demo.
 */
export function modeFile(dataDir: string): string {
  return join(dataDir, "mode-akun.json");
}

export function readModes(dataDir: string): Record<string, TradingMode> {
  const file = modeFile(dataDir);
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, TradingMode> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const m = parseTradingMode(v);
      if (m !== null) out[k] = m;
    }
    return out;
  } catch {
    return {};
  }
}

export function requestedMode(dataDir: string, broker: string): TradingMode {
  return readModes(dataDir)[broker] ?? "LIVE";
}

export function modeFor(dataDir: string, broker: string, jenisAkun: ProvenKind): EffectiveMode {
  return effectiveMode(requestedMode(dataDir, broker), jenisAkun);
}

/** null = tersimpan; teks = ditolak (alasan). */
export function setRequestedMode(dataDir: string, broker: string, mode: TradingMode, jenisAkun: ProvenKind): string | null {
  const eff = effectiveMode(mode, jenisAkun);
  if (eff.mode !== mode) return eff.alasan;
  const all = { ...readModes(dataDir), [broker]: mode };
  const file = modeFile(dataDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n", "utf8");
  return null;
}
