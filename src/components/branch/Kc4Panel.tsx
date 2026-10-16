import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";

interface HasilK1K7 {
  readonly n: number;
  readonly rataR: number | null;
  readonly profitFactor: number | null;
  readonly rugiNol: boolean;
  readonly terburuk: number | null;
  readonly blok: readonly number[];
  readonly blokPositif: number;
  readonly k1: boolean;
  readonly k2: boolean;
  readonly k3: boolean;
  readonly k4: boolean;
  readonly k5: boolean;
  readonly k6: boolean;
  readonly k7: boolean;
  readonly lulus: boolean;
  readonly gagal: readonly string[];
}

interface VonisUjian {
  readonly polaId: string;
  readonly broker: string;
  readonly k1k7: HasilK1K7;
  readonly vonis: "LULUS" | "GAGAL";
}

const K_LABEL: Record<string, string> = {
  k1: "K1 n≥20", k2: "K2 rata-rata R>0", k3: "K3 PF≥1,2", k4: "K4 ≥5/7 blok positif",
  k5: "K5 terburuk≥−1,1R", k6: "K6 positif tanpa blok terbaik", k7: "K7 LATIH juga positif",
};

/** KC-4 Kepala Ruang Ujian & Penguji Data Lama: lampu 1 (K1-K7) di bagian UJIAN bersegel. */
export function Kc4Panel({ onDone }: { onDone: () => void }) {
  const [vonis, setVonis] = useState<{ tanggalUtc: string; data: VonisUjian } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-4/hasil/VONIS_UJIAN`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: VonisUjian } | null }) => setVonis(j.hasil))
      .catch(() => setVonis(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = (): void => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/KC-4/jalankan`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Ujian gagal (HTTP ${r.status})`);
        }
        load();
        onDone();
      })
      .catch(() => setError("Server tidak terjangkau"))
      .finally(() => setBusy(false));
  };

  const k = vonis?.data.k1k7;

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 text-sm" data-testid="kc4-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Kepala Ruang Ujian & Penguji Data Lama (lampu 1 — K1–K7 di UJIAN bersegel)</p>
        <button type="button" className="ml-auto min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Menguji…" : "Jalankan ujian KC-4"}
        </button>
      </div>
      {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-rose-300">{error}</p> : null}
      {vonis === null || k === undefined ? (
        <p className="text-slate-400">Belum ada vonis. Butuh Pola Calon KC-3 yang Formulir R "lolos try-out"-nya sudah disetujui Pusat. Satu pola hanya diuji sekali.</p>
      ) : (
        <div className="space-y-2" data-testid="kc4-vonis">
          <p className={vonis.data.vonis === "LULUS" ? "text-emerald-300 font-semibold" : "text-rose-300 font-semibold"}>
            {vonis.data.vonis} — {vonis.data.polaId} ({vonis.data.broker})
          </p>
          <p className="text-slate-400">
            UJIAN: n={k.n} · rata-rata R {k.rataR ?? "…"} · PF {k.rugiNol ? "tak terhingga" : (k.profitFactor ?? "…")} · terburuk {k.terburuk ?? "…"}R · blok positif {k.blokPositif}/7
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left" data-testid="kc4-k1k7">
              <tbody>
                {(["k1", "k2", "k3", "k4", "k5", "k6", "k7"] as const).map((kode) => (
                  <tr key={kode} className="border-t border-white/5">
                    <td className="py-1 pr-3">{K_LABEL[kode]}</td>
                    <td className={`py-1 ${k[kode] ? "text-emerald-300" : "text-rose-300"}`}>{k[kode] ? "LOLOS" : "GAGAL"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
