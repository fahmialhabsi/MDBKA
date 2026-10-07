import { useEffect, useState, type JSX } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  dealNettoUsd,
  isTradeDeal,
  type JurnalEntry,
  type JurnalYearSummary,
} from "../../../server/types/jurnalPajak";

interface JurnalResponse {
  readonly login: string;
  readonly file: string;
  readonly sourceFound: boolean;
  readonly count: number;
  readonly summary: JurnalYearSummary[];
  readonly entries: JurnalEntry[];
}

/** Perkiraan kasar saja (bukan kurs pajak) untuk gambaran Rupiah sebelum kurs KMK ditempel. */
const FALLBACK_USD_IDR = 17911;

const usd = (n: number): string =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const rp = (n: number): string =>
  `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

/**
 * #508 - Jurnal Pajak (Finex live): transaksi MT5 masuk otomatis dari
 * service MDBKAHistoryService; kurs pajak (KMK) cukup ditempel sebagai teks.
 * Alat bantu pencatatan penghasilan, bukan nasihat pajak/konsultan.
 */
export function JurnalPajakPanel(): JSX.Element {
  const [data, setData] = useState<JurnalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kursFrom, setKursFrom] = useState("");
  const [kursTo, setKursTo] = useState("");
  const [kursValue, setKursValue] = useState("");
  const [kursMsg, setKursMsg] = useState<string | null>(null);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/jurnal-pajak`);
        const body: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }
        setError(null);
        setData(body as JurnalResponse);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tick]);

  const kursReady =
    kursFrom !== "" && kursTo !== "" && kursValue.trim() !== "" && kursFrom <= kursTo;

  const applyKurs = async (): Promise<void> => {
    if (!kursReady) {
      setKursMsg("Isi tanggal mulai, tanggal akhir (tidak boleh lebih awal), dan nilai kurs.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/jurnal-pajak/kurs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${kursFrom} s/d ${kursTo} ${kursValue.trim()}` }),
      });
      const body = (await res.json()) as {
        updated?: number;
        rejected?: string[];
        error?: string;
      };
      if (!res.ok) {
        setKursMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const rejected = body.rejected ?? [];
      setKursMsg(
        `${body.updated ?? 0} transaksi diperbarui.` +
          (rejected.length > 0
            ? ` Baris tidak dikenali (${rejected.length}): ${rejected.join(" | ")}`
            : ""),
      );
      setTick((n) => n + 1);
    } catch (err) {
      setKursMsg(String(err));
    }
  };

  if (error !== null) {
    return (
      <p className="text-sm text-amber-300">
        Jurnal pajak belum tersedia: {error}. Pastikan backend jalan.
      </p>
    );
  }
  if (data === null) {
    return <p className="text-sm text-slate-400">Memuat jurnal pajak…</p>;
  }

  const rows = [...data.entries].reverse();

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Akun Finex {data.login} · {data.count} deal ·{" "}
        {data.sourceFound
          ? "sinkron otomatis dari MT5 (tiap 60 dtk)"
          : "CSV History MT5 belum ditemukan — jalankan service MDBKAHistoryService"}
      </p>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-2 py-1">Tahun</th>
              <th className="px-2 py-1">Profit</th>
              <th className="px-2 py-1">Swap</th>
              <th className="px-2 py-1">Komisi</th>
              <th className="px-2 py-1">Netto USD</th>
              <th className="px-2 py-1">Netto Rp (kurs terisi)</th>
              <th className="px-2 py-1">Perkiraan Rp kasar</th>
              <th className="px-2 py-1">Setoran</th>
              <th className="px-2 py-1">Penarikan</th>
              <th className="px-2 py-1">Tanpa kurs</th>
            </tr>
          </thead>
          <tbody>
            {data.summary.map((s) => (
              <tr key={s.year} className="border-t border-white/5">
                <td className="px-2 py-1 font-semibold">{s.year}</td>
                <td className="px-2 py-1">{usd(s.profitUsd)}</td>
                <td className="px-2 py-1">{usd(s.swapUsd)}</td>
                <td className="px-2 py-1">{usd(s.commissionUsd)}</td>
                <td className="px-2 py-1 font-semibold">{usd(s.nettoUsd)}</td>
                <td className="px-2 py-1">{rp(s.nettoIdr)}</td>
                <td className="px-2 py-1 text-slate-400">
                  {rp(s.nettoUsd * FALLBACK_USD_IDR)}
                </td>
                <td className="px-2 py-1">{usd(s.depositUsd)}</td>
                <td className="px-2 py-1">{usd(s.withdrawalUsd)}</td>
                <td
                  className={
                    s.tanpaKurs > 0 ? "px-2 py-1 text-amber-300" : "px-2 py-1"
                  }
                >
                  {s.tanpaKurs}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Perkiraan Rp kasar memakai kurs ±Rp{FALLBACK_USD_IDR.toLocaleString("id-ID")}/USD
        hanya sebagai gambaran, bukan kurs pajak. Untuk laporan, tempel kurs pajak (KMK)
        per tanggal di bawah.
      </p>

      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <p className="text-xs font-semibold text-slate-300">
          Kurs pajak (KMK): pilih rentang tanggal, tempel nilai kurs, lalu Terapkan
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-400">
            Dari tanggal
            <input
              type="date"
              value={kursFrom}
              onChange={(ev) => setKursFrom(ev.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-slate-200"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Sampai tanggal
            <input
              type="date"
              value={kursTo}
              min={kursFrom}
              onChange={(ev) => setKursTo(ev.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-slate-200"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Kurs (Rp per 1 USD)
            <input
              type="text"
              inputMode="decimal"
              value={kursValue}
              onChange={(ev) => setKursValue(ev.target.value)}
              placeholder="contoh: 16.650,00"
              className="w-full rounded-lg border border-white/10 bg-slate-950 p-2 font-mono text-xs text-slate-200"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void applyKurs()}
            disabled={!kursReady}
            className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-40"
          >
            Terapkan kurs
          </button>
          <a
            href={`${API_BASE_URL}/api/jurnal-pajak/export.csv`}
            download
            className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200"
          >
            Unduh CSV (Excel)
          </a>
          {kursMsg !== null && (
            <span className="text-xs text-slate-300">{kursMsg}</span>
          )}
        </div>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr>
              <th className="px-2 py-1">Waktu (server)</th>
              <th className="px-2 py-1">Simbol</th>
              <th className="px-2 py-1">Tipe</th>
              <th className="px-2 py-1">Lot</th>
              <th className="px-2 py-1">Profit</th>
              <th className="px-2 py-1">Swap</th>
              <th className="px-2 py-1">Komisi</th>
              <th className="px-2 py-1">Netto USD</th>
              <th className="px-2 py-1">Kurs</th>
              <th className="px-2 py-1">Netto Rp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const trade = isTradeDeal(e);
              const net = trade ? dealNettoUsd(e) : null;
              const balance = e.type === "BALANCE";
              return (
                <tr
                  key={e.dealTicket}
                  className={
                    balance
                      ? "bg-sky-400/10 text-sky-200"
                      : "border-t border-white/5"
                  }
                >
                  <td className="px-2 py-1 whitespace-nowrap">{e.serverTime}</td>
                  <td className="px-2 py-1">{balance ? "Setoran/Tarik" : e.symbol}</td>
                  <td className="px-2 py-1">
                    {balance ? "BALANCE" : `${e.type} ${e.entry}`}
                  </td>
                  <td className="px-2 py-1">{trade ? e.volume.toFixed(2) : "—"}</td>
                  <td className="px-2 py-1">{usd(e.profit)}</td>
                  <td className="px-2 py-1">{trade ? usd(e.swap) : "—"}</td>
                  <td className="px-2 py-1">{trade ? usd(e.commission) : "—"}</td>
                  <td className="px-2 py-1 font-semibold">
                    {net === null ? "—" : usd(net)}
                  </td>
                  <td className="px-2 py-1">
                    {e.kursIdr === null
                      ? "—"
                      : `${e.kursIdr.toLocaleString("id-ID")} (${e.kursSumber ?? ""})`}
                  </td>
                  <td className="px-2 py-1">
                    {balance
                      ? e.idrAmount === null
                        ? "—"
                        : rp(e.idrAmount)
                      : net !== null && e.kursIdr !== null
                        ? rp(net * e.kursIdr)
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Alat bantu pencatatan, bukan nasihat pajak. Penghasilan trading dilaporkan
        di SPT Tahunan; konfirmasi perlakuan pajaknya ke konsultan/KPP.
      </p>
    </div>
  );
}
