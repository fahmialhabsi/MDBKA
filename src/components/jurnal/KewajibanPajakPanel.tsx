import { useEffect, useState, type JSX } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  PTKP_STATUSES,
  type PtkpStatus,
  type TaxLiability,
} from "../../../server/types/pajakOP";
import {
  JENIS_PEMBAYARAN,
  MAX_BUKTI_BYTES,
  type JenisPembayaran,
  type PembayaranPajak,
  type ProfilPajak,
} from "../../../server/types/pembayaranPajak";

interface HitungResponse {
  readonly year: number;
  readonly profil: ProfilPajak;
  readonly tradingNettoUsd: number;
  readonly tanpaKurs: number;
  readonly liability: TaxLiability;
  readonly dibayarPasal29Idr: number;
  readonly sisaKurangBayarIdr: number;
  readonly pembayaran: PembayaranPajak[];
}

interface ProfilDraft {
  readonly ptkpStatus: PtkpStatus;
  readonly other: string;
  readonly credit: string;
}

interface BuktiPayload {
  readonly name: string;
  readonly mime: string;
  readonly dataBase64: string;
}

const rp = (n: number): string =>
  `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

const toNumber = (text: string): number => {
  const clean = text.replace(/[^0-9]/g, "");
  return clean === "" ? 0 : Number(clean);
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function readBukti(file: File): Promise<BuktiPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file bukti"));
    reader.onload = () => {
      const text = String(reader.result ?? "");
      resolve({
        name: file.name,
        mime: file.type,
        dataBase64: text.slice(text.indexOf(",") + 1),
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * #510 - Kewajiban Pajak OP atas trading Finex: hitung otomatis (jenis
 * penghasilan, pajak, pasal, kode setoran, nilai), catat pembayaran, dan
 * unggah bukti bayar. Alat bantu perkiraan, bukan nasihat pajak.
 */
export function KewajibanPajakPanel(): JSX.Element {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<HitungResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<ProfilDraft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [tanggal, setTanggal] = useState(todayIso());
  const [jenis, setJenis] = useState<JenisPembayaran>("PPh Pasal 29 OP");
  const [jumlah, setJumlah] = useState("");
  const [ntpn, setNtpn] = useState("");
  const [billing, setBilling] = useState("");
  const [catatan, setCatatan] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/pajak/hitung?year=${year}`);
        const body: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }
        setError(null);
        setData(body as HitungResponse);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [year, tick]);

  if (error !== null) {
    return (
      <p className="text-sm text-amber-300">
        Kewajiban pajak belum tersedia: {error}. Pastikan backend jalan.
      </p>
    );
  }
  if (data === null) {
    return <p className="text-sm text-slate-400">Memuat kewajiban pajak…</p>;
  }

  const liab = data.liability;
  const profil: ProfilDraft = draft ?? {
    ptkpStatus: data.profil.ptkpStatus,
    other: String(data.profil.otherNetIncomeIdr),
    credit: String(data.profil.creditIdr),
  };
  const years = [0, 1, 2].map((i) => new Date().getFullYear() - i);

  const saveProfil = async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/pajak/profil/${year}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ptkpStatus: profil.ptkpStatus,
          otherNetIncomeIdr: toNumber(profil.other),
          creditIdr: toNumber(profil.credit),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDraft(null);
      setMsg("Profil pajak disimpan, perhitungan diperbarui.");
      setTick((n) => n + 1);
    } catch (err) {
      setMsg(String(err));
    }
  };

  const fileTooBig = file !== null && file.size > MAX_BUKTI_BYTES;

  const savePembayaran = async (): Promise<void> => {
    try {
      if (fileTooBig) {
        setMsg("Bukti bayar maksimal 5 MB.");
        return;
      }
      const bukti = file === null ? undefined : await readBukti(file);
      const res = await fetch(`${API_BASE_URL}/api/pajak/pembayaran`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          tanggalBayar: tanggal,
          jenis,
          jumlahIdr: toNumber(jumlah),
          ntpn,
          kodeBilling: billing,
          catatan,
          bukti,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setJumlah("");
      setNtpn("");
      setBilling("");
      setCatatan("");
      setFile(null);
      setMsg("Pembayaran tercatat.");
      setTick((n) => n + 1);
    } catch (err) {
      setMsg(String(err));
    }
  };

  const uploadBukti = async (id: string, f: File): Promise<void> => {
    try {
      if (f.size > MAX_BUKTI_BYTES) {
        setMsg("Bukti bayar maksimal 5 MB.");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/pajak/pembayaran/${id}/bukti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(await readBukti(f)),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setMsg("Bukti bayar tersimpan.");
      setTick((n) => n + 1);
    } catch (err) {
      setMsg(String(err));
    }
  };

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-slate-200";
  const labelCls = "space-y-1 text-xs text-slate-400";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className={labelCls}>
          Tahun pajak{" "}
          <select
            value={year}
            onChange={(ev) => {
              setYear(Number(ev.target.value));
              setDraft(null);
            }}
            className="rounded-lg border border-white/10 bg-slate-950 p-1.5 text-xs text-slate-200"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {msg !== null && <span className="text-xs text-slate-300">{msg}</span>}
      </div>

      {data.tanpaKurs > 0 && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
          {data.tanpaKurs} transaksi {year} belum punya kurs pajak, jadi netto
          Rupiah belum final. Isi kurs KMK di panel 9 sebelum membayar.
        </p>
      )}

      <div className="rounded-xl border border-white/10 p-3 text-xs text-slate-300">
        <p className="mb-2 font-semibold text-slate-200">
          Hasil perhitungan otomatis tahun {year}
        </p>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[14rem_1fr]">
          <dt className="text-slate-400">Jenis penghasilan</dt>
          <dd>{liab.jenisPenghasilan}</dd>
          <dt className="text-slate-400">Netto trading (kurs pajak)</dt>
          <dd>
            {rp(liab.nettoTradingIdr)} ({data.tradingNettoUsd < 0 ? "-" : ""}$
            {Math.abs(data.tradingNettoUsd).toFixed(2)})
            {liab.tradingLoss &&
              " - rugi, tidak ditambahkan ke penghasilan kena pajak (asumsi konservatif)"}
          </dd>
          <dt className="text-slate-400">PTKP ({liab.ptkpStatus})</dt>
          <dd>{rp(liab.ptkpIdr)}</dd>
          <dt className="text-slate-400">PKP total</dt>
          <dd>{rp(liab.pkpTotalIdr)}</dd>
          <dt className="text-slate-400">PPh terutang total</dt>
          <dd>{rp(liab.taxTotalIdr)}</dd>
          <dt className="text-slate-400">Tambahan pajak akibat trading</dt>
          <dd>{rp(liab.taxFromTradingIdr)}</dd>
          <dt className="text-slate-400">Kredit pajak</dt>
          <dd>{rp(liab.creditIdr)}</dd>
          <dt className="text-slate-400">Pajak yang dibayar</dt>
          <dd>{liab.namaPajak}</dd>
          <dt className="text-slate-400">Dasar hukum</dt>
          <dd>{liab.dasarHukum}</dd>
          <dt className="text-slate-400">Kode akun / jenis setoran</dt>
          <dd className="font-mono">
            {liab.kodeAkunPajak}-{liab.kodeJenisSetoran}
          </dd>
          <dt className="text-slate-400">Batas bayar</dt>
          <dd>{liab.jatuhTempo} (sebelum SPT Tahunan disampaikan)</dd>
          <dt className="text-slate-400">Kurang bayar (Pasal 29)</dt>
          <dd className="font-semibold">{rp(liab.kurangBayarIdr)}</dd>
          <dt className="text-slate-400">Sudah dibayar</dt>
          <dd>{rp(data.dibayarPasal29Idr)}</dd>
          <dt className="text-slate-400">Sisa yang harus dibayar</dt>
          <dd
            className={
              data.sisaKurangBayarIdr > 0
                ? "text-base font-bold text-amber-300"
                : "text-base font-bold text-emerald-300"
            }
          >
            {rp(data.sisaKurangBayarIdr)}
          </dd>
        </dl>
        {liab.lebihBayarIdr > 0 && (
          <p className="mt-2 text-emerald-300">
            Lebih bayar {rp(liab.lebihBayarIdr)} (dapat dikompensasi/restitusi
            lewat SPT).
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <p className="text-xs font-semibold text-slate-300">
          Profil pajak {year} (mempengaruhi perhitungan)
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Status PTKP
            <select
              value={profil.ptkpStatus}
              onChange={(ev) =>
                setDraft({
                  ...profil,
                  ptkpStatus: ev.target.value as PtkpStatus,
                })
              }
              className={inputCls}
            >
              {PTKP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Penghasilan neto lain setahun (Rp)
            <input
              inputMode="numeric"
              value={profil.other}
              onChange={(ev) => setDraft({ ...profil, other: ev.target.value })}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Kredit pajak (PPh 21/23/25 sudah dibayar, Rp)
            <input
              inputMode="numeric"
              value={profil.credit}
              onChange={(ev) =>
                setDraft({ ...profil, credit: ev.target.value })
              }
              className={inputCls}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void saveProfil()}
          className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200"
        >
          Simpan profil &amp; hitung ulang
        </button>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <p className="text-xs font-semibold text-slate-300">
          Catat pembayaran pajak &amp; unggah bukti bayar
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Tanggal bayar
            <input
              type="date"
              value={tanggal}
              onChange={(ev) => setTanggal(ev.target.value)}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Jenis pembayaran
            <select
              value={jenis}
              onChange={(ev) => setJenis(ev.target.value as JenisPembayaran)}
              className={inputCls}
            >
              {JENIS_PEMBAYARAN.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Jumlah dibayar (Rp)
            <input
              inputMode="numeric"
              value={jumlah}
              onChange={(ev) => setJumlah(ev.target.value)}
              placeholder={String(data.sisaKurangBayarIdr)}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            NTPN (16 karakter, dari bukti bayar)
            <input
              value={ntpn}
              onChange={(ev) => setNtpn(ev.target.value)}
              className={`${inputCls} font-mono`}
            />
          </label>
          <label className={labelCls}>
            Kode billing (15 digit)
            <input
              inputMode="numeric"
              value={billing}
              onChange={(ev) => setBilling(ev.target.value)}
              className={`${inputCls} font-mono`}
            />
          </label>
          <label className={labelCls}>
            Catatan
            <input
              value={catatan}
              onChange={(ev) => setCatatan(ev.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className={labelCls}>
            Bukti bayar (PDF/PNG/JPG, maks 5 MB)
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
              className="block text-xs text-slate-300"
            />
          </label>
          <button
            type="button"
            onClick={() => setJumlah(String(data.sisaKurangBayarIdr))}
            className="rounded-lg bg-slate-500/20 px-3 py-1.5 text-xs text-slate-200"
          >
            Isi sisa kurang bayar
          </button>
          <button
            type="button"
            onClick={() => void savePembayaran()}
            disabled={toNumber(jumlah) <= 0 || fileTooBig}
            className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 disabled:opacity-40"
          >
            Simpan pembayaran
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-2 py-1">Tanggal</th>
              <th className="px-2 py-1">Jenis</th>
              <th className="px-2 py-1">Kode akun</th>
              <th className="px-2 py-1">Jumlah</th>
              <th className="px-2 py-1">NTPN</th>
              <th className="px-2 py-1">Bukti</th>
            </tr>
          </thead>
          <tbody>
            {data.pembayaran.length === 0 && (
              <tr>
                <td className="px-2 py-2 text-slate-500" colSpan={6}>
                  Belum ada pembayaran tercatat untuk {year}.
                </td>
              </tr>
            )}
            {data.pembayaran.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="px-2 py-1 whitespace-nowrap">
                  {p.tanggalBayar}
                </td>
                <td className="px-2 py-1">{p.jenis}</td>
                <td className="px-2 py-1 font-mono">{p.kodeAkun}</td>
                <td className="px-2 py-1">{rp(p.jumlahIdr)}</td>
                <td className="px-2 py-1 font-mono">
                  {p.ntpn === "" ? "-" : p.ntpn}
                </td>
                <td className="px-2 py-1">
                  {p.bukti !== null ? (
                    <a
                      href={`${API_BASE_URL}/api/pajak/pembayaran/${p.id}/bukti`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300 underline"
                    >
                      {p.bukti.fileName}
                    </a>
                  ) : (
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        if (f !== undefined) void uploadBukti(p.id, f);
                      }}
                      className="block max-w-[11rem] text-[11px] text-slate-400"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href={`${API_BASE_URL}/api/pajak/laporan?year=${year}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200"
        >
          Lihat Laporan Pajak {year}
        </a>
        <a
          href={`${API_BASE_URL}/api/pajak/laporan?year=${year}&download=1`}
          download
          className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200"
        >
          Unduh Laporan (HTML)
        </a>
      </div>
      <p className="text-[11px] text-slate-500">
        Perkiraan berdasarkan UU PPh Pasal 17 ayat (1) huruf a (UU HPP) dan PTKP
        PMK 101/PMK.010/2016; bukan nasihat pajak. Perlakuan rugi trading dan
        kredit pajak sebaiknya dikonfirmasi ke KPP/konsultan pajak sebelum SPT
        Tahunan.
      </p>
    </div>
  );
}
