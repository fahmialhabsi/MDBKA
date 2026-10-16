import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";

interface PembagianData {
  readonly broker: string;
  readonly dari: string;
  readonly latihSampai: string;
  readonly tryoutSampai: string;
  readonly ujianDari: string;
  readonly sampai: string;
  readonly hariBersama: number | null;
}

interface PolaCalon {
  readonly id: string;
  readonly kondisi: string;
  readonly angkaBeku: Readonly<Record<string, number>>;
  readonly latih: { readonly n: number; readonly rataR: number | null };
  readonly tryout: { readonly n: number; readonly rataR: number | null };
}

const JALAN_LABEL: Record<string, string> = {
  A_TAMBAH_BAHAN: "A. Tambah bahan bakar",
  B_LOGIKA_TEPAT: "B. Logika lebih tepat",
  C_GANTI_TEMPAT: "C. Ganti tempat",
  D_GANTI_UKURAN: "D. Ganti ukuran",
  E_ARSIP: "E. Arsip",
};

interface CatatanPerbaikan {
  readonly polaId: string;
  readonly percobaanKe: number;
  readonly diagnosis: string;
  readonly jalan: string;
  readonly hasil: string | null;
}

const tgl = (iso: string): string => iso.slice(0, 10);

/** KC-3 Kepala Sekolah (Pembagian Data) + Penambang Fakta (tambang BADAI jadi Pola Calon) + Penyaring Kebetulan/Pengawas Try-out (Jalur Perbaikan). */
export function Kc3Panel({ onDone }: { onDone: () => void }) {
  const [split, setSplit] = useState<{ tanggalUtc: string; data: PembagianData } | null>(null);
  const [pola, setPola] = useState<{ tanggalUtc: string; data: PolaCalon } | null>(null);
  const [perbaikan, setPerbaikan] = useState<{ tanggalUtc: string; data: CatatanPerbaikan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-3/hasil/PEMBAGIAN_DATA`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: PembagianData } | null }) => setSplit(j.hasil))
      .catch(() => setSplit(null));
    fetch(`${API_BASE_URL}/api/cabang/KC-3/hasil/POLA_CALON`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: PolaCalon } | null }) => setPola(j.hasil))
      .catch(() => setPola(null));
    fetch(`${API_BASE_URL}/api/cabang/KC-3/hasil/CATATAN_PERBAIKAN`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: CatatanPerbaikan } | null }) => setPerbaikan(j.hasil))
      .catch(() => setPerbaikan(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = (): void => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/KC-3/jalankan`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Pembagian data gagal (HTTP ${r.status})`);
        }
        load();
        onDone();
      })
      .catch(() => setError("Server tidak terjangkau"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 text-sm" data-testid="kc3-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Pembagian Data Kepala Sekolah (latih 60% · try-out 20% · ujian 20%, segel)</p>
        <button type="button" className="ml-auto min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Membekukan…" : "Jalankan pembagian KC-3"}
        </button>
      </div>
      {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-rose-300">{error}</p> : null}
      {split === null ? (
        <p className="text-slate-400">Belum ada Pembagian Data. Butuh DAFTAR_DATA KC-2 untuk broker terpilih KC-1 lebih dulu.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="kc3-split">
            <thead className="text-slate-400">
              <tr><th className="py-1 pr-3">Bagian</th><th className="py-1">Rentang tanggal</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/5"><td className="py-1 pr-3 font-semibold text-emerald-300">LATIH</td><td className="py-1">{tgl(split.data.dari)} s/d {tgl(split.data.latihSampai)}</td></tr>
              <tr className="border-t border-white/5"><td className="py-1 pr-3 font-semibold text-amber-300">TRY-OUT</td><td className="py-1">{tgl(split.data.latihSampai)} s/d {tgl(split.data.tryoutSampai)}</td></tr>
              <tr className="border-t border-white/5"><td className="py-1 pr-3 font-semibold text-rose-300">UJIAN (bersegel)</td><td className="py-1">{tgl(split.data.ujianDari)} s/d {tgl(split.data.sampai)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-slate-400">
            Broker {split.data.broker} · rentang bersama {split.data.hariBersama === null ? "…" : Math.round(split.data.hariBersama)} hari.
          </p>
        </div>
      )}
      <div className="border-t border-white/10 pt-3">
        <p className="font-semibold">Penambang Fakta — Pola Calon</p>
        {pola === null ? (
          <p className="text-slate-400">Belum ada Pola Calon. Butuh Pembagian Data (di atas) dan file M15 Common Files broker terpilih.</p>
        ) : (
          <div className="space-y-1" data-testid="kc3-pola">
            <p className="text-slate-300">{pola.data.kondisi}</p>
            <p className="text-slate-400">
              Angka dibekukan: {Object.entries(pola.data.angkaBeku).map(([k, v]) => `${k}=${v}`).join(" · ")}
            </p>
            <p>
              <span className="text-emerald-300 font-semibold">LATIH</span>{" "}
              {pola.data.latih.n} percobaan · rata-rata R {pola.data.latih.rataR === null ? "…" : pola.data.latih.rataR}
            </p>
            <p>
              <span className="text-amber-300 font-semibold">TRY-OUT</span>{" "}
              {pola.data.tryout.n === 0 ? "belum diuji (Penyaring Kebetulan belum meloloskan)" : `${pola.data.tryout.n} percobaan · rata-rata R ${pola.data.tryout.rataR ?? "…"}`}
            </p>
          </div>
        )}
      </div>
      {perbaikan !== null ? (
        <div className="border-t border-white/10 pt-3" data-testid="kc3-perbaikan">
          <p className="font-semibold">Jalur Perbaikan — percobaan ke-{perbaikan.data.percobaanKe}</p>
          <p className="text-slate-300">{perbaikan.data.diagnosis}</p>
          <p className="text-amber-300">Jalan: {JALAN_LABEL[perbaikan.data.jalan] ?? perbaikan.data.jalan}</p>
        </div>
      ) : null}
    </section>
  );
}
