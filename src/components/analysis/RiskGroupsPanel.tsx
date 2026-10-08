import type { JSX } from "react";
import { riskGroupTable } from "../../lib/riskGroup";

/**
 * Panel baca-saja "Batas risiko per golongan" (Mode Aman R4, 8 Okt 2026):
 * simbol mana masuk golongan apa dan batas rugi Rupiah per trade-nya.
 * Isi diambil dari buku yang sama dengan aturan (riskGroupTable), jadi
 * yang tampil = yang dipakai pemindai & Hasil analisa.
 */
function rupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function RiskGroupsPanel({
  usdIdr,
}: {
  readonly usdIdr: number | null;
}): JSX.Element {
  const rows = riskGroupTable();
  return (
    <details
      data-testid="risk-groups-panel"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
    >
      <summary className="cursor-pointer font-semibold text-white">
        Batas risiko per golongan{" "}
        <span className="text-sm font-normal text-slate-400">
          (klik untuk lihat simbol mana Forex, Minyak, Indeks, dst.)
        </span>
      </summary>
      <p className="mt-3 text-sm text-slate-400">
        Batas = rugi maksimal per trade. Yang dipakai selalu yang lebih kecil
        antara batas golongan dan 1% equity akun. &quot;Ditahan&quot; = golongan
        tidak diperdagangkan.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              <th className="py-2 pr-3 font-medium">Golongan</th>
              <th className="py-2 pr-3 font-medium">Batas per trade</th>
              <th className="py-2 pr-3 font-medium">Simbol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.group.id} className="border-t border-white/10 align-top">
                <td className="py-2 pr-3 font-semibold text-slate-100">
                  {row.group.label}
                </td>
                <td className="whitespace-nowrap py-2 pr-3">
                  {row.group.capIdr === null ? (
                    <span className="text-rose-300">Ditahan</span>
                  ) : (
                    <span className="text-emerald-300">
                      {rupiah(row.group.capIdr)}
                      {usdIdr !== null && usdIdr > 0 && (
                        <span className="ml-1 text-xs text-slate-400">
                          (≈ ${(row.group.capIdr / usdIdr).toFixed(2)})
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-slate-300">
                  {row.symbols.length > 0 ? row.symbols.join(", ") : "-"}
                  {row.note !== "" && (
                    <div className="mt-1 text-xs text-slate-500">{row.note}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
