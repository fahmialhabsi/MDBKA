import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ScanSearch } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { LiveQuoteLike } from "../../lib/csvQuote";
import {
  lolosLabel,
  mergeGroupStats,
  proofStatus,
  type EvalAccount,
} from "../../lib/evaluationView";
import { formatSharePercent } from "../../lib/signalReason";
import {
  lastCandleTimeMs,
  scanSymbol,
  sortScanRows,
  type ScanStatus,
} from "../../lib/symbolScanner";
import { useBrokerPositions } from "../../hooks/useBrokerPositions";
import type { ExchangeRates } from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

/**
 * Langkah 3c (Mode Aman, 8 Okt 2026) — pemindai simbol.
 *
 * Semua simbol broker aktif yang punya CSV H1 dianalisa dengan mesin yang
 * sama dengan "Hasil analisa", lalu diurutkan: lolos Mode Aman dulu,
 * kemudian yang paling dekat lolos. Hanya informasi; keputusan entry tetap
 * diverifikasi di Hasil Analisa simbol itu.
 */
interface CandleItem {
  readonly symbol: string;
  readonly csv: string;
  readonly modified: string;
  readonly quote: LiveQuoteLike | null;
}

interface Props {
  readonly brokerId: BrokerId;
  readonly equity: number;
  readonly fxRates: ExchangeRates | null;
  /** Klik status LOLOS → buka Hasil analisa simbol itu (tanpa upload). */
  readonly onOpenAnalysis?: (symbol: string) => void;
}

const REFRESH_MS = 60_000;
const EVAL_REFRESH_MS = 5 * 60_000;
const COLLAPSED_ROWS = 12;

const STATUS_VIEW: Record<ScanStatus, { label: string; className: string }> = {
  LOLOS: { label: "Lolos · belum terbukti", className: "bg-emerald-400/15 text-emerald-300" },
  DITAHAN_BIAYA: { label: "Biaya mahal", className: "bg-sky-400/15 text-sky-300" },
  DITAHAN_RISIKO: { label: "Risiko > batas", className: "bg-amber-400/15 text-amber-300" },
  DITAHAN_KORELASI: { label: "Taruhan ganda", className: "bg-fuchsia-400/15 text-fuchsia-300" },
  TUNGGU: { label: "Tunggu", className: "bg-white/10 text-slate-300" },
  PASAR_TUTUP: { label: "Pasar tutup / basi", className: "bg-white/5 text-slate-500" },
  DATA: { label: "Data kurang", className: "bg-white/5 text-slate-500" },
};

export function SymbolScannerPanel({ brokerId, equity, fxRates, onOpenAnalysis }: Props) {
  const [items, setItems] = useState<readonly CandleItem[]>([]);
  // Broker asal `items`: hasil hanya dipakai untuk broker yang sama.
  const [itemsBroker, setItemsBroker] = useState<BrokerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const key = `${brokerId}|${tick}`;
  // Langkah 4d: hasil nyata trade berstatus LOLOS (History MT5).
  const [evalAccounts, setEvalAccounts] = useState<readonly EvalAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/evaluation`);
        if (!res.ok) return;
        const body = (await res.json()) as { accounts?: EvalAccount[] };
        if (!cancelled) setEvalAccounts(Array.isArray(body.accounts) ? body.accounts : []);
      } catch {
        // Evaluasi opsional: label tetap "belum terbukti".
      }
    };
    void load();
    const id = window.setInterval(() => void load(), EVAL_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  // Langkah D: posisi terbuka broker aktif → blokir sinyal searah.
  const { positions } = useBrokerPositions(brokerId);
  const positionsKey = positions
    .map((p) => `${p.symbol}:${p.side}`)
    .sort()
    .join(",");
  const openPositions = useMemo(
    () =>
      positionsKey === ""
        ? []
        : positionsKey.split(",").map((part) => {
            const i = part.lastIndexOf(":");
            return { symbol: part.slice(0, i), side: part.slice(i + 1) };
          }),
    [positionsKey],
  );
  const lolosStats = mergeGroupStats(evalAccounts, brokerId, "LOLOS");
  const lolosView = {
    label: lolosLabel(lolosStats),
    className:
      lolosStats !== null && proofStatus(lolosStats) === "TERBUKTI_NEGATIF"
        ? "bg-red-400/15 text-red-200"
        : STATUS_VIEW.LOLOS.className,
  };

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/candles?broker=${brokerId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { items?: CandleItem[] };
        if (cancelled) return;
        setItems(Array.isArray(body.items) ? body.items : []);
        setItemsBroker(brokerId);
        setError(null);
        setFetchedAt(new Date().toLocaleTimeString("id-ID"));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
      if (!cancelled) setLoadedKey(key);
    };
    void load();
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key memuat brokerId + tick
  }, [key]);

  const rows = useMemo(() => {
    const source = itemsBroker === brokerId ? items : [];
    // Candle terbaru broker ini = acuan "pasar buka" (jam server yang sama).
    const reference = source.reduce<number | null>((max, item) => {
      const t = lastCandleTimeMs(item.csv);
      return t !== null && (max === null || t > max) ? t : max;
    }, null);
    return sortScanRows(
      source.map((item) =>
        scanSymbol({
          symbol: item.symbol,
          brokerId,
          csv: item.csv,
          quote: item.quote,
          equity,
          fxRates,
          referenceCandleMs: reference,
          openPositions,
        }),
      ),
    );
  }, [items, itemsBroker, brokerId, equity, fxRates, openPositions]);

  const counts = rows.reduce<Record<ScanStatus, number>>(
    (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
    { LOLOS: 0, DITAHAN_BIAYA: 0, DITAHAN_RISIKO: 0, DITAHAN_KORELASI: 0, TUNGGU: 0, PASAR_TUTUP: 0, DATA: 0 },
  );
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
  const loading =
    loadedKey === null || (itemsBroker !== brokerId && error === null);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10 lg:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-400">
            <ScanSearch size={20} />
          </div>
          <div>
            <h2 className="font-bold text-white">Pemindai simbol — Mode Aman</h2>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} simbol ber-CSV · {counts.LOLOS} lolos ·{" "}
              {counts.DITAHAN_BIAYA} biaya mahal · {counts.DITAHAN_RISIKO} risiko
              &gt; batas · {counts.DITAHAN_KORELASI} taruhan ganda ·{" "}
              {counts.TUNGGU} tunggu · {counts.PASAR_TUTUP} pasar
              tutup · {counts.DATA} data kurang
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
        >
          <RefreshCw size={14} />
          Pindai ulang{fetchedAt !== null ? ` · ${fetchedAt}` : ""}
        </button>
      </div>

      {error !== null && (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          Gagal memuat candle: {error}
        </p>
      )}
      {loading && <p className="text-sm text-slate-400">Memindai…</p>}
      {!loading && rows.length === 0 && error === null && (
        <p className="text-sm text-slate-400">
          Belum ada CSV candle untuk broker ini. Pastikan service AutoExportMDBKA
          berjalan dan simbol tampil di Market Watch.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Simbol</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Arah</th>
                <th className="py-2 pr-3 text-right">Skor</th>
                <th className="py-2 pr-3 text-right">Biaya</th>
                <th className="py-2">Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((row) => (
                <tr key={row.symbol}>
                  <td className="py-2 pr-3 font-semibold text-white">{row.symbol}</td>
                  <td className="py-2 pr-3">
                    {/* Status = tombol. Hanya LOLOS yang aktif; selain itu disabled. */}
                    <button
                      type="button"
                      data-testid={`scan-open-${row.symbol}`}
                      disabled={row.status !== "LOLOS" || onOpenAnalysis === undefined}
                      onClick={() => onOpenAnalysis?.(row.symbol)}
                      title={
                        row.status === "LOLOS"
                          ? `Buka Hasil analisa ${row.symbol}`
                          : row.reason
                      }
                      className={`rounded-full border px-2 py-0.5 text-xs ${(row.status === "LOLOS" ? lolosView : STATUS_VIEW[row.status]).className} ${
                        row.status === "LOLOS"
                          ? "cursor-pointer border-current/40 hover:brightness-125 hover:ring-1 hover:ring-current"
                          : "cursor-not-allowed border-transparent opacity-60"
                      }`}
                    >
                      {(row.status === "LOLOS" ? lolosView : STATUS_VIEW[row.status]).label}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    {row.direction ?? "-"}
                    {row.held ? " · ditahan" : ""}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {row.score === null ? "-" : `${row.score}/5`}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {row.costShareOfRisk === null
                      ? "-"
                      : `${formatSharePercent(row.costShareOfRisk)}%`}
                  </td>
                  <td className="py-2 text-slate-400">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > COLLAPSED_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs text-emerald-300 hover:underline"
            >
              {showAll ? "Tampilkan ringkas" : `Tampilkan semua (${rows.length})`}
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-slate-500">
        &quot;Lolos&quot; = biaya &amp; risiko aman. Win rate baru ditampilkan setelah
        minimal 20 trade berstatus Lolos tertutup di History MT5 broker ini (demo +
        live); sebelum itu tertulis &quot;belum terbukti (n/20)&quot;. Memakai default Mode Aman (risiko 1%,
        gerbang biaya 10%) dan equity live broker aktif. Klik status Lolos untuk membuka Hasil
        Analisa simbol itu (data otomatis dari MT5). Bukan nasihat keuangan.
      </p>
    </section>
  );
}
