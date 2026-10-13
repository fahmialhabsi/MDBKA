/**
 * F3/TA-1 (13 Okt 2026) — identitas akun TERBUKTI. MURNI.
 * Sumber utama: kolom Login + TradeMode yang ditulis EA MDBKAMultiLive dari
 * AccountInfo MT5 (server broker). Label ACCOUNT_LABELS hanya pelengkap nama;
 * bila bertentangan, yang dipercaya server broker dan pertentangannya dicatat.
 * Tanpa kolom EA → "tidak-terbukti" (tidak menebak dari label).
 */
export type ProvenKind = "demo" | "live" | "tidak-terbukti";

export interface AccountIdentity {
  readonly login: string | null;
  readonly jenisAkun: ProvenKind;
  readonly label: string | null;
  /** null = tidak bisa dibandingkan (label tanpa kata demo/live, atau tanpa login). */
  readonly cocokLabel: boolean | null;
  readonly catatan: string;
}

function labelKind(label: string): "demo" | "live" | null {
  if (/demo/i.test(label)) return "demo";
  if (/live|real/i.test(label)) return "live";
  return null;
}

export function resolveAccountIdentity(
  snapshot: { readonly account?: string; readonly tradeMode?: "DEMO" | "CONTEST" | "REAL" } | null,
  labels: Readonly<Record<string, string>>,
): AccountIdentity {
  const login = snapshot?.account ?? null;
  const mode = snapshot?.tradeMode;
  if (login === null || mode === undefined) {
    return { login, jenisAkun: "tidak-terbukti", label: login === null ? null : labels[login] ?? null, cocokLabel: null, catatan: "EA belum menulis Login/TradeMode (pasang MDBKAMultiLive versi F3)" };
  }
  const jenisAkun: ProvenKind = mode === "REAL" ? "live" : "demo";
  const label = labels[login] ?? null;
  const kind = label === null ? null : labelKind(label);
  const cocokLabel = kind === null ? null : kind === jenisAkun;
  const catatan =
    label === null
      ? `Login ${login} belum diberi label di ACCOUNT_LABELS`
      : cocokLabel === false
        ? `Label "${label}" bertentangan dengan server broker (${mode}) — yang dipakai: ${jenisAkun}`
        : `Terverifikasi server broker (${mode})`;
  return { login, jenisAkun, label, cocokLabel, catatan };
}
