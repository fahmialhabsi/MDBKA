import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { useDataQualitySemua } from "../../hooks/useDataQualitySemua";
import type { BrokerId } from "../../types/broker";

const LABEL: Record<BrokerId, string> = {
  finex: "Finex",
  orbitraderberjangka: "OTB",
  mifx: "MIFX",
  exness: "Exness",
};

/**
 * Strip status kesehatan SEMUA broker (quotes.csv/equity.csv/koneksi terminal) di header dashboard
 * utama — audit A-3 (16 Okt 2026). Sekali lihat tahu ada EA yang lepas, tanpa investigasi manual
 * (kejadian nyata: EA MDBKAMultiLive Finex lepas ±4 jam, baru ketahuan lewat penyelidikan terpisah).
 */
export function StatusKesehatanStrip() {
  const status = useDataQualitySemua();
  if (status === null) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500" data-testid="status-kesehatan-strip">
        <HelpCircle size={13} /> Status EA: …
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="status-kesehatan-strip">
      {status.map((s) => {
        const belumTerpasang = s.catatan !== undefined;
        const Icon = belumTerpasang ? HelpCircle : s.lulus ? CheckCircle2 : AlertTriangle;
        const warna = belumTerpasang ? "text-slate-500" : s.lulus ? "text-emerald-400" : "text-rose-400";
        const judul = belumTerpasang ? s.catatan : (s.alasan ?? "Data hidup — equity, harga, koneksi terminal lulus semua");
        return (
          <span key={s.broker} className={`inline-flex items-center gap-1 ${warna}`} title={judul} data-testid={`status-kesehatan-${s.broker}`}>
            <Icon size={13} />
            {LABEL[s.broker]}
          </span>
        );
      })}
    </div>
  );
}
