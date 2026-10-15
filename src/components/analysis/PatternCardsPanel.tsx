import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { FingerprintNote, PatternCardView } from "../../lib/patternCards";

/**
 * K5 (Tahap 17, 15 Okt 2026) — kartu pola per akun (GET /api/evaluation/cards):
 * label rangkaian, R, sebab rugi (Tim 4), pola selama posisi (Tim 5), dan catatan
 * sidik jari tingkat 1. Tampilan saja; < 20 kartu per sidik jari = catatan.
 */
interface AccountCards {
  readonly login: string;
  readonly label: string;
  readonly total: number;
  readonly cards: readonly PatternCardView[];
  readonly notes: readonly FingerprintNote[];
  readonly notes2?: readonly FingerprintNote[];
}

const LABEL_CLASS: Record<string, string> = {
  "Kasbi Bakar": "text-emerald-300",
  "Popeda Sagu": "text-lime-300",
  "Sagu Tumang": "text-slate-300",
  "Pupare Rebus": "text-rose-300",
};

const CAUSE_TEXT: Record<string, string> = {
  BERBALIK_SETELAH_0_5R: "sempat ≥0,5R lalu berbalik (titik impas terlambat)",
  MELAWAN_SEJAK_MASUK: "melawan sejak masuk (pemicu lemah)",
  TANPA_SEBAB_PASTI: "tanpa sebab pasti",
  DATA_TIDAK_ADA: "rekaman MFE tidak ada",
};

const fmtR = (r: number | null): string => (r === null ? "—" : `${r > 0 ? "+" : ""}${r.toFixed(2).replace(".", ",")}R`);

export function PatternCardsPanel() {
  const [accounts, setAccounts] = useState<readonly AccountCards[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/evaluation/cards`)
      .then((r) => (r.ok ? (r.json() as Promise<{ accounts?: AccountCards[] }>) : null))
      .then((j) => {
        if (!cancelled) setAccounts(Array.isArray(j?.accounts) ? j.accounts.filter((a) => a.total > 0) : []);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (accounts === null || accounts.length === 0) return null;
  return (
    <div data-testid="pattern-cards" className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">Kartu pola rangkaian (tampilan saja)</p>
      {accounts.map((a) => (
        <details key={a.login} className="rounded-xl border border-white/5 p-3">
          <summary className="cursor-pointer text-sm text-slate-200">
            {a.label} <span className="text-xs text-slate-500">#{a.login} · {a.total} rangkaian{a.total > a.cards.length ? ` (${a.cards.length} terbaru ditampilkan)` : ""}</span>
          </summary>
          {a.notes.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
              {a.notes.slice(0, 6).map((n) => (
                <li key={n.fingerprint}>
                  <span className="text-slate-300">{n.fingerprint.replace(/\|/g, " · ")}</span>: {n.text}
                </li>
              ))}
            </ul>
          )}
          {(a.notes2 ?? []).length > 0 && (
            <ul data-testid="pattern-notes2" className="mt-2 space-y-0.5 text-xs text-slate-400">
              {(a.notes2 ?? []).slice(0, 6).map((n) => (
                <li key={n.fingerprint}>
                  <span className="text-slate-300">Tingkat 2 · {n.fingerprint.replace(/\|/g, " · ")}</span>: {n.text}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">Kartu</th>
                  <th className="py-1.5 pr-3">Simbol</th>
                  <th className="py-1.5 pr-3">Mulai</th>
                  <th className="py-1.5 pr-3 text-right">Posisi</th>
                  <th className="py-1.5 pr-3 text-right">R</th>
                  <th className="py-1.5 pr-3">Arah D1</th>
                  <th className="py-1.5 pr-3">Konteks entry</th>
                  <th className="py-1.5">Catatan Tim 4/5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {a.cards.map((v) => {
                  const against = v.insight.patterns?.filter((p) => !p.withPosition).length ?? null;
                  return (
                    <tr key={v.card.positions.join("-")}>
                      <td className={`py-1.5 pr-3 ${LABEL_CLASS[v.card.label ?? ""] ?? "text-slate-500"}`}>
                        {v.card.cardName ?? "data tidak lengkap"}
                        {v.card.lossNote !== null ? ` (${v.card.lossNote})` : ""}
                      </td>
                      <td className="py-1.5 pr-3">{v.card.symbol} {v.card.side === "BUY" ? "Beli" : "Jual"}</td>
                      <td className="py-1.5 pr-3">{v.card.startTime}</td>
                      <td className="py-1.5 pr-3 text-right">{v.card.positions.length}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtR(v.card.r)}</td>
                      <td className="py-1.5 pr-3">{v.d1 ?? "—"}</td>
                      <td className="py-1.5 pr-3">
                        {v.context === null || v.context === undefined
                          ? "—"
                          : [
                              v.context.adx === null ? null : `ADX ${Math.round(v.context.adx)}`,
                              v.context.rsi === null ? null : `RSI ${Math.round(v.context.rsi)}`,
                              v.context.bbLebar === null ? null : `BB ${(v.context.bbLebar * 100).toFixed(1).replace(".", ",")}%`,
                              v.fingerprint2 === null || v.fingerprint2 === undefined ? null : v.fingerprint2.split("|").slice(3).join(" · "),
                            ]
                              .filter((x): x is string => x !== null)
                              .join(" · ")}
                      </td>
                      <td className="py-1.5">
                        {v.insight.lossCause !== null ? CAUSE_TEXT[v.insight.lossCause] : ""}
                        {v.insight.patterns === null
                          ? ""
                          : `${v.insight.lossCause !== null ? " · " : ""}${v.insight.patterns.length} pola H1 (${against} melawan)`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      <p className="text-xs text-slate-500">
        Rangkaian = simbol & arah sama dalam 3 jam sejak open 1; R = total bersih ÷ risiko uang open 1. Sidik jari tingkat 1 = golongan · arah · arah D1.
      </p>
    </div>
  );
}
