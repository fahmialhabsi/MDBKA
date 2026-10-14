import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import { PACE_TARGET, type EvidenceCell, type EvidenceRow } from "../../lib/evidencePace";
import { RISK_GROUPS } from "../../lib/riskGroup";

/**
 * LB-1 (13 Okt 2026) — panel laju bukti: "sampai kapan" setiap golongan
 * mencapai 20 bukti, dari catatan nyata (GET /api/evidence-pace).
 */
function cellText(c: EvidenceCell): string {
  const eta = c.weeksTo20 === 0 ? "sudah ≥ 20" : c.weeksTo20 === null ? "laju 0 — belum bisa diperkirakan" : `± ${c.weeksTo20} minggu lagi`;
  return `${c.total} · ${String(c.perWeek).replace(".", ",")}/minggu · ${eta}`;
}

export function EvidencePacePanel() {
  const [rows, setRows] = useState<readonly EvidenceRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/evidence-pace`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: EvidenceRow[] }>) : null))
      .then((j) => {
        if (!cancelled) setRows(Array.isArray(j?.rows) ? j.rows : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (rows === null) return null;
  const label = (g: string): string => RISK_GROUPS[g as keyof typeof RISK_GROUPS]?.label ?? g;
  return (
    <div data-testid="evidence-pace" className="mb-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-2 text-sm font-semibold text-white">Laju bukti per golongan (target {PACE_TARGET})</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Belum ada trade bayangan selesai, trade uji, atau entry setara Live yang tercatat.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1.5 pr-3">Golongan</th>
              <th className="py-1.5 pr-3">Trade bayangan</th>
              <th className="py-1.5 pr-3">Trade uji (demo)</th>
              <th className="py-1.5">Entry setara Live</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            {rows.map((r) => (
              <tr key={r.group}>
                <td className="py-1.5 pr-3 text-slate-200">{label(r.group)}</td>
                <td className="py-1.5 pr-3">{cellText(r.cells.BAYANGAN)}</td>
                <td className="py-1.5 pr-3">{cellText(r.cells.UJI)}</td>
                <td className="py-1.5">{cellText(r.cells.SETARA_LIVE)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-slate-500">Laju = rata-rata 4 minggu terakhir. Perkiraan hanya hitungan, bukan janji.</p>
    </div>
  );
}
