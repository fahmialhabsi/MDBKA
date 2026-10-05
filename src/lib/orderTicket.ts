import { getOtbInstrumentProfile } from "./otbInstrumentConfig";
import type { BrokerId } from "../types/broker";

/**
 * Tahap STP — guard jarak SL/TP ke harga LIVE (MODUL MURNI, CJS-safe).
 *
 * Kasus nyata: analisa dihitung saat bid 1.31849, tiket dibuka setelah
 * market naik ke 1.32306 → SL 1.32317 tinggal 1 point dari ask → MT5
 * mengunci tombol Buy/Sell. Guard ini memperingatkan SEBELUM ke MT5.
 *
 * Aturan MT5: SL/TP minimal stops-level dari harga berjalan.
 * - Data stops HANYA ada untuk OTB (preset stopsLevel, satuan point).
 *   Finex → null (jujur dilewati, bukan ditebak).
 * - BELI: (bid−SL) dan (TP−ask) ≥ jarak minimal.
 * - JUAL: (SL−ask) dan (bid−TP) ≥ jarak minimal.
 */
export function getStopsDistance(
  symbol: string,
  brokerId: BrokerId,
): number | null {
  if (brokerId !== "orbitraderberjangka") return null;
  const preset = getOtbInstrumentProfile(symbol.trim().toUpperCase());
  if (preset === null) return null;
  if (
    !Number.isFinite(preset.stopsLevel) ||
    preset.stopsLevel <= 0 ||
    !Number.isFinite(preset.tickSize) ||
    preset.tickSize <= 0
  ) {
    return null;
  }
  return preset.stopsLevel * preset.tickSize;
}

/**
 * Peringatan bila SL/TP terlalu dekat harga live (MT5 akan menolak).
 * Null = aman/tak dapat dinilai (bukan lampu hijau mutlak).
 * Tak pernah throw.
 */
export function checkStopsDistance(args: {
  readonly symbol: string;
  readonly brokerId: BrokerId;
  readonly direction: "BELI" | "JUAL";
  readonly sl: number;
  readonly tp: number;
  readonly bid: number;
  readonly ask: number;
}): string | null {
  const { symbol, brokerId, direction, sl, tp, bid, ask } = args;
  for (const value of [sl, tp, bid, ask]) {
    if (!Number.isFinite(value) || value <= 0) return null;
  }
  if (direction !== "BELI" && direction !== "JUAL") return null;
  const minDistance = getStopsDistance(symbol, brokerId);
  if (minDistance === null) return null;

  const problems: string[] = [];
  if (direction === "BELI") {
    if (bid - sl < minDistance) {
      problems.push(
        `SL ${sl} hanya ${bid - sl} dari bid ${bid} (min ${minDistance})`,
      );
    }
    if (tp - ask < minDistance) {
      problems.push(
        `TP ${tp} hanya ${tp - ask} dari ask ${ask} (min ${minDistance})`,
      );
    }
  } else {
    if (sl - ask < minDistance) {
      problems.push(
        `SL ${sl} hanya ${sl - ask} dari ask ${ask} (min ${minDistance})`,
      );
    }
    if (bid - tp < minDistance) {
      problems.push(
        `TP ${tp} hanya ${bid - tp} dari bid ${bid} (min ${minDistance})`,
      );
    }
  }

  if (problems.length === 0) return null;
  return (
    `SL/TP terlalu dekat harga live — MT5 kemungkinan mengunci tombol order. ` +
    problems.join("; ") +
    `. Analisa ulang dengan data segar.`
  );
}
