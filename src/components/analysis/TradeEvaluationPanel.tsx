import { useEffect, useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  excursionCell,
  formatDuration,
  formatRupiah,
  formatUsd,
  formatWinRate,
  groupLabel,
  isLegacyGroup,
  proofLabel,
  proofStatus,
  sortGroups,
  type EvalAccount,
  type EvalTradeStats,
} from "../../lib/evaluationView";
import { usdIdrRate, type ExchangeRates } from "../../services/fxRateService";

/**
 * Langkah 4c-2 (Mode Aman, 8 Okt 2026) — panel "Evaluasi trade".
 *
 * Hasil nyata dari History MT5 per akun (label dari ACCOUNT_LABELS), dalam
 * USD + Rupiah. Trade lama (sebelum Mode Aman) dipisah dari trade yang
 * tercatat status pemindainya, supaya hasil Mode Aman bisa dinilai sendiri.
 */
interface Props {
  readonly fxRates: ExchangeRates | null;
}

const REFRESH_MS = 5 * 60_000;
const RECENT_TRADES = 10;

const PROOF_CLASS: Record<ReturnType<typeof proofStatus>, string> = {
  TERBUKTI_POSITIF: "bg-emerald-400/15 text-emerald-200",
  TERBUKTI_NEGATIF: "bg-red-400/15 text-red-200",
  BELUM_CUKUP: "bg-white/5 text-slate-400",
};

const EXCURSION_TONE = {
  untung: "text-emerald-300",
  rugi: "text-rose-300",
  netral: "text-slate-500",
} as const;

const netClass = (v: number | null): string =>
  v === null || v === 0 ? "text-slate-300" : v > 0 ? "text-emerald-300" : "text-red-300";

function Money({ usd, kurs }: { usd: number | null; kurs: number | null }) {
  const rp = formatRupiah(usd, kurs);
  return (
    <span className={netClass(usd)}>
      {formatUsd(usd)}
      {rp !== null && <span className="ml-1 text-xs opacity-70">({rp})</span>}
    </span>
  );
}

function StatsRow({
  name,
  stats,
  kurs,
  muted,
}: {
  name: string;
  stats: EvalTradeStats;
  kurs: number | null;
  muted: boolean;
}) {
  return (
    <tr className={muted ? "opacity-70" : ""}>
      <td className="py-2 pr-3 text-slate-200">{name}</td>
      <td className="py-2 pr-3 text-right text-slate-300">{stats.n}</td>
      <td className="py-2 pr-3 text-right text-slate-300">{formatWinRate(stats.winRate)}</td>
      <td className="py-2 pr-3 text-right">
        <Money usd={stats.net} kurs={kurs} />
      </td>
      <td className="py-2 pr-3 text-right">
        <Money usd={stats.expectancy} kurs={kurs} />
      </td>
      <td className="py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${PROOF_CLASS[proofStatus(stats)]}`}>
          {proofLabel(stats)}
        </span>
      </td>
    </tr>
  );
}

function AccountCard({ account, kurs }: { account: EvalAccount; kurs: number | null }) {
  const [showTrades, setShowTrades] = useState(false);
  const { overall, byGroup, trades, openPositions } = account.evaluation;
  const groups = sortGroups(Object.keys(byGroup));
  const hasModeAman = groups.some((g) => !isLegacyGroup(g));
  const recent = trades.slice(0, RECENT_TRADES);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-white">
          {account.label}{" "}
          <span className="text-xs font-normal text-slate-500">#{account.login}</span>
        </h3>
        <span className="text-xs text-slate-500">
          {openPositions > 0 ? `${openPositions} posisi masih terbuka · ` : ""}
          {account.company}
        </span>
      </div>

      {overall.n === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Belum ada trade tertutup di History.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Trade tertutup</dt>
              <dd className="text-slate-200">
                {overall.n} ({overall.wins} untung · {overall.losses} rugi)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Win rate</dt>
              <dd className="text-slate-200">{formatWinRate(overall.winRate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Hasil bersih</dt>
              <dd>
                <Money usd={overall.net} kurs={kurs} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Rata-rata untung / rugi</dt>
              <dd>
                <span className={netClass(overall.avgWin)}>{formatUsd(overall.avgWin)}</span>
                {" / "}
                <span className={netClass(overall.avgLoss)}>{formatUsd(overall.avgLoss)}</span>
              </dd>
            </div>
          </dl>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Kelompok</th>
                  <th className="py-2 pr-3 text-right">n</th>
                  <th className="py-2 pr-3 text-right">Win rate</th>
                  <th className="py-2 pr-3 text-right">Bersih</th>
                  <th className="py-2 pr-3 text-right">Per trade</th>
                  <th className="py-2">Bukti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {groups.map((g) => (
                  <StatsRow
                    key={g}
                    name={groupLabel(g)}
                    stats={byGroup[g]}
                    kurs={kurs}
                    muted={isLegacyGroup(g)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!hasModeAman && (
            <p className="mt-2 text-xs text-slate-500">
              Belum ada trade Mode Aman yang tercatat. Trade baru yang dibuka saat
              MDBKA berjalan akan masuk kelompok sesuai status pemindai saat entry.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowTrades((v) => !v)}
            className="mt-3 text-xs text-emerald-300 hover:underline"
          >
            {showTrades ? "Sembunyikan trade terakhir" : `Lihat ${recent.length} trade terakhir`}
          </button>
          {showTrades && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3">Tutup</th>
                    <th className="py-1.5 pr-3">Simbol</th>
                    <th className="py-1.5 pr-3">Arah</th>
                    <th className="py-1.5 pr-3 text-right">Lot</th>
                    <th className="py-1.5 pr-3">Keluar</th>
                    <th className="py-1.5 pr-3 text-right">Lama</th>
                    <th className="py-1.5 pr-3 text-right">R</th>
                    <th className="py-1.5 pr-3 text-right" title="Untung terbaik yang sempat tersedia selama posisi terbuka (MFE)">
                      Untung terbaik
                    </th>
                    <th className="py-1.5 pr-3 text-right" title="Rugi terdalam yang sempat dialami selama posisi terbuka (MAE)">
                      Rugi terdalam
                    </th>
                    <th className="py-1.5 text-right">Bersih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recent.map((t) => (
                    <tr key={t.positionId}>
                      <td className="py-1.5 pr-3 text-slate-400">{t.closeTime.slice(0, 16)}</td>
                      <td className="py-1.5 pr-3 text-slate-200">{t.symbol}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{t.side}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">{t.volume}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{t.exit}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">
                        {formatDuration(t.durationMin)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">
                        {t.rMultiple === null ? "-" : t.rMultiple.toFixed(2)}
                      </td>
                      {(["mfe", "mae"] as const).map((which) => {
                        const cell = excursionCell(account.excursions?.[t.positionId], t.symbol, which);
                        return (
                          <td key={which} className={`py-1.5 pr-3 text-right ${EXCURSION_TONE[cell.tone]}`} title={cell.title}>
                            {cell.text}
                          </td>
                        );
                      })}
                      <td className="py-1.5 text-right">
                        <Money usd={t.net} kurs={kurs} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-500">
                Untung terbaik / Rugi terdalam = gerak harga terbaik &amp; terburuk selama posisi terbuka.
                R = kelipatan risiko SL. ≈ rekaman sebagian · – tanpa rekaman (sebelum 5 Okt) · … sedang dihitung.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function TradeEvaluationPanel({ fxRates }: Props) {
  const [accounts, setAccounts] = useState<EvalAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/evaluation`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { accounts?: EvalAccount[] };
        if (cancelled) return;
        setAccounts(body.accounts ?? []);
        setError(null);
        setFetchedAt(
          new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tick]);

  const kurs = usdIdrRate(fxRates);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10 lg:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-400/10 p-2 text-sky-400">
            <ClipboardCheck size={20} />
          </div>
          <div>
            <h2 className="font-bold text-white">Evaluasi trade — hasil nyata</h2>
            <p className="mt-1 text-sm text-slate-400">
              Dari History MT5 tiap akun. Trade lama dipisah dari trade Mode Aman.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
        >
          <RefreshCw size={14} />
          Muat ulang{fetchedAt !== null ? ` · ${fetchedAt}` : ""}
        </button>
      </div>

      {error !== null && (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          Gagal memuat evaluasi: {error}
        </p>
      )}
      {accounts === null && error === null && (
        <p className="text-sm text-slate-400">Memuat…</p>
      )}
      {accounts !== null && accounts.length === 0 && (
        <p className="text-sm text-slate-400">
          Belum ada file History. Pastikan service MDBKAHistoryService berjalan di
          terminal MT5.
        </p>
      )}

      <div className="space-y-4">
        {(accounts ?? []).map((a) => (
          <AccountCard key={a.login} account={a} kurs={kurs} />
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Hasil bersih sudah termasuk komisi &amp; swap. &quot;Per trade&quot; =
        rata-rata hasil tiap trade (ekspektansi). Disebut terbukti hanya setelah
        minimal 20 trade; sebelum itu angka bisa kebetulan.
        {kurs === null ? " Kurs Rupiah belum tersedia." : ""} Bukan nasihat keuangan.
      </p>
    </section>
  );
}
