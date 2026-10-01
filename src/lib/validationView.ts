import type { ScaleIssue } from "../calculations/scaleValidator";
import type {
  BrokerSettings,
  MarketData,
} from "../types/analysis";
import type { ValidationSummary } from "../calculations/inputValidator";

export type ValidationViewState =
  | { kind: "empty"; symbol: string }
  | { kind: "incomplete"; symbol: string; issues: ScaleIssue[] }
  | { kind: "mismatch"; issues: ScaleIssue[] }
  | { kind: "invalid" }
  | { kind: "valid" };

/**
 * True bila ada mismatch skala nyata atau relasi struktural pada angka
 * nonzero. Isu "missing" (field 0/belum diisi) BUKAN mismatch instrumen.
 */
export function hasRealMismatch(issues: ScaleIssue[]): boolean {
  return issues.some((issue) => issue.code !== "missing");
}

/**
 * Prioritas tampilan tunggal (dipakai panel hasil dan kartu validasi):
 * 1. pasar kosong -> "empty" (bukan mismatch),
 * 2. mismatch nyata -> "mismatch",
 * 3. hanya field belum diisi -> "incomplete",
 * 4. error validasi lain -> "invalid",
 * 5. selebihnya -> "valid".
 */
export function getValidationViewState(args: {
  isEmpty: boolean;
  symbol: string;
  scaleIssues: ScaleIssue[];
  valid: boolean;
}): ValidationViewState {
  if (args.isEmpty) {
    return { kind: "empty", symbol: args.symbol };
  }

  if (hasRealMismatch(args.scaleIssues)) {
    return { kind: "mismatch", issues: args.scaleIssues };
  }

  if (args.scaleIssues.length > 0) {
    return {
      kind: "incomplete",
      symbol: args.symbol,
      issues: args.scaleIssues,
    };
  }

  if (!args.valid) {
    return { kind: "invalid" };
  }

  return { kind: "valid" };
}

/**
 * Alasan penolakan saat tombol Analisa diklik dengan data belum valid.
 * Mengembalikan null bila tidak ada alasan (siap dianalisa). Pesan
 * spesifik (equity, S/R) didahulukan agar klik selalu merespons jelas.
 */
export function buildBlockedReasons(args: {
  market: MarketData;
  broker: BrokerSettings;
  validation: ValidationSummary;
  scaleIssues: ScaleIssue[];
}): string[] | null {
  const reasons: string[] = [];

  if (!Number.isFinite(args.broker.equity) || args.broker.equity <= 0) {
    reasons.push(
      "Equity wajib diisi lebih besar dari 0 sebelum risiko dihitung."
    );
  }

  if (
    !Number.isFinite(args.market.support) ||
    args.market.support <= 0 ||
    !Number.isFinite(args.market.resistance) ||
    args.market.resistance <= 0
  ) {
    reasons.push(
      "Support/Resistance belum aktif pada market state. Periksa integrasi CSV."
    );
  }

  for (const error of args.validation.errors) {
    reasons.push(error.message);
  }

  for (const issue of args.scaleIssues) {
    reasons.push(issue.message);
  }

  const unique = reasons.filter(
    (message, index) => reasons.indexOf(message) === index
  );

  return unique.length > 0 ? unique : null;
}
