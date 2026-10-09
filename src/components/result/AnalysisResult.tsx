import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  AnalysisResult as ResultType,
  MarketData,
} from "../../types/analysis";
import type { BrokerId } from "../../types/broker";
import type { ValidationViewState } from "../../lib/validationView";
import { attachSwapToResult } from "../../calculations/attachSwapToResult";
import { MAX_COST_SHARE_OF_RISK } from "../../calculations/decisionEngine";
import { formatSharePercent } from "../../lib/signalReason";
import { getTripleSwapLabel } from "../../services/dateService";
import { isOtbSymbolVerified } from "../../lib/brokerSymbols";
import { checkStopsDistance } from "../../lib/orderTicket";
import { useHoldingsQuotes } from "../../hooks/useHoldingsQuotes";
import { useEquityStream } from "../../hooks/useEquityStream";
import { useSymbolMargin } from "../../hooks/useSymbolMargin";
import { checkMarginCap } from "../../lib/marginGuard";
import { formatPrice } from "../../lib/tickSize";
import type { ExchangeRates } from "../../services/fxRateService";

interface Props {
  result: ResultType | null;
  market: MarketData;
  viewState: ValidationViewState;
  blockedReasons?: string[] | null;
  /** Konteks broker (display only): mengaktifkan blok swap OTB. */
  brokerId?: BrokerId;
  /** Tahap 5D-STEP2: ECB rate cache dari App (display USD info-only). */
  fxRates?: ExchangeRates | null;
  /** Item (e): aturan volume broker untuk guard margin. */
  minLot?: number;
  lotStep?: number;
}

function money(value: number | null) {
  return value === null ? "-" : `$${value.toFixed(2)}`;
}

function number(value: number | null, digits = 2) {
  return value === null ? "-" : value.toFixed(digits);
}

const REQUIRED_SUMMARY = [
  "Bid dan Ask",
  "OHLC",
  "MA50",
  "ATR",
  "Support dan Resistance",
];

export default function AnalysisResult({
  result,
  market,
  viewState,
  blockedReasons,
  brokerId,
  fxRates,
  minLot,
  lotStep,
}: Props) {
  // Tahap 5C Step 2: holding + memo swap (info-only, post-decision).
  // Tahap 5D-STEP2: teruskan currentPrice (untuk % calc) + fxRates
  // (untuk display USD). Hooks di atas semua early return.
  // Tanpa hasil/lot → null.
  const [holdingDays, setHoldingDays] = useState(0);
  // Tahap NS: status salin order (hook di atas semua early return).
  // Kunci tombol yang baru disalin: "sl" | "tp" | null.
  const [copied, setCopied] = useState<string | null>(null);
  // Tahap STP: harga live untuk guard jarak SL/TP (hook pula).
  const { quotes } = useHoldingsQuotes(
    market.symbol !== "" ? [market.symbol] : [],
    brokerId,
  );
  // Item (e): guard margin — free margin live + margin/lot MT5 (hook).
  const { equity: liveEquity } = useEquityStream(5000, brokerId);
  const symbolMargin = useSymbolMargin(brokerId, market.symbol);

  const currentPrice = market.bid > 0 ? market.bid : market.close;

  // Tahap 5E-STEP1: tanggal mulai holding = hari ini (auto-detect Rabu x3).
  // Di-memo agar stabil selama session render (tidak re-create tiap render).
  const holdingStartDate = useMemo(() => new Date(), []);

  const attached = useMemo(
    () =>
      result === null
        ? null
        : attachSwapToResult(result, {
            symbol: market.symbol,
            brokerId,
            direction: result.decision,
            lot: result.suggestedLot ?? result.theoreticalLot,
            holdingDays,
            currentPrice,
            fxRates: fxRates ?? null,
            startDate: holdingStartDate,
          }),
    [
      result,
      market.symbol,
      brokerId,
      holdingDays,
      currentPrice,
      fxRates,
      holdingStartDate,
    ],
  );

  const showSwapBlock = brokerId === "orbitraderberjangka" && result !== null;

  // Tahap 6A safety gate (lapisan presentasi): angka swap preset yang
  // belum terverifikasi dari Specification TIDAK ditampilkan — diganti
  // notice PENDING. calculateSwapCost/attachSwapToResult murni tidak
  // berubah (kontrak function-level terkunci test 251-278).
  const swapVerified = isOtbSymbolVerified(market.symbol);

  // Umpan balik klik Analisa yang eksplisit: selalu diutamakan bila ada.
  if (blockedReasons && blockedReasons.length > 0) {
    return (
      <div className="space-y-4 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
            Analisa ditahan
          </p>
          <h2 className="mt-1 text-2xl font-black text-amber-100">
            Analisa belum dapat dilakukan
          </h2>
          <p className="mt-2 text-sm text-amber-100/80">
            Lengkapi hal berikut, hasil akan berjalan otomatis.
          </p>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
          {blockedReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    );
  }

  // Prioritas tampilan: data kosong bukan mismatch skala.
  if (viewState.kind === "empty") {
    return (
      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            Menunggu data
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Data belum lengkap
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {viewState.symbol
              ? `Masukkan atau impor data ${viewState.symbol} dari chart MT5. Field harga dan indikator masih kosong.`
              : "Pilih simbol sebelum melakukan analisa."}
          </p>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
          {REQUIRED_SUMMARY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (viewState.kind === "incomplete") {
    return (
      <div className="space-y-4 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
            Data perlu dilengkapi
          </p>
          <h2 className="mt-1 text-2xl font-black text-amber-100">
            Data belum lengkap
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            {`Lengkapi data ${viewState.symbol} sebelum melakukan analisa.`}
          </p>
        </div>

        <details className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">
            Lihat field yang belum lengkap
          </summary>

          <div className="mt-3 space-y-2">
            {viewState.issues.map((issue) => (
              <div
                key={`${issue.field}-${issue.message}`}
                className="rounded-xl border border-amber-300/20 bg-slate-950/40 p-3 text-sm text-amber-100"
              >
                <strong>{issue.field}:</strong> {issue.message}
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }

  if (viewState.kind === "mismatch") {
    const scaleIssues = viewState.issues;

    return (
      <div className="space-y-4 rounded-3xl border border-red-400/30 bg-red-400/10 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
            Data perlu diperiksa
          </p>
          <h2 className="mt-1 text-2xl font-black text-red-100">
            Mismatch skala harga terdeteksi
          </h2>
          <p className="mt-2 text-sm text-red-100/80">
            Simbol {market.symbol} memiliki skala harga yang tidak cocok dengan
            satu atau lebih nilai pada form.
          </p>
        </div>

        <div className="space-y-2">
          {scaleIssues.map((issue) => (
            <div
              key={`${issue.field}-${issue.message}`}
              className="rounded-xl border border-red-300/20 bg-slate-950/40 p-3 text-sm text-red-100"
            >
              <strong>{issue.field}:</strong> {issue.message}
            </div>
          ))}
        </div>

        <p className="text-sm text-amber-100">
          Perbaiki data pasar terlebih dahulu. Hasil BELI/JUAL/TUNGGU belum
          boleh dianggap valid.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Clock3 className="mx-auto mb-3 text-slate-500" size={34} />
        <h3 className="font-semibold text-white">Belum ada hasil analisa</h3>
        <p className="mt-2 text-sm text-slate-400">
          Lengkapi data, hasil analisa tampil otomatis.
        </p>
      </div>
    );
  }

  const decisionStyle =
    result.decision === "BELI"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : result.decision === "JUAL"
        ? "border-red-400/40 bg-red-400/10 text-red-300"
        : "border-amber-400/40 bg-amber-400/10 text-amber-300";

  const Icon =
    result.decision === "BELI"
      ? TrendingUp
      : result.decision === "JUAL"
        ? TrendingDown
        : Clock3;

  // Tahap NS: teks order siap-tempel ke MT5 (tanpa eksekusi; user paste
  // manual di terminal). Lot = suggestedLot, SL/TP dari hasil analisa.
  // Tahap STP: guard jarak SL/TP vs harga LIVE (kasus tombol MT5
  // terkunci karena market bergerak setelah analisa). Tanpa harga live
  // → null (diam, bukan lampu hijau).
  const liveQuote = quotes[market.symbol];
  const stopsWarning =
    result !== null &&
    result.decision !== "TUNGGU" &&
    result.stopLoss !== null &&
    result.takeProfit !== null &&
    liveQuote !== undefined
      ? checkStopsDistance({
          symbol: market.symbol,
          brokerId: brokerId ?? "finex",
          direction: result.decision,
          sl: result.stopLoss,
          tp: result.takeProfit,
          bid: liveQuote.bid,
          ask: liveQuote.ask,
        })
      : null;

  // Item (e): lot order dibatasi margin (OrderCalcMargin MT5 vs free
  // margin live). Blocked → orderText null + blok merah JANGAN entry.
  const marginCap =
    result !== null &&
    result.decision !== "TUNGGU" &&
    result.suggestedLot !== null
      ? checkMarginCap({
          suggestedLot: result.suggestedLot,
          minLot: minLot ?? 0.01,
          lotStep: lotStep ?? 0.01,
          marginPerLot:
            result.decision === "JUAL"
              ? symbolMargin.marginSell
              : symbolMargin.marginBuy,
          freeMargin: liveEquity?.freeMargin ?? null,
        })
      : null;
  const orderLot =
    marginCap === null ? (result?.suggestedLot ?? null) : marginCap.cappedLot;

  const orderText =
    result !== null &&
    result.decision !== "TUNGGU" &&
    orderLot !== null &&
    result.stopLoss !== null &&
    result.takeProfit !== null
      ? `${market.symbol} ${result.decision} ${orderLot} @ ${formatPrice(result.entry, market.symbol)}\nSL ${formatPrice(result.stopLoss, market.symbol)} TP ${formatPrice(result.takeProfit, market.symbol)}`
      : null;

  const slText =
    orderText !== null && result !== null
      ? formatPrice(result.stopLoss, market.symbol)
      : null;
  const tpText =
    orderText !== null && result !== null
      ? formatPrice(result.takeProfit, market.symbol)
      : null;

  // Salin teks ke clipboard; key = tombol yang menampilkan "Disalin ✓".
  const copyText = (text: string | null, key: string): void => {
    if (text === null) return;
    const done = (): void => {
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    };
    try {
      const clipboard = (
        window.navigator as unknown as {
          clipboard?: { writeText(text: string): Promise<void> };
        }
      ).clipboard;
      if (clipboard !== undefined) {
        clipboard.writeText(text).then(done, () => setCopied(null));
        return;
      }
    } catch {
      // Fallback di bawah.
    }
    const area = window.document.createElement("textarea");
    area.value = text;
    window.document.body.appendChild(area);
    area.select();
    try {
      window.document.execCommand("copy");
      done();
    } catch {
      setCopied(null);
    }
    window.document.body.removeChild(area);
  };

  return (
    <div className="space-y-5">
      <div className={["rounded-3xl border p-6", decisionStyle].join(" ")}>
        <div className="flex items-center gap-4">
          <Icon size={42} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em]">
              Hasil analisa
            </p>
            <h2 className="mt-1 text-4xl font-black">{result.decision}</h2>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs uppercase tracking-wide opacity-70">Skor</p>
            <p className="text-3xl font-black">{result.score}/5</p>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6">{result.explanation}</p>
      </div>

      {result.decision !== "TUNGGU" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Entry
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {formatPrice(result.entry, market.symbol)}
            </p>
          </div>

          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-red-300">
              Stop Loss
            </p>
            <p className="mt-1 text-2xl font-bold text-red-200">
              {formatPrice(result.stopLoss, market.symbol)}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-emerald-300">
              Take Profit
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">
              {formatPrice(result.takeProfit, market.symbol)}
            </p>
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-sky-300">RR</p>
            <p className="mt-1 text-2xl font-bold text-sky-200">
              {number(
                result.targetDistance !== null && result.riskDistance !== null
                  ? result.targetDistance / result.riskDistance
                  : null,
                2,
              )}
              :1
            </p>
          </div>
        </div>
      )}

      {marginCap !== null && marginCap.blocked && (
        <div
          data-testid="margin-blocked"
          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm font-semibold text-rose-100"
        >
          ⛔ {marginCap.warning}
        </div>
      )}

      {orderText !== null && (
        <div
          data-testid="order-copy-block"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Salin order ke MT5 (tempel manual di terminal)
          </p>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-950/70 p-3 font-mono text-sm text-emerald-200">
            {orderText}
          </pre>
          {stopsWarning !== null && (
            <p className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              ⚠ {stopsWarning}
            </p>
          )}
          {marginCap !== null &&
            !marginCap.blocked &&
            marginCap.warning !== null && (
              <p
                data-testid="margin-warning"
                className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100"
              >
                ⚠ {marginCap.warning}
              </p>
            )}
          {liveQuote === undefined && (
            <p className="mt-2 text-xs text-slate-500">
              Tanpa harga live: pastikan SL/TP berjarak aman dari harga berjalan
              sebelum order (analisa ulang bila market bergerak).
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Angka saja, untuk ditempel ke kolom Stop Loss / Take Profit MT5. */}
            <button
              type="button"
              data-testid="copy-sl"
              onClick={() => copyText(slText, "sl")}
              className="rounded-xl bg-rose-400/15 px-4 py-2 text-sm font-bold text-rose-200 hover:bg-rose-400/25"
            >
              {copied === "sl" ? "SL disalin ✓" : `Salin SL ${slText ?? ""}`}
            </button>
            <button
              type="button"
              data-testid="copy-tp"
              onClick={() => copyText(tpText, "tp")}
              className="rounded-xl bg-sky-400/15 px-4 py-2 text-sm font-bold text-sky-200 hover:bg-sky-400/25"
            >
              {copied === "tp" ? "TP disalin ✓" : `Salin TP ${tpText ?? ""}`}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Risiko maksimum" value={money(result.maxRiskUsd)} />
        <Metric label="Risiko lot minimum" value={money(result.riskAtMinLot)} />
        <Metric label="Lot teoritis" value={number(result.theoreticalLot, 4)} />
        <Metric
          label="Lot disarankan"
          value={
            marginCap !== null && marginCap.blocked
              ? "DIBLOKIR"
              : marginCap !== null &&
                  marginCap.cappedLot !== result.suggestedLot
                ? `${number(orderLot, 4)} (risiko: ${number(result.suggestedLot, 4)} · dibatasi margin)`
                : number(orderLot, 4)
          }
        />
      </div>

      {/* Live panels (LiveEquity + LiveQuotes) direlokasi ke sidebar
          sticky App (top-right) agar tetap terlihat saat scroll form.
          AnalysisResult murni hasil analisa (display-only). */}

      {showSwapBlock && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Holding (hari)
            </span>

            <input
              data-testid="swap-holding-input"
              type="number"
              min={0}
              max={10}
              step={1}
              value={holdingDays}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setHoldingDays(
                  Number.isFinite(parsed)
                    ? Math.min(10, Math.max(0, Math.floor(parsed)))
                    : 0,
                );
              }}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
            />

            <span className="block text-xs text-slate-500">
              0 = intraday (tanpa swap). Maksimal 10 hari.
            </span>

            <span className="block text-xs text-gray-400">
              {getTripleSwapLabel(holdingDays, holdingStartDate)}
            </span>
          </label>

          {attached !== null &&
            attached.swapDetail !== null &&
            holdingDays > 0 &&
            (swapVerified ? (
              <p
                data-testid="swap-memo"
                className="mt-3 text-sm text-slate-400"
              >
                Swap {attached.swapDetail.holdingDays} hari:{" "}
                {attached.swapDetail.swapCost.toFixed(2)}{" "}
                {attached.swapDetail.profitCurrency}/lot (profit{" "}
                {attached.swapDetail.profitCurrency})
                {attached.swapDetail.swapCostInUSD !== null && (
                  <>
                    {" "}
                    ≈ {attached.swapDetail.swapCostInUSD.toFixed(2)} USD (dari{" "}
                    {attached.swapDetail.swapCostInContractBaseCurrency.toFixed(
                      2,
                    )}{" "}
                    {attached.swapDetail.contractBaseCurrency} @{" "}
                    {attached.swapDetail.fxRate !== null &&
                    attached.swapDetail.fxRate !== undefined
                      ? attached.swapDetail.fxRate.toFixed(4)
                      : "-"}
                    )
                  </>
                )}
              </p>
            ) : (
              <p
                data-testid="swap-pending"
                className="mt-3 text-sm text-amber-200"
              >
                Swap {market.symbol} belum terverifikasi dari Specification —
                angka swap disembunyikan hingga terverifikasi (tanpa angka
                fiktif).
              </p>
            ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start gap-3">
          {result.riskStatus === "MEMENUHI batas risiko" ? (
            <CheckCircle2
              className="mt-0.5 shrink-0 text-emerald-400"
              size={20}
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 shrink-0 text-amber-400"
              size={20}
            />
          )}

          <div>
            <p className="font-semibold text-white">{result.riskStatus}</p>

            <div className="mt-3 space-y-2">
              {result.factors.map((factor) => (
                <p key={factor} className="text-sm text-slate-300">
                  - {factor}
                </p>
              ))}

              {result.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-200">
                  PERINGATAN: {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <BeginnerGuide result={result} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

/**
 * Panduan bahasa awam di bawah hasil analisa (display only).
 * Menjelaskan tanpa istilah trading: batas rugi = stop loss otomatis,
 * target untung = take profit otomatis, lot = ukuran transaksi.
 */
function BeginnerGuide({ result }: { result: ResultType }) {
  // Langkah F: jeda setelah 3 kali rugi berturut-turut.
  if (result.decision === "TUNGGU" && result.heldBy === "jeda") {
    return (
      <div className="rounded-2xl border border-rose-400/25 bg-rose-400/5 p-5">
        <p className="font-semibold text-rose-200">
          Artinya gampang: sedang istirahat setelah 3 kali rugi berturut-turut.
          JANGAN entry dulu.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>{result.heldReason ?? "Jeda: 3 kali rugi berturut-turut"}.</li>
          <li>
            Rugi beruntun sering membuat ingin cepat &quot;balas dendam&quot;. Jeda
            mencegah kerugian bertambah karena keputusan terburu-buru.
          </li>
          <li>
            Gunakan waktu ini untuk membaca ulang trade yang rugi di panel
            Evaluasi trade.
          </li>
        </ul>
      </div>
    );
  }

  // Satpam Kalender K5: dekat berita ekonomi Tinggi (±30 menit).
  if (result.decision === "TUNGGU" && result.heldBy === "berita") {
    return (
      <div data-testid="held-berita" className="rounded-2xl border border-orange-400/25 bg-orange-400/5 p-5">
        <p className="font-semibold text-orange-200">
          Artinya gampang: sebentar lagi (atau baru saja) ada berita ekonomi
          penting. JANGAN entry dulu.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>{result.heldReason ?? "Ditahan: dekat berita Tinggi"}.</li>
          <li>
            Saat berita rilis, harga bisa melonjak dan spread melebar sehingga
            SL tersapu walau arah analisa benar.
          </li>
          <li>Tunggu sampai 30 menit setelah jam rilis, lalu analisa ulang.</li>
        </ul>
      </div>
    );
  }

  // Langkah 1c: arah kompak, tapi searah posisi terbuka (taruhan ganda).
  if (result.decision === "TUNGGU" && result.heldBy === "korelasi") {
    return (
      <div className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-400/5 p-5">
        <p className="font-semibold text-fuchsia-200">
          Artinya gampang: ini taruhan yang sama dengan posisi Anda yang masih
          terbuka. JANGAN entry.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>{result.heldReason ?? "Ditahan: taruhan ganda"}.</li>
          <li>
            Bila arahnya salah, dua posisi rugi bersamaan. Tutup atau selesaikan
            posisi lama dulu sebelum menambah yang searah.
          </li>
          <li>
            Profit kecil yang aman lebih baik daripada risiko dobel.
          </li>
        </ul>
      </div>
    );
  }

  // Mode Aman: arah sudah kompak, tapi biaya memakan terlalu banyak risiko.
  if (result.decision === "TUNGGU" && result.heldBy === "biaya") {
    const share =
      typeof result.costShareOfRisk === "number"
        ? formatSharePercent(result.costShareOfRisk)
        : null;
    return (
      <div className="rounded-2xl border border-sky-400/25 bg-sky-400/5 p-5">
        <p className="font-semibold text-sky-200">
          Artinya gampang: arah sudah kompak, tapi biayanya terlalu mahal.
          JANGAN entry.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>
            Komisi + spread memakan {share === null ? "-" : share}% dari batas
            rugi (maksimal {Math.round(MAX_COST_SHARE_OF_RISK * 100)}%). Untung
            kecil akan habis dipotong biaya.
          </li>
          <li>
            Cari simbol atau broker dengan biaya lebih rendah (spread rapat,
            komisi kecil).
          </li>
          <li>
            Tidak entry = tidak rugi. Menjaga modal adalah keputusan yang benar.
          </li>
        </ul>
      </div>
    );
  }

  // TUNGGU karena skor (bukan ditahan Mode Aman) = tidak ada perintah transaksi.
  if (result.decision === "TUNGGU" && result.heldBy !== "risiko") {
    return (
      <div className="rounded-2xl border border-sky-400/25 bg-sky-400/5 p-5">
        <p className="font-semibold text-sky-200">
          Artinya gampang: JANGAN buka transaksi apa pun.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>
            Tunggu sampai penunjuk arah kompak: skor minimal 3 untuk BELI atau
            -3 untuk JUAL (sekarang {result.score}/5).
          </li>
          <li>
            Untuk akun kecil, tunggu setup yang jarak entry ke batas ruginya
            RAPAT (kecil) — makin rapat jaraknya, makin kecil modal yang
            dibutuhkan untuk ikut.
          </li>
          <li>
            Tidak entry = tidak rugi. Menunggu adalah keputusan yang benar hari
            ini.
          </li>
        </ul>
      </div>
    );
  }

  // Sinyal ada tapi akun tak muat / lot tak memenuhi syarat broker
  // (Mode Aman menahannya jadi TUNGGU dengan heldBy = "risiko").
  if (
    result.heldBy === "risiko" ||
    result.riskStatus !== "MEMENUHI batas risiko"
  ) {
    const over =
      result.riskAtMinLot !== null && result.maxRiskUsd > 0
        ? result.riskAtMinLot / result.maxRiskUsd
        : null;
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5">
        <p className="font-semibold text-amber-200">
          Artinya gampang: sinyalnya ada, tapi dompet belum muat. JANGAN dipaksa
          entry.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>
            Ukuran transaksi terkecil yang diizinkan broker risikonya $
            {result.riskAtMinLot === null
              ? "-"
              : result.riskAtMinLot.toFixed(2)}
            , sedangkan batas aman akun Anda hanya $
            {result.maxRiskUsd.toFixed(2)}
            {over !== null && over > 1
              ? ` (kelebihan ${over.toFixed(1)}× lipat)`
              : ""}
            .
          </li>
          <li>
            Solusi 1 (gratis): tunggu setup ber-SL rapat — jarak entry ke batas
            rugi yang kecil membuat risiko lot minimum ikut kecil.
          </li>
          <li>
            Solusi 2 (bayar): tambah modal hingga batas aman ≥ risiko lot
            minimum.
          </li>
        </ul>
      </div>
    );
  }

  // Sinyal + risiko memenuhi syarat.
  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-5">
      <p className="font-semibold text-emerald-200">
        Artinya gampang: setup ini BOLEH diikuti persis seperti blok &quot;Salin
        order&quot; (simbol, arah, lot, batas rugi, target untung — jangan
        diubah angkanya).
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Setelah entry, pantau kartu posisi di bawah: begitu banner hijau
        BREAKEVEN muncul, geser batas rugi ke harga entry sesuai perintahnya.
      </p>
    </div>
  );
}
