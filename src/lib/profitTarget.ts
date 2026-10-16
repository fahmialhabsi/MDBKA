/**
 * Perkiraan profit di titik TP per sinyal + rentang target profit Fahmi (17 Okt 2026): Rp5.000–Rp50.000
 * per sinyal bila TP kena. MURNI. Rumus biaya SAMA dengan mesin keputusan (decisionEngine.ts,
 * costPerOneLot = (spread + slippage) × pointValue + komisi) — tidak ada angka baru; hanya sisi hasil.
 */

/** Batas rentang target profit (Rupiah), ditetapkan Fahmi 17 Okt 2026 — bukan angka tebakan. */
export const TARGET_PROFIT_MIN_IDR = 5_000;
export const TARGET_PROFIT_MAX_IDR = 50_000;

export interface ProfitAtTpInput {
  /** Jarak entry → TP (satuan harga). */
  readonly targetDistance: number | null;
  readonly lot: number | null;
  /** USD per 1 satuan harga per 1 lot (BrokerSettings.pointValue yang sudah dikonversi USD). */
  readonly pointValueUsd: number;
  /** |ask − bid| (satuan harga). */
  readonly spread: number;
  readonly slippage: number;
  /** Komisi USD per lot. */
  readonly commissionUsdPerLot: number;
}

export interface ProfitAtTp {
  readonly grossUsd: number;
  /** Setelah spread + slippage + komisi (sama dengan yang dihitung mesin di sisi risiko). */
  readonly netUsd: number;
}

/** Profit perkiraan bila TP kena; null bila lot/jarak/nilai poin tidak sah (bukan angka karangan). */
export function profitAtTp(i: ProfitAtTpInput): ProfitAtTp | null {
  if (i.targetDistance === null || i.lot === null) return null;
  if (!(i.targetDistance > 0) || !(i.lot > 0) || !(i.pointValueUsd > 0)) return null;
  const grossPerLot = i.targetDistance * i.pointValueUsd;
  const costPerLot = (i.spread + i.slippage) * i.pointValueUsd + i.commissionUsdPerLot;
  const grossUsd = grossPerLot * i.lot;
  const netUsd = (grossPerLot - costPerLot) * i.lot;
  if (!Number.isFinite(grossUsd) || !Number.isFinite(netUsd)) return null;
  return { grossUsd, netUsd };
}

export type ProfitRange = "DI_BAWAH" | "DALAM_RENTANG" | "DI_ATAS" | "TAK_ADA";

/** Posisi profit bersih (Rupiah) terhadap rentang Rp5.000–Rp50.000. */
export function profitRangeOf(netIdr: number | null): ProfitRange {
  if (netIdr === null || !Number.isFinite(netIdr)) return "TAK_ADA";
  if (netIdr < TARGET_PROFIT_MIN_IDR) return "DI_BAWAH";
  if (netIdr > TARGET_PROFIT_MAX_IDR) return "DI_ATAS";
  return "DALAM_RENTANG";
}

export const PROFIT_RANGE_LABEL: Record<ProfitRange, string> = {
  DI_BAWAH: "di bawah Rp5.000",
  DALAM_RENTANG: "dalam rentang Rp5.000–50.000",
  DI_ATAS: "di atas Rp50.000",
  TAK_ADA: "tidak bisa dihitung",
};
