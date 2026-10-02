/**
 * Tahap 5E-STEP1 — Triple-Swap Wednesday Auto-Detection (MODUL MURNI).
 *
 * - Swap di hari Rabu x3 (bank tutup Sabtu-Minggu, biaya 3 hari
 *   dibebankan ke Rabu). Hari lain x1.
 * - holdingDays <= 0 → 0 (intraday akurat, tanpa swap).
 * - startDate opsional (default today) agar UI auto-detect hari ini;
 *   test memakai tanggal eksplisit agar deterministik.
 */

export function isWednesday(date: Date): boolean {
  return date.getDay() === 3; // 0=Sun, 1=Mon, ..., 3=Wed, ..., 6=Sat
}

export function calculateSwapWithTriple(params: {
  holdingDays: number;
  swapPerDay: number; // USD atau % per day (flat atau percentage)
  startDate?: Date; // default today
}): number {
  if (params.holdingDays <= 0) return 0;

  const start = params.startDate ?? new Date();
  let totalSwap = 0;

  for (let day = 0; day < params.holdingDays; day++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + day);

    const multiplier = isWednesday(currentDate) ? 3 : 1;
    totalSwap += params.swapPerDay * multiplier;
  }

  return totalSwap;
}

export function getTripleSwapLabel(holdingDays: number, startDate?: Date): string {
  // Return label seperti "2 hari (termasuk Rabu ×3)" atau "2 hari (normal)".
  if (holdingDays <= 0) return "0 hari";

  const start = startDate ?? new Date();
  let hasWednesday = false;

  for (let day = 0; day < holdingDays; day++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + day);
    if (isWednesday(currentDate)) {
      hasWednesday = true;
      break;
    }
  }

  return hasWednesday
    ? `${holdingDays} hari (termasuk Rabu \u00D73)`
    : `${holdingDays} hari (normal)`;
}
