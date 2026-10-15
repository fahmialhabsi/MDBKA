import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { Lamp, LampRow } from "../../lib/greenLamps";

/**
 * LAMPU-1 (15 Okt 2026) — panel 3 lampu hijau per golongan (GET /api/evaluation/lamps).
 * Tampilan saja: lampu tidak mengubah keputusan dan tidak membuka jalur Live.
 */
const DOT: Record<Lamp["state"], string> = {
  HIJAU: "bg-emerald-400",
  MERAH: "bg-rose-400",
  BELUM: "bg-slate-500",
};

function LampCell({ lamp }: { readonly lamp: Lamp }) {
  return (
    <td className="py-1.5 pr-3 align-top">
      <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${DOT[lamp.state]}`} aria-label={lamp.state} />
      <span className="text-slate-300">{lamp.text}</span>
    </td>
  );
}

export function GreenLampsPanel() {
  const [rows, setRows] = useState<readonly LampRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/evaluation/lamps`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: LampRow[] }>) : null))
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
  return (
    <div data-testid="green-lamps" className="mb-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-2 text-sm font-semibold text-white">3 lampu hijau per golongan (syarat menuju Live)</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Belum ada rangkaian maupun rapor backtest tersimpan.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1.5 pr-3">Golongan</th>
              <th className="py-1.5 pr-3">Lampu 1 — Backtest</th>
              <th className="py-1.5 pr-3">Lampu 2 — Demo</th>
              <th className="py-1.5">Lampu 3 — Percobaan Live</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.group}>
                <td className="py-1.5 pr-3 align-top text-slate-200">{r.label}</td>
                <LampCell lamp={r.lamp1} />
                <LampCell lamp={r.lamp2} />
                <LampCell lamp={r.lamp3} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Lampu 1: npm run backtest -- --broker &lt;broker&gt; --equity &lt;equity Live&gt; --simpan-lampu. Lampu 2: rangkaian akun demo yang dibuka di mode Live (setara Live). Tampilan saja — Live baru dibuka setelah ketiga lampu hijau DAN persetujuan Fahmi.
      </p>
    </div>
  );
}
