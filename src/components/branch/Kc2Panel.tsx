import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { FungsiKatalog, Masalah, RingkasanTf } from "../../lib/kc2Bridge";

interface DaftarData {
  readonly broker: string;
  readonly ringkasan: readonly RingkasanTf[];
  readonly masalah: readonly Masalah[];
}

const STATUS_FUNGSI: Record<FungsiKatalog["status"], string> = {
  SUDAH_DIPAKAI: "Sudah dipakai",
  TERSEDIA_BELUM_DIPAKAI: "Tersedia, belum dipakai",
  PERLU_IZIN: "Perlu izin Pusat",
};

const wit = (iso: string): string =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jayapura", dateStyle: "medium", timeStyle: "short" }) + " WIT";

/** KC-2: daftar data + kesehatan file broker terpilih, katalog fungsi MT5. */
export function Kc2Panel({ onDone }: { onDone: () => void }) {
  const [daftar, setDaftar] = useState<{ tanggalUtc: string; data: DaftarData } | null>(null);
  const [katalog, setKatalog] = useState<readonly FungsiKatalog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-2/hasil/DAFTAR_DATA`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: DaftarData } | null }) => setDaftar(j.hasil))
      .catch(() => setDaftar(null));
    fetch(`${API_BASE_URL}/api/cabang/KC-2/hasil/KATALOG_FUNGSI`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { data: { fungsi: FungsiKatalog[] } } | null }) => setKatalog(j.hasil?.data.fungsi ?? []))
      .catch(() => setKatalog([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = (): void => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/KC-2/jalankan`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Pemeriksaan gagal (HTTP ${r.status})`);
        }
        load();
        onDone();
      })
      .catch(() => setError("Server tidak terjangkau"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 text-sm" data-testid="kc2-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Daftar data & kesehatan MT5 broker terpilih</p>
        <button type="button" className="ml-auto min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Memeriksa…" : "Jalankan pemeriksaan KC-2"}
        </button>
      </div>
      {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-rose-300">{error}</p> : null}
      {daftar === null ? (
        <p className="text-slate-400">Belum ada Daftar Data. Tekan tombol untuk memeriksa file MT5 broker terpilih KC-1.</p>
      ) : (
        <>
          <p className="text-slate-400">Pemeriksaan terakhir: {wit(daftar.tanggalUtc)} · broker {daftar.data.broker}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left" data-testid="kc2-summary">
              <thead className="text-slate-400">
                <tr><th className="py-1 pr-3">Timeframe</th><th className="py-1 pr-3">Simbol</th><th className="py-1 pr-3">Rentang median</th><th className="py-1">Lubang</th></tr>
              </thead>
              <tbody>
                {daftar.data.ringkasan.map((r) => (
                  <tr key={r.timeframe} className="border-t border-white/5">
                    <td className="py-1 pr-3 font-semibold">{r.timeframe}</td>
                    <td className="py-1 pr-3">{r.simbol}</td>
                    <td className="py-1 pr-3">{r.hariMedian === null ? "…" : `${Math.round(r.hariMedian)} hari`}</td>
                    <td className="py-1">{r.lubang}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {daftar.data.masalah.length === 0 ? (
            <p className="text-emerald-300">Tidak ada temuan — data sehat.</p>
          ) : (
            <ul className="space-y-1" data-testid="kc2-issues">
              {daftar.data.masalah.map((m) => (
                <li key={m.kode} className="rounded-xl bg-amber-500/10 p-2">
                  <span className="font-semibold text-amber-300">{m.teks}</span>
                  <span className="block text-slate-300">Langkah: {m.langkah}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {katalog.length > 0 ? (
        <div className="overflow-x-auto">
          <p className="font-semibold">Katalog fungsi MT5</p>
          <table className="w-full text-left" data-testid="kc2-catalog">
            <thead className="text-slate-400">
              <tr><th className="py-1 pr-3">Fungsi</th><th className="py-1 pr-3">MQL5</th><th className="py-1 pr-3">Status</th><th className="py-1">Dipakai oleh / catatan</th></tr>
            </thead>
            <tbody>
              {katalog.map((f) => (
                <tr key={f.nama} className="border-t border-white/5">
                  <td className="py-1 pr-3">{f.nama}</td>
                  <td className="py-1 pr-3 text-slate-400">{f.fungsiMql5}</td>
                  <td className="py-1 pr-3">{STATUS_FUNGSI[f.status]}</td>
                  <td className="py-1 text-slate-300">{f.dipakaiOleh}{f.catatan !== "" ? ` · ${f.catatan}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
