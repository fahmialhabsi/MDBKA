import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  BRANCHES,
  branchByCode,
  branchPageUrl,
  type BranchCode,
  type BranchPageParams,
  type Decision,
  type DecisionKind,
  type Recommendation,
  type RecStatus,
} from "../../lib/branchOffice";
import { branchFlows, PETUGAS } from "../../lib/branchArchitecture";
import { Kc1Panel } from "./Kc1Panel";
import { Kc2Panel } from "./Kc2Panel";
import { Kc3Panel } from "./Kc3Panel";
import { Kc4Panel } from "./Kc4Panel";
import { Kc4DemoPanel } from "./Kc4DemoPanel";
import { Kc5Panel } from "./Kc5Panel";

interface Summary {
  readonly code: BranchCode;
  readonly name: string;
  readonly total: number;
  readonly menunggu: number;
}

interface Row {
  readonly rec: Recommendation;
  readonly decisions: readonly Decision[];
  readonly status: RecStatus;
}

const STATUS_STYLE: Record<RecStatus, string> = {
  MENUNGGU: "bg-amber-500/15 text-amber-300",
  DITUNDA: "bg-slate-500/20 text-slate-300",
  DISETUJUI: "bg-emerald-500/15 text-emerald-300",
  DITOLAK: "bg-rose-500/15 text-rose-300",
};

const wit = (iso: string): string =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jayapura", dateStyle: "medium", timeStyle: "short" }) + " WIT";

/** C0: halaman Kantor Pusat (Meja Rekomendasi) dan halaman tiap Kantor Cabang. */
export function BranchPage({ params }: { params: BranchPageParams }) {
  const branch = branchByCode(params.code);
  const [summary, setSummary] = useState<Summary[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/cabang`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { cabang?: Summary[] }) => setSummary(j.cabang ?? []))
      .catch(() => setSummary(null));
    const codes = branch === null ? BRANCHES.map((b) => b.code) : [branch.code];
    Promise.all(
      codes.map((c) =>
        fetch(`${API_BASE_URL}/api/cabang/${c}`)
          .then((r) => (r.ok ? r.json() : { rekomendasi: [] }))
          .then((j: { rekomendasi?: Row[] }) => j.rekomendasi ?? []),
      ),
    )
      .then((lists) => {
        const all = lists.flat();
        // Pusat: hanya yang masih menunggu keputusan.
        setRows(branch === null ? all.filter((x) => x.status === "MENUNGGU" || x.status === "DITUNDA") : all);
      })
      .catch(() => setRows(null));
  }, [branch]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = (row: Row, keputusan: DecisionKind): void => {
    setError(null);
    fetch(`${API_BASE_URL}/api/cabang/${row.rec.cabang}/${row.rec.id}/keputusan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keputusan, catatan: notes[row.rec.id] ?? "" }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Gagal menyimpan keputusan (HTTP ${r.status})`);
        }
        load();
      })
      .catch(() => setError("Server tidak terjangkau"));
  };

  const tab = (on: boolean): string =>
    `min-h-11 inline-flex items-center rounded-xl px-4 text-sm font-semibold ${on ? "bg-emerald-700 text-white" : "border border-white/15 text-slate-300 hover:bg-white/5"}`;

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Building2 size={20} className="text-emerald-400" />
            {branch === null ? "Kantor Pusat MDBKA" : `${branch.code} ${branch.name}`}
          </h1>
        </div>

        <nav className="flex flex-wrap gap-2" data-testid="branch-tabs">
          <a href={branchPageUrl(null)} className={tab(branch === null)}>Pusat</a>
          {BRANCHES.map((b) => {
            const s = summary?.find((x) => x.code === b.code);
            return (
              <a key={b.code} href={branchPageUrl(b.code)} className={tab(branch?.code === b.code)}>
                {b.code} {b.name}
                {s !== undefined && s.menunggu > 0 ? <span className="ml-2 rounded-full bg-amber-500 px-2 text-xs text-slate-950">{s.menunggu}</span> : null}
              </a>
            );
          })}
        </nav>

        {branch === null ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">Merangkak Dari Bawah Ke Atas</p>
            <p>Cabang hanya memberi rekomendasi. Keputusan SETUJU/TOLAK hanya oleh Kantor Pusat dan tidak bisa ditimpa; TUNDA boleh diputuskan lagi nanti.</p>
          </section>
        ) : (
          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p><span className="text-slate-400">Misi:</span> {branch.misi}</p>
            <p><span className="text-slate-400">Hasil untuk Pusat:</span> {branch.hasil}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left" data-testid="branch-structure">
                <thead className="text-slate-400">
                  <tr><th className="py-1 pr-3">Jabatan</th><th className="py-1 pr-3">Pemegang</th>{branch.struktur.some((p) => p.syarat !== undefined) ? <><th className="py-1 pr-3">Syarat jabatan</th><th className="py-1 pr-3">Calon memenuhi?</th></> : null}<th className="py-1 pr-3">Tugas</th><th className="py-1 pr-3">Tanggung jawab</th><th className="py-1">Batas wewenang</th></tr>
                </thead>
                <tbody>
                  {branch.struktur.map((p) => (
                    <tr key={p.jabatan} className="border-t border-white/5">
                      <td className="py-1 pr-3 align-top font-semibold">{p.jabatan}</td>
                      <td className="py-1 pr-3 align-top text-slate-300">{p.pemegang}</td>
                      {branch.struktur.some((x) => x.syarat !== undefined) ? (
                        <>
                          <td className="py-1 pr-3 align-top text-slate-300">{p.syarat ?? "—"}</td>
                          <td className="py-1 pr-3 align-top">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.calon === "TERSEDIA" ? "bg-emerald-500/15 text-emerald-300" : p.calon === "SEBAGIAN" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"}`}>
                              {p.calon === "TERSEDIA" ? "Tersedia" : p.calon === "SEBAGIAN" ? "Sebagian" : "Belum ada"}
                            </span>
                          </td>
                        </>
                      ) : null}
                      <td className="py-1 pr-3 text-slate-300">{p.tugas}</td>
                      <td className="py-1 pr-3 text-slate-300">{p.tanggungJawab}</td>
                      <td className="py-1 text-slate-300">{p.wewenang}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div data-testid="branch-sop">
                <p className="font-semibold">SOP</p>
                <ol className="list-decimal space-y-0.5 pl-5 text-slate-300">
                  {branch.sop.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
              <div data-testid="branch-flow">
                <p className="font-semibold">Alur kerja</p>
                <ol className="space-y-1 text-slate-300">
                  {branch.alur.map((step, i) => (
                    <li key={step}>{i > 0 ? <span className="mr-1 text-emerald-400">↓</span> : null}{step}</li>
                  ))}
                </ol>
              </div>
            </div>
            {PETUGAS.some((p) => p.cabang === branch.code) ? (
              <div className="space-y-2" data-testid="branch-architecture">
                <p className="font-semibold">Arsitektur (map hasil antar-cabang)</p>
                <ul className="list-disc pl-5 text-slate-300">
                  {branchFlows().filter((f) => f.dari === branch.code || f.ke === branch.code).map((f) => (
                    <li key={`${f.dari}-${f.ke}-${f.hasil}`}>{f.dari === branch.code ? `Mengirim ${f.hasil} ke ${f.ke}` : `Menerima ${f.hasil} dari ${f.dari}`}</li>
                  ))}
                </ul>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-slate-400">
                      <tr><th className="py-1 pr-3">Petugas</th><th className="py-1 pr-3">Membaca</th><th className="py-1 pr-3">Menulis</th><th className="py-1">Status</th></tr>
                    </thead>
                    <tbody>
                      {PETUGAS.filter((p) => p.cabang === branch.code).map((p) => (
                        <tr key={p.id} className="border-t border-white/5">
                          <td className="py-1 pr-3 font-semibold">{p.jabatan}</td>
                          <td className="py-1 pr-3 text-slate-300">{p.membaca.length === 0 ? "—" : p.membaca.join(", ")}</td>
                          <td className="py-1 pr-3 text-slate-300">{p.menulis}</td>
                          <td className="py-1"><span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "AKTIF" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>{p.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {branch?.code === "KC-1" ? <Kc1Panel onDone={load} /> : null}
        {branch?.code === "KC-2" ? <Kc2Panel onDone={load} /> : null}
        {branch?.code === "KC-3" ? <Kc3Panel onDone={load} /> : null}
        {branch?.code === "KC-4" ? <Kc4Panel onDone={load} /> : null}
        {branch?.code === "KC-4" ? <Kc4DemoPanel onDone={load} /> : null}
        {branch?.code === "KC-5" ? <Kc5Panel onDone={load} /> : null}

        <section className="space-y-3">
          <h2 className="text-lg font-bold">{branch === null ? "Meja Rekomendasi (menunggu keputusan)" : "Rekomendasi cabang ini"}</h2>
          {error !== null ? <p className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-300">{error}</p> : null}
          {rows === null ? (
            <p className="text-sm text-slate-400">Server tidak terjangkau — rekomendasi belum bisa dibaca.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400" data-testid="branch-empty">Belum ada rekomendasi.</p>
          ) : (
            rows.map((row) => (
              <article key={row.rec.id} className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm" data-testid={`rec-${row.rec.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status]}`}>{row.status}</span>
                  <span className="font-semibold">{row.rec.judul}</span>
                  <span className="ml-auto text-xs text-slate-400">{row.rec.id} · {wit(row.rec.tanggalUtc)}</span>
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-slate-300">
                  {row.rec.fakta.map((f, i) => (
                    <li key={i}>{f.teks} <span className="text-xs text-slate-500">({f.sumber})</span></li>
                  ))}
                </ul>
                <p><span className="text-slate-400">Batas data:</span> {row.rec.batasData}</p>
                <p><span className="text-slate-400">Usulan:</span> {row.rec.usulan}</p>
                <p><span className="text-slate-400">Risiko bila disetujui:</span> {row.rec.risiko}</p>
                {row.decisions.map((d, i) => (
                  <p key={i} className="text-xs text-slate-400">Keputusan {d.keputusan} · {wit(d.tanggalUtc)}{d.catatan !== "" ? ` · ${d.catatan}` : ""}</p>
                ))}
                {row.status === "MENUNGGU" || row.status === "DITUNDA" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="min-h-11 flex-1 rounded-xl border border-white/15 bg-slate-900 px-3"
                      placeholder="Catatan keputusan (opsional)"
                      value={notes[row.rec.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [row.rec.id]: e.target.value })}
                    />
                    <button type="button" className="min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold" onClick={() => decide(row, "SETUJU")}>Setuju</button>
                    <button type="button" className="min-h-11 rounded-xl bg-rose-700 px-4 font-semibold" onClick={() => decide(row, "TOLAK")}>Tolak</button>
                    <button type="button" className="min-h-11 rounded-xl border border-white/15 px-4 font-semibold text-slate-300" onClick={() => decide(row, "TUNDA")}>Tunda</button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
