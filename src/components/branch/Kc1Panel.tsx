import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { HasilKepala } from "../../lib/kc1Assessment";

type Kartu = HasilKepala["kartu"][number];

const PRINSIP: readonly { readonly key: "merangkak" | "dariBawah" | "keAtas" | "terbukti"; readonly label: string }[] = [
  { key: "merangkak", label: "Merangkak" },
  { key: "dariBawah", label: "Dari Bawah" },
  { key: "keAtas", label: "Ke Atas" },
  { key: "terbukti", label: "Terbukti" },
];

const wit = (iso: string): string =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jayapura", dateStyle: "medium", timeStyle: "short" }) + " WIT";

/** KC-1: jalankan penilaian broker dan tampilkan Kartu Broker terbaru. */
export function Kc1Panel({ onDone }: { onDone: () => void }) {
  const [kartu, setKartu] = useState<{ tanggalUtc: string; data: Kartu[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-1/hasil/KARTU_BROKER`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: Kartu[] } | null }) => setKartu(j.hasil))
      .catch(() => setKartu(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = (): void => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/KC-1/jalankan`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Penilaian gagal (HTTP ${r.status})`);
        }
        load();
        onDone();
      })
      .catch(() => setError("Server tidak terjangkau"))
      .finally(() => setBusy(false));
  };

  const best = kartu?.data.filter((k) => k.gugur.length === 0 && k.total !== null).sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 text-sm" data-testid="kc1-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Penilaian broker paling dekat prinsip MDBKA (akun demo)</p>
        <button type="button" className="ml-auto min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Menilai…" : "Jalankan penilaian KC-1"}
        </button>
      </div>
      {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-rose-300">{error}</p> : null}
      {kartu === null ? (
        <p className="text-slate-400">Belum ada Kartu Broker. Tekan tombol untuk menilai Finex, OTB, MIFX dan Exness.</p>
      ) : (
        <>
          <p className="text-slate-400">Kartu terakhir: {wit(kartu.tanggalUtc)}{best !== undefined ? ` · paling dekat: ${best.nama} (nilai ${best.total})` : " · belum ada broker yang lolos syarat wajib"}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left" data-testid="kc1-cards">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3">Broker</th>
                  {PRINSIP.map((p) => <th key={p.key} className="py-1 pr-3">{p.label}</th>)}
                  <th className="py-1 pr-3">Nilai</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {kartu.data.map((k) => (
                  <tr key={k.broker} className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={() => setOpen(open === k.broker ? null : k.broker)}>
                    <td className="py-1 pr-3 font-semibold">{k.nama}</td>
                    {PRINSIP.map((p) => <td key={p.key} className="py-1 pr-3">{k[p.key].nilai ?? "…"}</td>)}
                    <td className="py-1 pr-3 font-semibold">{k.total ?? "…"}</td>
                    <td className="py-1">
                      {k.gugur.length > 0 ? <span className="text-rose-300">Gugur: {k.gugur.join("; ")}</span> : <span className="text-emerald-300">Lolos syarat wajib</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {kartu.data.filter((k) => k.broker === open).map((k) => (
            <div key={k.broker} className="grid gap-3 rounded-xl border border-white/10 p-3 md:grid-cols-2" data-testid="kc1-detail">
              {PRINSIP.map((p) => (
                <div key={p.key}>
                  <p className="font-semibold">{p.label}: {k[p.key].nilai ?? "…"}</p>
                  <ul className="list-disc pl-5 text-xs text-slate-300">
                    {k[p.key].rincian.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          <p className="text-xs text-slate-500">Klik baris broker untuk melihat rincian. Rekomendasi masuk ke daftar di bawah; Pusat yang menetapkan.</p>
        </>
      )}
    </section>
  );
}
