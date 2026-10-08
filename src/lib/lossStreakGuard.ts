/**
 * Langkah F (8 Okt 2026) — jeda setelah 3 kali rugi berturut-turut.
 *
 * Sumber: trade tertutup History MT5 (GET /api/evaluation), demo + live
 * satu broker digabung (sama dengan aturan bukti n>=20). Bila 3 trade
 * TERAKHIR (urut jam tutup) semuanya rugi (net < 0), semua sinyal broker
 * itu ditahan selama 24 jam sejak rugi ke-3 (jam server MT5).
 * Hanya tampilan; MDBKA tidak pernah menempatkan/menutup order. Murni.
 */
import type { AnalysisResult } from "../types/analysis";

export const LOSS_STREAK_LIMIT = 3;
export const PAUSE_HOURS = 24;

export interface StreakTrade {
  readonly symbol: string;
  /** Jam server MT5 "YYYY.MM.DD HH:MM:SS". */
  readonly closeTime: string;
  readonly net: number;
}

export interface StreakAccount {
  readonly broker: string | null;
  readonly evaluation: { readonly trades: readonly StreakTrade[] };
}

export interface LossPause {
  readonly paused: boolean;
  /** Jumlah rugi beruntun terakhir (0 bila trade terakhir untung). */
  readonly streak: number;
  /** Akhir jeda (jam server "YYYY.MM.DD HH:MM") atau null. */
  readonly until: string | null;
  readonly reason: string | null;
}

/** "2026.10.01 18:34:42" → ms (diperlakukan UTC; hanya untuk selisih). */
export function serverTimeMs(time: string): number | null {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    time.trim(),
  );
  if (m === null) return null;
  return Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  );
}

function formatServerTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Gabungkan trade semua akun satu broker (demo + live). */
export function tradesForBroker(
  accounts: readonly StreakAccount[],
  brokerId: string,
): StreakTrade[] {
  return accounts
    .filter((a) => a.broker === brokerId)
    .flatMap((a) => a.evaluation.trades);
}

/**
 * Cek jeda. `nowServer` = jam server MT5 saat ini (mis. jam quote terbaru);
 * null → jeda dianggap masih berlaku bila beruntun >= 3 (fail-safe).
 */
export function checkLossStreak(
  trades: readonly StreakTrade[],
  nowServer: string | null,
): LossPause {
  const sorted = trades
    .map((t) => ({ t, ms: serverTimeMs(t.closeTime) }))
    .filter((x): x is { t: StreakTrade; ms: number } => x.ms !== null)
    .sort((a, b) => b.ms - a.ms);
  let streak = 0;
  for (const x of sorted) {
    if (x.t.net < 0) streak += 1;
    else break;
  }
  if (streak < LOSS_STREAK_LIMIT) {
    return { paused: false, streak, until: null, reason: null };
  }
  const last = sorted[0];
  const untilMs = last.ms + PAUSE_HOURS * 3_600_000;
  const until = formatServerTime(untilMs);
  const nowMs = nowServer === null ? null : serverTimeMs(nowServer);
  if (nowMs !== null && nowMs >= untilMs) {
    return { paused: false, streak, until: null, reason: null };
  }
  return {
    paused: true,
    streak,
    until,
    reason: `Jeda: ${streak} kali rugi berturut-turut (terakhir ${last.t.symbol}). Istirahat sampai ${until} jam server`,
  };
}

/**
 * Tahan hasil analisa BELI/JUAL selama jeda aktif (sama seperti tahanan
 * biaya/risiko/korelasi: TUNGGU, SL/TP/lot kosong).
 */
export function applyLossPauseHold<T extends AnalysisResult>(
  result: T,
  pause: LossPause,
): T {
  if (!pause.paused || pause.reason === null) return result;
  if (result.decision !== "BELI" && result.decision !== "JUAL") return result;
  return {
    ...result,
    decision: "TUNGGU",
    heldBy: "jeda",
    heldDecision: result.decision,
    heldReason: pause.reason,
    stopLoss: null,
    takeProfit: null,
    suggestedLot: null,
    warnings: [`Mode Aman: ${pause.reason}. Setup ditahan.`, ...result.warnings],
    explanation:
      "Mode Aman: sedang jeda setelah 3 kali rugi berturut-turut. Istirahat dulu agar keputusan tidak terburu-buru mengejar kerugian.",
  };
}
