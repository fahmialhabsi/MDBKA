import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { RangkaianDemo } from "../../lib/kc4PengawasDemo";

interface PosisiTerbuka {
  readonly ticket: string;
  readonly symbol: string;
  readonly side: string;
  readonly volume: number;
  readonly priceOpen: number;
  readonly sl: number | null;
  readonly tp: number | null;
  readonly timeOpen: string;
}

const LAMP_CLASS = { HIJAU: "text-emerald-300", MERAH: "text-rose-300", BELUM: "text-slate-400" } as const;
const KELUAR_CLASS = { TP: "text-emerald-300", SL: "text-rose-300", MANUAL: "text-slate-300" } as const;

/** KC-4 Pengawas Demo: serah-terima hasil trade akun demo (lampu 2). Hanya membaca & mencatat — tidak mengirim order. */
export function Kc4DemoPanel({ onDone }: { onDone: () => void }) {
  const [data, setData] = useState<{ tanggalUtc: string; data: RangkaianDemo } | null>(null);
  const [posisi, setPosisi] = useState<readonly PosisiTerbuka[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formulirBaru, setFormulirBaru] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang/KC-4/hasil/RANGKAIAN_DEMO`)
      .then((r) => (r.ok ? r.json() : { hasil: null }))
      .then((j: { hasil: { tanggalUtc: string; data: RangkaianDemo } | null }) => {
        setData(j.hasil);
        const broker = j.hasil?.data.broker;
        if (broker === undefined) return;
        fetch(`${API_BASE_URL}/api/positions?broker=${encodeURIComponent(broker)}`)
          .then((r) => (r.ok ? r.json() : { positions: [] }))
          .then((p: { positions?: PosisiTerbuka[] }) => setPosisi(p.positions ?? []))
          .catch(() => setPosisi([]));
      })
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = (): void => {
    setBusy(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/KC-4/demo/jalankan`, { method: "POST" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { error?: string; formulir?: unknown[] };
        if (!r.ok) setError(j.error ?? `Rekap gagal (HTTP ${r.status})`);
        else setFormulirBaru(j.formulir?.length ?? 0);
        load();
        onDone();
      })
      .catch(() => setError("Server tidak terjangkau"))
      .finally(() => setBusy(false));
  };

  const d = data?.data;
  const s = d?.ringkasan;

  return (
    <section className="space-y-3 rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-4 text-sm" data-testid="kc4-demo-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Pengawas Demo (lampu 2) — rekap hasil trade akun demo</p>
        <button type="button" className="ml-auto min-h-11 rounded-xl bg-sky-700 px-4 font-semibold disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Merekap… (bisa belasan detik)" : "Rekap hasil demo"}
        </button>
      </div>
      {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-rose-300">{error}</p> : null}
      {formulirBaru !== null && error === null ? (
        <p className="text-xs text-slate-400">{formulirBaru === 0 ? "Tidak ada Formulir R baru (lampu 2 belum punya vonis atau bukti sama dengan laporan sebelumnya)." : `${formulirBaru} Formulir R baru dikirim ke Pusat.`}</p>
      ) : null}

      {posisi.length > 0 ? (
        <div data-testid="kc4-demo-terbuka">
          <p className="font-semibold">Sedang berjalan ({posisi.length})</p>
          <ul className="text-slate-300">
            {posisi.map((p) => (
              <li key={p.ticket}>
                {p.symbol} {p.side} {p.volume} lot · masuk {p.priceOpen} · SL {p.sl ?? "…"} · TP {p.tp ?? "…"}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Hasilnya masuk rekap setelah posisi tertutup (SL/TP/manual) dan History MT5 diperbarui (≤ 30 detik).</p>
        </div>
      ) : null}

      {d === undefined || s === undefined ? (
        <p className="text-slate-400">Belum ada rekap. Tekan "Rekap hasil demo" setelah ada trade demo yang tertutup. Butuh broker terpilih dari KC-1.</p>
      ) : (
        <div className="space-y-3" data-testid="kc4-demo-rekap">
          <p className="text-slate-300">
            {d.broker} · akun demo: {d.akun.length === 0 ? "belum ada yang terbukti demo" : d.akun.map((a) => a.label).join(", ")} · {data?.tanggalUtc.slice(0, 16).replace("T", " ")} UTC
          </p>
          <p className="text-slate-400">
            Trade tertutup {s.n} · TP {s.tp} · SL {s.sl} · manual {s.manual} · setara Live {s.setaraLive} (dihitung lampu 2) · tidak setara Live {s.tidakSetaraLive} · rata-rata R{" "}
            {s.rataR === null ? "…" : s.rataR} dari {s.nBerR} trade ber-SL awal
            {s.dikecualikan > 0 ? ` · ${s.dikecualikan} trade akun bukan-demo tidak direkap` : ""}
          </p>

          <div>
            <p className="font-semibold">Lampu 2 per golongan</p>
            {d.lampu2.length === 0 ? (
              <p className="text-slate-400">Belum ada rangkaian.</p>
            ) : (
              <ul data-testid="kc4-demo-lampu2">
                {d.lampu2.map((l) => (
                  <li key={l.group} className="border-t border-white/5 py-1">
                    <span className={`mr-2 font-semibold ${LAMP_CLASS[l.state]}`}>{l.state}</span>
                    {l.label} — <span className="text-slate-400">{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {d.trades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left" data-testid="kc4-demo-trades">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">Tutup</th>
                    <th className="py-1 pr-3">Simbol</th>
                    <th className="py-1 pr-3">Arah</th>
                    <th className="py-1 pr-3">Keluar</th>
                    <th className="py-1 pr-3 text-right">Hasil</th>
                    <th className="py-1 pr-3 text-right">R</th>
                    <th className="py-1">Setara Live</th>
                  </tr>
                </thead>
                <tbody>
                  {d.trades.slice(0, 10).map((t) => (
                    <tr key={`${t.login}-${t.positionId}`} className="border-t border-white/5">
                      <td className="py-1 pr-3">{t.tutup}</td>
                      <td className="py-1 pr-3">{t.simbol}</td>
                      <td className="py-1 pr-3">{t.arah}</td>
                      <td className={`py-1 pr-3 ${KELUAR_CLASS[t.keluar]}`}>{t.keluar}</td>
                      <td className="py-1 pr-3 text-right">{t.net.toFixed(2)} {t.mataUang}</td>
                      <td className="py-1 pr-3 text-right">{t.r === null ? "…" : t.r}</td>
                      <td className="py-1">{t.setaraLive === true ? "ya" : t.setaraLive === false ? "tidak (uji)" : "…"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.trades.length > 10 ? <p className="mt-1 text-xs text-slate-500">10 terbaru dari {d.trades.length} yang disimpan di map.</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
