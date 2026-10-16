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

type Kc3BahanStatus = "BELUM_DITAMBANG" | "DIPROSES" | "GAGAL" | "MENUNGGU_PERSETUJUAN" | "DISETUJUI" | "SUDAH_DIUJI_KC4";

interface Kc3BahanRingkasan {
  readonly id: string;
  readonly nama: string;
  readonly timeframe: "M15" | "H1";
  readonly pola: PolaCalon | null;
  readonly perbaikan: CatatanPerbaikan | null;
  readonly status: Kc3BahanStatus;
}

const STATUS_STYLE: Record<Kc3BahanStatus, string> = {
  BELUM_DITAMBANG: "bg-slate-500/20 text-slate-300",
  DIPROSES: "bg-amber-500/15 text-amber-300",
  GAGAL: "bg-rose-500/15 text-rose-300",
  MENUNGGU_PERSETUJUAN: "bg-amber-500/15 text-amber-300",
  DISETUJUI: "bg-emerald-500/15 text-emerald-300",
  SUDAH_DIUJI_KC4: "bg-sky-500/15 text-sky-300",
};
const STATUS_LABEL: Record<Kc3BahanStatus, string> = {
  BELUM_DITAMBANG: "Belum ditambang",
  DIPROSES: "Diproses",
  GAGAL: "Gagal — Jalur Perbaikan",
  MENUNGGU_PERSETUJUAN: "Lolos try-out — menunggu Pusat",
  DISETUJUI: "Disetujui Pusat — siap KC-4",
  SUDAH_DIUJI_KC4: "Sudah diuji KC-4",
};

const tgl = (iso: string): string => iso.slice(0, 10);

/** Satu kartu bahan (Badai M15, atau M-1/P-1/F-1 H1) di dalam panel KC-3 — audit A-3 (16 Okt 2026). */
function BahanCard({ bahan }: { bahan: Kc3BahanRingkasan }) {
  return (
    <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-3" data-testid={`kc3-bahan-${bahan.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{bahan.nama}</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">{bahan.timeframe}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[bahan.status]}`}>{STATUS_LABEL[bahan.status]}</span>
      </div>
      {bahan.pola === null ? (
        <p className="text-slate-400">Belum ada Pola Calon. Butuh Pembagian Data (di atas) dan file {bahan.timeframe} Common Files broker terpilih.</p>
      ) : (
        <>
          <p className="text-slate-300">{bahan.pola.kondisi}</p>
          <p className="text-slate-400">
            Angka dibekukan: {Object.entries(bahan.pola.angkaBeku).map(([k, v]) => `${k}=${v}`).join(" · ")}
          </p>
          <p>
            <span className="font-semibold text-emerald-300">LATIH</span>{" "}
            {bahan.pola.latih.n} percobaan · rata-rata R {bahan.pola.latih.rataR === null ? "…" : bahan.pola.latih.rataR}
          </p>
          <p>
            <span className="font-semibold text-amber-300">TRY-OUT</span>{" "}
            {bahan.pola.tryout.n === 0 ? "belum diuji (Penyaring Kebetulan belum meloloskan)" : `${bahan.pola.tryout.n} percobaan · rata-rata R ${bahan.pola.tryout.rataR ?? "…"}`}
          </p>
        </>
      )}
      {bahan.perbaikan !== null ? (
        <div className="border-t border-white/10 pt-2">
          <p className="font-semibold">Jalur Perbaikan — percobaan ke-{bahan.perbaikan.percobaanKe}</p>
          <p className="text-slate-300">{bahan.perbaikan.diagnosis}</p>
          <p className="text-amber-300">Jalan: {JALAN_LABEL[bahan.perbaikan.jalan] ?? bahan.perbaikan.jalan}</p>
        </div>
      ) : null}
    </div>
  );
}

/** KC-3 Kepala Sekolah (Pembagian Data) + Penambang Fakta (Badai M15 + M-1/P-1/F-1 H1) + Penyaring Kebetulan/Pengawas Try-out per bahan. */
export function Kc3Panel({ onDone }: { onDone: () => void }) {
  const [split, setSplit] = useState<{ tanggalUtc: string; data: PembagianData } | null>(null);
  const [bahan, setBahan] = useState<readonly Kc3BahanRingkasan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-3/hasil/PEMBAGIAN_DATA`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: PembagianData } | null }) => setSplit(j.hasil))
      .catch(() => setSplit(null));
    fetch(`${API_BASE_URL}/api/cabang/KC-3/bahan`)
      .then((r) => (r.ok ? r.json() : { bahan: [] }))
      .then((j: { bahan?: Kc3BahanRingkasan[] }) => setBahan(j.bahan ?? []))
      .catch(() => setBahan([]));
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
      <div className="space-y-2 border-t border-white/10 pt-3">
        <p className="font-semibold">Penambang Fakta — Pola Calon per bahan</p>
        {bahan.length === 0 ? (
          <p className="text-slate-400">Belum ada bahan ditambang.</p>
        ) : (
          bahan.map((b) => <BahanCard key={b.id} bahan={b} />)
        )}
      </div>
    </section>
  );
}
