import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";

interface JadwalSetoran {
  readonly ke: number;
  readonly tanggal: string;
  readonly jumlahRp: number;
}

type StatusSetoran = "BELUM_JATUH_TEMPO" | "PERLU_DIINGATKAN" | "TERLAMBAT" | "LUNAS";

interface StatusBaris {
  readonly jadwal: JadwalSetoran;
  readonly status: StatusSetoran;
}

interface JurnalYearSummary {
  readonly year: string;
  readonly nettoUsd: number;
  readonly nettoIdr: number;
  readonly dealCount: number;
  readonly tanpaKurs: number;
}

interface LaporanBulanan {
  readonly cicilan: readonly StatusBaris[];
  readonly hasilTrading: JurnalYearSummary | null;
}

const STATUS_STYLE: Record<StatusSetoran, string> = {
  BELUM_JATUH_TEMPO: "bg-slate-500/20 text-slate-300",
  PERLU_DIINGATKAN: "bg-amber-500/15 text-amber-300",
  TERLAMBAT: "bg-rose-500/15 text-rose-300",
  LUNAS: "bg-emerald-500/15 text-emerald-300",
};
const STATUS_LABEL: Record<StatusSetoran, string> = {
  BELUM_JATUH_TEMPO: "Belum jatuh tempo",
  PERLU_DIINGATKAN: "Perlu diingatkan",
  TERLAMBAT: "Terlambat",
  LUNAS: "Lunas",
};

const rp = (n: number): string => `${n < 0 ? "-" : ""}Rp${Math.abs(n).toLocaleString("id-ID")}`;

/** KC-5 Kepala Cabang + Petugas Cicilan: pengingat setoran Bank Jago + ringkasan Jurnal Pajak (sudah ada). */
export function Kc5Panel({ onDone }: { onDone: () => void }) {
  const [laporan, setLaporan] = useState<{ tanggalUtc: string; data: LaporanBulanan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-5/hasil/LAPORAN_BULANAN`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: LaporanBulanan } | null }) => setLaporan(j.hasil))
      .catch(() => setLaporan(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = (): void => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/KC-5/jalankan`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Laporan bulanan gagal (HTTP ${r.status})`);
        }
        load();
        onDone();
      })
      .catch(() => setError("Server tidak terjangkau"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 text-sm" data-testid="kc5-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Kepala Cabang & Petugas Cicilan — Laporan Bulanan</p>
        <button type="button" className="ml-auto min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Memeriksa…" : "Jalankan laporan KC-5"}
        </button>
      </div>
      {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-rose-300">{error}</p> : null}
      {laporan === null ? (
        <p className="text-slate-400">Belum ada laporan. Tekan tombol untuk memeriksa status 9 setoran Bank Jago & ringkasan hasil trading.</p>
      ) : (
        <div className="space-y-3" data-testid="kc5-laporan">
          <div className="overflow-x-auto">
            <table className="w-full text-left" data-testid="kc5-cicilan">
              <thead className="text-slate-400">
                <tr><th className="py-1 pr-3">Ke</th><th className="py-1 pr-3">Jatuh tempo</th><th className="py-1 pr-3">Jumlah</th><th className="py-1">Status</th></tr>
              </thead>
              <tbody>
                {laporan.data.cicilan.map((c) => (
                  <tr key={c.jadwal.ke} className="border-t border-white/5">
                    <td className="py-1 pr-3">{c.jadwal.ke}/9</td>
                    <td className="py-1 pr-3">{c.jadwal.tanggal}</td>
                    <td className="py-1 pr-3">{rp(c.jadwal.jumlahRp)}</td>
                    <td className="py-1"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="font-semibold">Hasil trading tahun berjalan (Jurnal Pajak)</p>
            {laporan.data.hasilTrading === null ? (
              <p className="text-slate-400">Belum ada data Jurnal Pajak tahun ini.</p>
            ) : (
              <p className="text-slate-300">
                {laporan.data.hasilTrading.dealCount} transaksi · netto {laporan.data.hasilTrading.nettoUsd >= 0 ? "+$" : "-$"}{Math.abs(laporan.data.hasilTrading.nettoUsd).toFixed(2)}
                {" "}({rp(laporan.data.hasilTrading.nettoIdr)}){laporan.data.hasilTrading.tanpaKurs > 0 ? ` · ${laporan.data.hasilTrading.tanpaKurs} transaksi belum punya kurs pajak` : ""}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
