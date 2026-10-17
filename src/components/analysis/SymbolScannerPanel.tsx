import { useState } from "react";
import { STRESS_SLIPPAGE_FACTOR } from "../../lib/combinedRisk";
import { RefreshCw, ScanSearch } from "lucide-react";
import { NEWS_WINDOW_MINUTES } from "../../lib/newsGuard";
import { lolosLabel, proofStatus } from "../../lib/evaluationView";
import { formatSharePercent } from "../../lib/signalReason";
import { signalPageUrl } from "../../lib/signalPageView";
import type { ScanRow, ScanStatus } from "../../lib/symbolScanner";
import { useSymbolScan } from "../../hooks/useSymbolScan";
import { ScanCopyButtons } from "./ScanCopyButtons";
import { usdIdrRate, type ExchangeRates } from "../../services/fxRateService";
import { PROFIT_RANGE_LABEL, TARGET_PROFIT_MAX_IDR, TARGET_PROFIT_MIN_IDR, profitRangeOf } from "../../lib/profitTarget";
import type { BrokerId } from "../../types/broker";

/**
 * Langkah 3c (Mode Aman, 8 Okt 2026) — pemindai simbol.
 *
 * Semua simbol broker aktif yang punya CSV H1 dianalisa dengan mesin yang
 * sama dengan "Hasil analisa", lalu diurutkan: lolos Mode Aman dulu,
 * kemudian yang paling dekat lolos. Hanya informasi; keputusan entry tetap
 * diverifikasi di Hasil Analisa simbol itu.
 */
interface Props {
  readonly brokerId: BrokerId;
  readonly equity: number;
  readonly fxRates: ExchangeRates | null;
  /** Klik status LOLOS → buka Hasil analisa simbol itu (tanpa upload). */
  readonly onOpenAnalysis?: (symbol: string) => void;
}

const COLLAPSED_ROWS = 12;

export const STATUS_VIEW: Record<ScanStatus, { label: string; className: string }> = {
  LOLOS: { label: "Lolos · belum terbukti", className: "bg-emerald-400/15 text-emerald-300" },
  DITAHAN_BIAYA: { label: "Biaya mahal", className: "bg-sky-400/15 text-sky-300" },
  DITAHAN_RISIKO: { label: "Risiko > batas", className: "bg-amber-400/15 text-amber-300" },
  DITAHAN_KORELASI: { label: "Taruhan ganda", className: "bg-fuchsia-400/15 text-fuchsia-300" },
  DITAHAN_JEDA: { label: "Jeda rugi", className: "bg-rose-400/15 text-rose-300" },
  DITAHAN_BERITA: { label: "Dekat berita", className: "bg-orange-400/15 text-orange-300" },
  DITAHAN_SESI: { label: "Sesi tutup", className: "bg-rose-400/15 text-rose-300" },
  DITAHAN_SPEK: { label: "Spesifikasi berubah", className: "bg-violet-400/15 text-violet-300" },
  DITAHAN_BUKA: { label: "Pembukaan bursa", className: "bg-yellow-400/15 text-yellow-300" },
  DITAHAN_BUKTI: { label: "Terbukti rugi · ditahan", className: "bg-red-400/15 text-red-200" },
  TUNGGU: { label: "Tunggu", className: "bg-white/10 text-slate-300" },
  PASAR_TUTUP: { label: "Pasar tutup / basi", className: "bg-white/5 text-slate-500" },
  DATA: { label: "Data kurang", className: "bg-white/5 text-slate-500" },
};

export function SymbolScannerPanel({ brokerId, equity, fxRates, onOpenAnalysis }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [onlyInRange, setOnlyInRange] = useState(false);
  // Satu hitungan pemindai bersama (src/hooks/useSymbolScan.ts) — juga dipakai halaman Meja Trading.
  const { rows, counts, loading, error, fetchedAt, rescan, calendar, newsEvents, upcoming, risk, tradingMode, labOn, labTickets, lossPause, pauseLocked, cautions, stormOf, recomputePlan, lolosStats } = useSymbolScan(brokerId, equity, fxRates);
  const lolosView = {
    label: lolosLabel(lolosStats),
    className:
      lolosStats !== null && proofStatus(lolosStats) === "TERBUKTI_NEGATIF"
        ? "bg-red-400/15 text-red-200"
        : STATUS_VIEW.LOLOS.className,
  };
  // Profit bersih di TP (Rupiah) per sinyal LOLOS + filter rentang Rp5.000–50.000 (permintaan Fahmi 17 Okt 2026).
  const kursProfit = usdIdrRate(fxRates);
  const profitIdrOf = (row: ScanRow): number | null => {
    const usd = row.status === "LOLOS" ? (row.plan?.profitAtTpUsd ?? null) : null;
    return usd !== null && kursProfit !== null ? Math.round(usd * kursProfit) : null;
  };
  const inRangeCount = rows.filter((r) => profitRangeOf(profitIdrOf(r)) === "DALAM_RENTANG").length;
  const shownRows = onlyInRange ? rows.filter((r) => profitRangeOf(profitIdrOf(r)) === "DALAM_RENTANG") : rows;
  const visible = showAll ? shownRows : shownRows.slice(0, COLLAPSED_ROWS);

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
              {counts.DITAHAN_JEDA} jeda · {counts.DITAHAN_BERITA} dekat berita ·{" "}
              {counts.DITAHAN_SESI} sesi tutup/jelang tutup ·{" "}
              {counts.DITAHAN_SPEK} spesifikasi berubah ·{" "}
              {counts.DITAHAN_BUKA} pembukaan bursa ·{" "}
              {counts.DITAHAN_BUKTI} terbukti rugi ·{" "}
              {counts.TUNGGU} tunggu · {counts.PASAR_TUTUP} pasar
              tutup · {counts.DATA} data kurang
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={rescan}
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
      {calendar !== null && calendar.broker === brokerId && calendar.events === null && (
        <p
          data-testid="scan-calendar-missing"
          className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400"
        >
          Kalender ekonomi belum tersedia — satpam berita tidak aktif. Pastikan
          service MDBKACalendarService berjalan di terminal MT5 broker ini.
        </p>
      )}
      {newsEvents !== null && (
        <details data-testid="scan-news-upcoming" className="mb-3 rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-orange-200">
            Berita Tinggi mendatang ({upcoming.length}) · sinyal ditahan otomatis: Forex 3 jam sebelum, lainnya {NEWS_WINDOW_MINUTES} menit sebelum, s/d {NEWS_WINDOW_MINUTES} menit sesudah rilis
          </summary>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-slate-400">Tidak ada berita Tinggi dalam 7 hari ke depan.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-slate-300">
              {upcoming.map((u) => (
                <li key={`${u.event.serverTime}|${u.event.currency}|${u.event.event}`}>
                  <span className={Math.abs(u.minutesTo) <= NEWS_WINDOW_MINUTES ? "font-bold text-orange-300" : "text-slate-400"}>
                    {u.event.serverTime.slice(0, 16)}
                  </span>{" "}
                  · <b>{u.event.currency}</b> {u.event.event} · <span className="text-slate-400">{u.when}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Jam = jam server MT5 broker ini (bukan WIT).</p>
        </details>
      )}
      {loading && <p className="text-sm text-slate-400">Memindai…</p>}
      {!loading && rows.length === 0 && error === null && (
        <p className="text-sm text-slate-400">
          Belum ada CSV candle untuk broker ini. Pastikan service AutoExportMDBKA
          berjalan dan simbol tampil di Market Watch.
        </p>
      )}

      {/* E2 (Tahap 15): risiko gabungan akun aktif (komisi tidak termasuk). */}
      {risk.positions > 0 && (
        <div data-testid="scan-combined-risk" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
          Risiko gabungan {risk.positions} posisi terbuka: bila semua SL kena rugi ${risk.lossAllSlUsd.toFixed(2)}
          {risk.lossAllSlIdr !== null && ` (≈Rp${risk.lossAllSlIdr.toLocaleString("id-ID")})`}
          {risk.shareOfEquity !== null && ` = ${formatSharePercent(risk.shareOfEquity)}% equity`}
          {risk.lockedSl > 0 && ` · ${risk.lockedSl} posisi SL sudah di titik impas`}
          {risk.lossAllSlUsd > 0 && (
            <span data-testid="scan-combined-stress" className="block text-amber-200/80">
              Skenario stres (slippage SL nyata terburuk ×{String(STRESS_SLIPPAGE_FACTOR).replace(".", ",")}): rugi ${risk.stressLossUsd.toFixed(2)}
              {risk.stressLossIdr !== null && ` (≈Rp${risk.stressLossIdr.toLocaleString("id-ID")})`}
              {risk.stressShareOfEquity !== null && ` = ${formatSharePercent(risk.stressShareOfEquity)}% equity`}
            </span>
          )}
          {risk.withoutSl.length > 0 && <span className="text-rose-300"> · TANPA SL (rugi tak terbatas): {risk.withoutSl.join(", ")}</span>}
          {risk.notCounted.length > 0 && ` · belum terhitung (kurs/preset tidak ada): ${risk.notCounted.join(", ")}`}
        </div>
      )}

      {/* Tahap 13: saklar mode A (Demo hanya untuk akun terbukti demo). */}
      <div data-testid="scan-mode" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Mode:</span>
        {(["LIVE", "DEMO"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={m === "DEMO" && tradingMode.state.jenisAkun !== "demo"}
            onClick={() => tradingMode.setMode(m)}
            className={`rounded-full border px-3 py-1 ${tradingMode.state.mode === m ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-slate-300"} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {m === "LIVE" ? "Live" : "Demo"}
          </button>
        ))}
        <span className="text-slate-500">
          {tradingMode.state.login === null ? "login belum terverifikasi" : `#${tradingMode.state.login} (${tradingMode.state.jenisAkun})`} · {tradingMode.state.alasan}
        </span>
        {tradingMode.error !== null && <span className="text-rose-300">{tradingMode.error}</span>}
      </div>

      {/* LAB-2: daftar trade uji (demo laboratorium, Opsi A — MDBKA tidak mengirim order). */}
      {labOn && (
        <div data-testid="lab-trades" className="mb-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-100">
          <p className="mb-1 font-semibold">
            Trade uji demo ({labTickets.length}) — sinyal ditahan penjaga lunak, lot minimum, TIDAK setara Live.
            Buka sendiri di MT5 dengan komentar <b>MDBKA-UJI</b>.
          </p>
          {labTickets.length === 0 ? (
            <p className="text-sky-200/80">Belum ada sinyal yang ditahan penjaga lunak.</p>
          ) : (
            <ul className="space-y-0.5">
              {labTickets.map((t) => (
                <li key={`${t.symbol}|${t.direction}`}>
                  <b>{t.symbol}</b> {t.direction} · entry {t.entry} · SL {t.stopLoss} · TP {t.takeProfit} (R:R {String(t.rr).replace(".", ",")}) · lot{" "}
                  {t.lot === null ? "minimum broker" : String(t.lot).replace(".", ",")} · melewati: {t.penjagaDilewati} · komentar {t.komentar}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Langkah F: jeda / hitungan rugi beruntun broker ini. */}
      {lossPause.paused && !pauseLocked ? (
        <p data-testid="scan-loss-pause-demo" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          {lossPause.reason}. Mode Demo: TIDAK mengunci — trade sesudahnya dicatat tidak setara Live.
        </p>
      ) : lossPause.paused ? (
        <p
          data-testid="scan-loss-pause"
          className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {lossPause.reason}. Semua sinyal Lolos broker ini ditahan.
        </p>
      ) : lossPause.streak > 0 ? (
        <p className="mb-3 text-xs text-slate-400">
          Rugi beruntun: {lossPause.streak}/3 (jeda 24 jam bila mencapai 3).
        </p>
      ) : null}

      {rows.length > 0 && (
        <label data-testid="scan-profit-filter" className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={onlyInRange} onChange={(e) => setOnlyInRange(e.target.checked)} />
          Hanya sinyal dengan profit di TP Rp{TARGET_PROFIT_MIN_IDR.toLocaleString("id-ID")}–{TARGET_PROFIT_MAX_IDR.toLocaleString("id-ID")}
          <span className="text-xs text-slate-500">
            ({kursProfit === null ? "kurs belum ada" : `${inRangeCount} simbol`}; profit bersih setelah spread, slippage & komisi)
          </span>
        </label>
      )}
      {rows.length > 0 && onlyInRange && shownRows.length === 0 && (
        <p data-testid="scan-profit-empty" className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          Belum ada sinyal Lolos dengan profit di TP dalam rentang ini. Matikan filter untuk melihat semua simbol.
        </p>
      )}

      {rows.length > 0 && shownRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Simbol</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Arah</th>
                <th className="py-2 pr-3 text-right">Skor</th>
                <th className="py-2 pr-3 text-right">Biaya</th>
                <th className="py-2 pr-3 text-right">Profit di TP</th>
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
                      onClick={() => {
                        // Butir 3 P3: detail + Salin SL/TP di tab baru; dashboard ikut memilih simbol.
                        window.open(signalPageUrl(brokerId, row.symbol, equity), "_blank", "noopener");
                        onOpenAnalysis?.(row.symbol);
                      }}
                      title={
                        row.status === "LOLOS"
                          ? `Buka detail ${row.symbol} (Salin SL/TP) di tab baru`
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
                    {row.status === "LOLOS" && row.plan !== null && row.plan !== undefined && (
                      <ScanCopyButtons
                        brokerId={brokerId}
                        symbol={row.symbol}
                        recompute={(q) => recomputePlan(row.symbol, q)}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {row.score === null ? "-" : `${row.score}/5`}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {row.costShareOfRisk === null
                      ? "-"
                      : `${formatSharePercent(row.costShareOfRisk)}%`}
                  </td>
                  <td data-testid={`scan-profit-${row.symbol}`} className="py-2 pr-3 text-right">
                    {(() => {
                      const idr = profitIdrOf(row);
                      if (idr === null) return <span className="text-slate-500">-</span>;
                      const range = profitRangeOf(idr);
                      return (
                        <span
                          title={`Profit bersih perkiraan bila TP kena: ${PROFIT_RANGE_LABEL[range]}`}
                          className={range === "DALAM_RENTANG" ? "font-semibold text-emerald-300" : "text-slate-400"}
                        >
                          Rp{idr.toLocaleString("id-ID")}
                          {range === "DALAM_RENTANG" ? " ✓" : ""}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 text-slate-400">
                    {row.reason}
                    {cautions.get(row.symbol) !== undefined && (
                      <span data-testid={`scan-caution-${row.symbol}`} className="mt-1 block text-xs text-amber-300">
                        ⚠ {cautions.get(row.symbol)?.text}
                      </span>
                    )}
                    {stormOf(row.symbol) !== null && (
                      <span data-testid={`scan-storm-${row.symbol}`} className="mt-1 block text-xs text-orange-300">
                        🌩 {stormOf(row.symbol)?.text}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shownRows.length > COLLAPSED_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs text-emerald-300 hover:underline"
            >
              {showAll ? "Tampilkan ringkas" : `Tampilkan semua (${shownRows.length})`}
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
