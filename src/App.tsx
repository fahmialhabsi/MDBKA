import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  BarChart3,
  Calculator,
  FileCheck2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import ScreenshotDropzone from "./components/screenshot/ScreenshotDropzone";
import OcrExtractor from "./components/extraction/OcrExtractor";
import ExtractedDataForm from "./components/extraction/ExtractedDataForm";
import BrokerSelector from "./components/analysis/BrokerSelector";
import BrokerSettingsForm from "./components/analysis/BrokerSettingsForm";
import ValidationSummaryCard from "./components/analysis/ValidationSummaryCard";
import SwingLevelsForm from "./components/analysis/SwingLevelsForm";
import AnalysisResult from "./components/result/AnalysisResult";

import { analyzeMarket } from "./calculations/decisionEngine";
import { detectScaleMismatch } from "./calculations/scaleValidator";
import { validateAnalysisInputs } from "./calculations/inputValidator";
import { normalizeSymbol } from "./lib/instrumentConfig";
import { parseCsvCandles } from "./lib/csvCandleParser";
import { traceOcrStage } from "./lib/debugTrace";
import {
  DEFAULT_BROKER_ID, ORBITRADER_BROKER_ID,
  getBrokerProfile,
} from "./lib/brokerRegistry";
import {
  canonicalSymbolForBroker,
  getOtbDetectedNotice,
  hasOtbPresetForSymbol,
} from "./lib/brokerSymbols";

import { getOtbInstrumentProfile } from "./lib/otbInstrumentConfig";
import type { BrokerSettings, MarketData } from "./types/analysis";
import type { BrokerId } from "./types/broker";
import CsvFileConnector from "./components/analysis/CsvFileConnector";
import {
  applyBrokerPreset,
  applyCsvSwingLevels,
  createEmptyMarketForSymbol,
  filterOcrPricesForSymbol,
  mergeValidOcrMarketData,
  RESET_MARKET_FIELDS,
  type CsvSwingLevelMeta,
} from "./lib/marketReset";
import {
  buildBlockedReasons,
  getValidationViewState,
} from "./lib/validationView";
import {
  fetchECBRates, convertToUSD,
  type ExchangeRates,
} from "./services/fxRateService";

const initialMarket: MarketData = {
  symbol: "GBPUSD",
  timeframe: "H1",
  bid: 1.32474,
  ask: 1.3248,
  close: 1.32449,
  open: 1.32499,
  high: 1.32507,
  low: 1.32443,
  ma50: 1.324651,
  cci: -197.12,
  rsi: 50,
  macd: 0.000041,
  macdSignal: 0.000427,
  atr: 0.00094,
  support: 1.32443,
  resistance: 1.32507,
};

const initialBroker: BrokerSettings = {
  equity: 8.99,
  riskPercent: 10,
  minLot: 0.01,
  lotStep: 0.01,
  pointValue: 100000,
  contractSize: 100000,
  commission: 0,
  slippage: 0,
  buffer: 0.00005,
  atrMultiplier: 1.2,
  targetRR: 1.5,
};

const emptyMarket: MarketData = {
  symbol: "",
  timeframe: "",
  bid: 0,
  ask: 0,
  close: 0,
  open: 0,
  high: 0,
  low: 0,
  ma50: 0,
  cci: 0,
  rsi: 0,
  macd: 0,
  macdSignal: 0,
  atr: 0,
  support: 0,
  resistance: 0,
};

const emptyBroker: BrokerSettings = {
  equity: 0,
  riskPercent: 0,
  minLot: 0,
  lotStep: 0,
  pointValue: 0,
  contractSize: 0,
  commission: 0,
  slippage: 0,
  buffer: 0,
  atrMultiplier: 0,
  targetRR: 0,
};

export default function App() {
  const [swingCsv, setSwingCsv] = useState("");
  const [connectedCsvName, setConnectedCsvName] = useState("");
  const [csvResetKey, setCsvResetKey] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData>(initialMarket);
  const [broker, setBroker] = useState<BrokerSettings>(initialBroker);
  // Tahap 3: satu-satunya sumber kebenaran broker aktif. Default Finex.
  const [activeBrokerId, setActiveBrokerId] =
    useState<BrokerId>(DEFAULT_BROKER_ID);
  const [brokerNotice, setBrokerNotice] = useState("");
  const [rawOcr, setRawOcr] = useState("");
  const [symbolNotice, setSymbolNotice] = useState("");
  const [ocrWarning, setOcrWarning] = useState("");
  const [swingSource, setSwingSource] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof analyzeMarket> | null>(
    null,
  );
  // Tahap 5D-STEP2: ECB daily rate 1x saat app init, cache selama session.
  const [fxRates, setFxRates] = useState<ExchangeRates | null>(null);

  useEffect(() => {
    fetchECBRates().then((rates) => {
      setFxRates(rates);
      console.log("FX rates loaded:", rates.fetchedAt);
    });
  }, []);

  const lastSymbol = useRef(initialMarket.symbol);
  const lastBroker = useRef<BrokerId>(DEFAULT_BROKER_ID);

  const scaleIssues = useMemo(() => detectScaleMismatch(market), [market]);

  const validation = useMemo(
    () => validateAnalysisInputs(market, broker, activeBrokerId),
    [market, broker, activeBrokerId],
  );

  const analysis = useMemo(() => {
    let effectiveBroker = broker;
    if (activeBrokerId === ORBITRADER_BROKER_ID && fxRates !== null) {
      const otb = getOtbInstrumentProfile(market.symbol);
      if (otb !== null && otb.currencyProfit !== "USD") {
        const usdPointValue = convertToUSD(broker.pointValue, otb.currencyProfit, fxRates);
        effectiveBroker = { ...broker, pointValue: usdPointValue };
      }
    }
    return analyzeMarket(market, effectiveBroker);
  }, [market, broker, activeBrokerId, fxRates]);

  const isMarketEmpty = useMemo(
    () => RESET_MARKET_FIELDS.every((field) => market[field] === 0),
    [market],
  );

  // Satu sumber prioritas tampilan: kosong > mismatch nyata >
  // belum lengkap > invalid > valid. Data kosong bukan mismatch.
  const viewState = useMemo(
    () =>
      getValidationViewState({
        isEmpty: isMarketEmpty,
        symbol: market.symbol,
        scaleIssues,
        valid: validation.valid,
      }),
    [isMarketEmpty, market.symbol, scaleIssues, validation.valid],
  );

  const clearAnalysisOutput = useCallback(() => {
    setResult(null);
    setConfirmed(false);
    setBlockedReasons(null);
  }, []);

  // Label broker aktif selalu berasal dari state (bukan hard-code).
  const activeBrokerLabel = getBrokerProfile(activeBrokerId).label;

  // Tahap 5A Step 1: saran pindah broker (display only). Tombol memakai
  // handleBrokerChange agar cleanup (CSV/hasil/notice) tetap jalan.
  const otbDetectedNotice = getOtbDetectedNotice(
    activeBrokerId,
    market.symbol,
  );

  // Status preset OTB via satu helper (suffiks _ORB terjaga).
  const otbPresetMissingNotice =
    market.symbol.trim() !== "" &&
    !hasOtbPresetForSymbol(market.symbol.trim(), activeBrokerId)
      ? `Simbol ${market.symbol.trim()} belum terverifikasi di ` +
        `OrbiTraderBerjangka. Preset instrumen belum diaktifkan. ` +
        `Verifikasi simbol dan parameter broker dari Specification ` +
        `OrbiTraderBerjangka terlebih dahulu.`
      : null;

  // Menyesuaikan parameter broker ketika simbol atau broker aktif diganti.
  // CSV instrumen lama tidak boleh dipakai untuk simbol baru.
  // Pengosongan field harga dimiliki handleSymbolChange; effect ini hanya
  // menyesuaikan turunan (broker/CSV/hasil) agar tidak ada dua sumber reset.
  // Tahap 4B/4C: preset diterapkan berdasar broker aktif; simbol OTB tanpa
  // preset terverifikasi tidak mengubah setting (apply = no-op) + notifikasi.
  // Tahap 4C: simbol dikanonikalisasi per broker (OTB exact, _ORB terjaga).
  useEffect(() => {
    const symbol = canonicalSymbolForBroker(market.symbol, activeBrokerId);

    if (!symbol) return;

    const symbolChanged = symbol !== lastSymbol.current;
    const brokerChanged = activeBrokerId !== lastBroker.current;

    if (!symbolChanged && !brokerChanged) return;

    setBroker((previous) =>
      applyBrokerPreset(previous, symbol, activeBrokerId),
    );

    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    setOcrWarning("");
    setSwingSource(null);
    clearAnalysisOutput();

    lastSymbol.current = symbol;
    lastBroker.current = activeBrokerId;
  }, [market.symbol, activeBrokerId, clearAnalysisOutput]);

  // Satu-satunya jalur reset saat pengguna mengganti simbol: kosongkan
  // semua harga/indikator (tanpa angka fiktif) lalu tampilkan instruksi.
  // Tahap 4C: kanonikalisasi per broker agar simbol OTB exact tersimpan.
  const handleSymbolChange = useCallback(
    (nextSymbol: string) => {
      const normalized = canonicalSymbolForBroker(
        nextSymbol,
        activeBrokerId,
      );

      if (!normalized) return;

      if (
        canonicalSymbolForBroker(market.symbol, activeBrokerId) ===
        normalized
      ) {
        return;
      }

      setMarket((previous) =>
        createEmptyMarketForSymbol(normalized, previous),
      );
      setSymbolNotice(
        `Simbol berubah menjadi ${normalized}. Masukkan atau impor data ${normalized} dari chart MT5.`,
      );
    },
    [market.symbol, activeBrokerId],
  );

  const handleExtracted = useCallback(
    (data: Partial<MarketData>, rawText: string) => {
      const currentSym = normalizeSymbol(market.symbol);
      const requestedSym =
        data.symbol !== undefined ? normalizeSymbol(data.symbol) : "";

      // Pilihan manual pengguna menang; usulan OCR dipakai hanya bila
      // belum ada pilihan simbol.
      const finalSym = currentSym || requestedSym || "";

      const { kept, droppedCount } = filterOcrPricesForSymbol(data, finalSym);

      // Merge aman: OCR parsial tidak boleh menghapus nilai valid
      // (mis. S/R dari CSV) dengan field kosong.
      setMarket((previous) => {
        const nextMarket = mergeValidOcrMarketData(previous, data);

        traceOcrStage("handle-extracted", {
          activeSymbol: finalSym,
          receivedFields: Object.keys(data),
          droppedCount,
          previousMarket: previous,
          nextMarket,
        });

        return nextMarket;
      });

      if (droppedCount > 0 && finalSym) {
        setOcrWarning(
          `Data OCR tidak sesuai dengan simbol ${finalSym}. ` +
            `${droppedCount} harga di luar skala diabaikan; periksa manual.`,
        );
      } else {
        setOcrWarning("");
      }

      // OCR yang cocok dengan simbol aktif menutup notice pergantian simbol.
      const hasNewData =
        RESET_MARKET_FIELDS.some((field) => kept[field] !== undefined) ||
        kept.timeframe !== undefined;

      if (
        finalSym &&
        requestedSym === finalSym &&
        currentSym === finalSym &&
        hasNewData
      ) {
        setSymbolNotice("");
      }

      setRawOcr(rawText);
      clearAnalysisOutput();
    },
    [market.symbol, clearAnalysisOutput],
  );

  // Propagasi S/R CSV memakai state terbaru (functional update) agar tidak
  // tertimpa OCR, efek simbol, reset CSV, atau render ulang. Level
  // divalidasi terhadap simbol + broker aktif; penolakan tercatat di
  // diagnostik DEV tanpa mengubah state.
  const handleDetectedLevels = useCallback(
    (
      support: number,
      resistance: number,
      source?: string,
      meta?: CsvSwingLevelMeta,
    ) => {
      traceOcrStage("detected-levels", {
        support,
        resistance,
        source,
        csvSymbol: meta?.csvSymbol ?? null,
      });

      setMarket((previous) => {
        const activeSymbol = normalizeSymbol(previous.symbol);
        const result = applyCsvSwingLevels(
          previous,
          {
            support,
            resistance,
            csvSymbol: meta?.csvSymbol ?? "",
            brokerId: meta?.brokerId,
          },
          { activeSymbol, activeBrokerId },
        );

        traceOcrStage("sr-propagation", {
          activeSymbol,
          csvSymbol: meta?.csvSymbol ?? "",
          brokerId: activeBrokerId,
          detectedSupport: support,
          detectedResistance: resistance,
          appliedSupport: result.appliedSupport,
          appliedResistance: result.appliedResistance,
          previousSupport: previous.support,
          previousResistance: previous.resistance,
          rejectionReason: result.rejectionReason,
          source: source ?? null,
        });

        return result.market;
      });
      setSwingSource(source ?? null);

      clearAnalysisOutput();
    },
    [activeBrokerId, clearAnalysisOutput],
  );

  const handleCsvLoaded = useCallback((text: string, fileName: string) => {
    setSwingCsv(text);
    setConnectedCsvName(fileName);
    // Isi OHLC + Bid/Ask dari candle terakhir CSV (data nyata pengguna,
    // bukan angka fiktif). S/R tetap via deteksi swing; indikator
    // (MA50/CCI/RSI/MACD/ATR) via screenshot OCR atau input manual.
    // Timeframe diambil dari nama file (mis. *_H1.csv) bila ada.
    const parsed = parseCsvCandles(text);
    if (parsed.candles.length > 0) {
      const last = parsed.candles[parsed.candles.length - 1];
      const tfMatch =
        /[_\-\s.](M1|M5|M15|M30|H1|H4|D1|W1|MN1)(?![A-Z0-9])/i.exec(
          fileName,
        );
      const detectedTimeframe = tfMatch
        ? tfMatch[1].toUpperCase()
        : null;
      setMarket((previous) => ({
        ...previous,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        bid: last.close,
        ask: last.close,
        ...(detectedTimeframe ? { timeframe: detectedTimeframe } : {}),
      }));
    }
    setSymbolNotice("");
    setSwingSource(null);
    clearAnalysisOutput();
  }, [clearAnalysisOutput]);

  const handleConnectionChange = useCallback(
    (fileName: string, connected: boolean) => {
      setConnectedCsvName(connected ? fileName : "");
    },
    [],
  );

  const handleApplyBrokerPreset = useCallback(() => {
    setBroker((previous) =>
      applyBrokerPreset(
        previous,
        canonicalSymbolForBroker(market.symbol, activeBrokerId),
        activeBrokerId,
      ),
    );
    clearAnalysisOutput();
  }, [market.symbol, activeBrokerId, clearAnalysisOutput]);

  // Tahap 3: ganti konteks broker saja. Tidak menyentuh data market,
  // pengaturan broker (equity/risiko/preset), parser, atau rumus analisis.
  // Hanya membersihkan output lama dan koneksi CSV broker sebelumnya.
  // Tidak ada angka OTB yang diisi otomatis.
  const handleBrokerChange = useCallback(
    (nextBrokerId: BrokerId) => {
      if (nextBrokerId === activeBrokerId) return;

      setActiveBrokerId(nextBrokerId);
      setSwingCsv("");
      setConnectedCsvName("");
      setCsvResetKey((previous) => previous + 1);
      setOcrWarning("");
      setBrokerNotice(
        nextBrokerId === "orbitraderberjangka"
          ? "Broker aktif: OrbiTraderBerjangka. Preset instrumen belum diaktifkan. Verifikasi simbol dan parameter broker dari Specification OrbiTraderBerjangka terlebih dahulu."
          : "Broker aktif: Finex. Gunakan screenshot, CSV, dan parameter dari terminal Finex.",
      );
      clearAnalysisOutput();
    },
    [activeBrokerId, clearAnalysisOutput],
  );

  function runAnalysis() {
    traceOcrStage("analyze-input", {
      bid: market.bid,
      ask: market.ask,
      ma50: market.ma50,
      cci: market.cci,
      support: market.support,
      resistance: market.resistance,
      equity: broker.equity,
    });

    const reasons = buildBlockedReasons({
      market,
      broker,
      validation,
      scaleIssues,
    });

    if (reasons) {
      setBlockedReasons(reasons);
      setConfirmed(false);
      setResult(null);
      return;
    }

    setBlockedReasons(null);
    setConfirmed(true);
    setResult(analysis);
  }

  function clearAll() {
    setImage(null);
    setMarket(emptyMarket);
    setBroker(emptyBroker);
    setActiveBrokerId(DEFAULT_BROKER_ID);
    setBrokerNotice("");
    setRawOcr("");
    setSymbolNotice("");
    setOcrWarning("");
    setSwingSource(null);
    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    clearAnalysisOutput();
    lastSymbol.current = "";
    lastBroker.current = DEFAULT_BROKER_ID;
  }

  function resetToDefault() {
    setImage(null);
    setMarket(initialMarket);
    setBroker(initialBroker);
    setActiveBrokerId(DEFAULT_BROKER_ID);
    setBrokerNotice("");
    setRawOcr("");
    setSymbolNotice("");
    setOcrWarning("");
    setSwingSource(null);
    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    clearAnalysisOutput();
    lastSymbol.current = initialMarket.symbol;
    lastBroker.current = DEFAULT_BROKER_ID;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div>
            <p className="text-xs font-bold tracking-[0.35em] text-emerald-400">
              MDBKA
            </p>
            <h1 className="mt-1 text-lg font-bold">
              Merangkak Dari Bawah Ke Atas
            </h1>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300 sm:flex">
            <Activity size={16} />
            Analisa Manual
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-7 lg:p-10">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <Sparkles size={14} />
              Analisa trading lebih terstruktur
            </div>

            <h2 className="text-4xl font-black leading-tight md:text-6xl">
              Mulai dari screenshot,
              <span className="text-emerald-400"> pahami keputusannya.</span>
            </h2>

            <p className="mt-5 text-base leading-7 text-slate-300 md:text-lg">
              Tempel screenshot terminal trading, periksa data yang terbaca,
              lalu hitung Beli, Jual, atau Tunggu dengan parameter risiko yang
              dapat Anda ubah.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10 lg:p-6">
          <BrokerSelector
            value={activeBrokerId}
            onChange={handleBrokerChange}
          />

          {activeBrokerId === "orbitraderberjangka" && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              Data Finex tidak otomatis valid untuk OrbiTraderBerjangka.
              Ambil ulang data market dari terminal OrbiTraderBerjangka dan
              konfirmasi ulang sebelum analisa.
            </p>
          )}

          {brokerNotice && (
            <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
              {brokerNotice}
            </p>
          )}

          {otbDetectedNotice && (
            <div
              data-testid="otb-switch-banner"
              className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-sm text-sky-100"
            >
              <p>{otbDetectedNotice}</p>

              <button
                type="button"
                onClick={() =>
                  handleBrokerChange("orbitraderberjangka")
                }
                className="mt-3 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
              >
                Pindah ke OTB
              </button>
            </div>
          )}

          {otbPresetMissingNotice && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              {otbPresetMissingNotice}
            </p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Panel
              icon={<FileCheck2 size={20} />}
              title="1. Tempel atau upload screenshot"
              description="Gunakan Ctrl + V, drag-and-drop, atau upload file."
            >
              <ScreenshotDropzone
                image={image}
                onImageChange={(nextImage) => {
                  setImage(nextImage);
                  setResult(null);
                  setConfirmed(false);
                  setBlockedReasons(null);
                }}
              />

              {image && (
                <div className="mt-5">
                    <OcrExtractor
                      key={image}
                      image={image}
                      market={market}
                      swingSource={swingSource}
                      onExtracted={handleExtracted}
                    />
                </div>
              )}

              {rawOcr && (
                <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-300">
                    Lihat teks OCR mentah
                  </summary>

                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard) {
                        void navigator.clipboard.writeText(rawOcr);
                      }
                    }}
                    className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5"
                  >
                    Salin teks OCR
                  </button>

                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
                    {rawOcr}
                  </pre>
                </details>
              )}

              {ocrWarning && (
                <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                  {ocrWarning}
                </p>
              )}
            </Panel>

            <Panel
              icon={<BarChart3 size={20} />}
              title="2. Periksa dan koreksi data pasar"
              description="Hasil OCR dapat keliru. Koreksi sebelum analisa."
            >
              <ExtractedDataForm
                market={market}
                brokerId={activeBrokerId}
                onChange={(nextMarket) => {
                  setMarket(nextMarket);
                  setSymbolNotice("");
                  setConfirmed(false);
                  setResult(null);
                  setBlockedReasons(null);
                }}
                onSymbolChange={handleSymbolChange}
              />

              {symbolNotice && (
                <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                  {symbolNotice}
                </div>
              )}
            </Panel>

            <Panel
              icon={<ShieldCheck size={20} />}
              title={`3. Atur parameter broker dan risiko — ${activeBrokerLabel}`}
              description="Nilai point dan contract size wajib diverifikasi dari broker."
            >
              <BrokerSettingsForm
                broker={broker}
                symbol={market.symbol}
                brokerId={activeBrokerId}
                onChange={(nextBroker) => {
                  setBroker(nextBroker);
                  setResult(null);
                  setConfirmed(false);
                  setBlockedReasons(null);
                }}
                onApplyPreset={handleApplyBrokerPreset}
              />
            </Panel>

            <CsvFileConnector
              onCsvLoaded={handleCsvLoaded}
              onConnectionChange={handleConnectionChange}
              resetKey={csvResetKey}
            />

            {connectedCsvName && (
              <p className="text-sm text-cyan-300">
                File CSV aktif: {connectedCsvName}
              </p>
            )}

            <p className="text-xs text-slate-500">
              Sumber broker: {activeBrokerLabel}
            </p>

            <SwingLevelsForm
              symbol={market.symbol}
              currentPrice={market.bid > 0 ? market.bid : market.close}
              csvText={swingCsv}
              brokerId={activeBrokerId}
                onCsvTextChange={(text) => {
                  setSwingCsv(text);
                  setResult(null);
                  setConfirmed(false);
                  setBlockedReasons(null);
                }}
              onDetected={handleDetectedLevels}
            />

            <ValidationSummaryCard
              validation={validation}
              symbol={market.symbol}
              viewState={viewState}
            />

            <p className="text-sm font-semibold text-slate-300">
              7. Jalankan analisa
            </p>

            <button
              type="button"
              onClick={runAnalysis}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-400 px-6 py-4 text-lg font-black text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-300"
            >
              <Calculator size={22} />
              ANALISA SEKARANG
            </button>

            <button
              type="button"
              onClick={clearAll}
              className="w-full rounded-xl border border-red-400/30 px-4 py-3 font-semibold text-red-200 transition hover:bg-red-400/10"
            >
              CLEAR SEMUA DATA
            </button>

            <button
              type="button"
              onClick={resetToDefault}
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Kembalikan data contoh GBPUSD
            </button>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Panel
              icon={<Activity size={20} />}
              title="8. Hasil analisa"
              description={
                confirmed
                  ? "Hasil dihitung dari data yang Anda konfirmasi."
                  : "Hasil akan tampil setelah tombol Analisa Sekarang ditekan."
              }
            >
              <AnalysisResult
                result={result}
                market={market}
                viewState={viewState}
                blockedReasons={blockedReasons}
                brokerId={activeBrokerId}
                fxRates={fxRates}
              />
            </Panel>
          </aside>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm leading-6 text-amber-100">
          <strong>Peringatan penting:</strong> MDBKA hanya alat bantu analisa
          edukasi. Aplikasi tidak menempatkan order dan tidak terhubung ke
          rekening trading. Nilai point, contract size, spread, komisi,
          slippage, minimum lot, dan aturan broker dapat berbeda. Hasil analisa
          bukan jaminan keuntungan.
        </section>
      </main>
    </div>
  );
}

function Panel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10 lg:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-400">
          {icon}
        </div>

        <div>
          <h2 className="font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>

      {children}
    </section>
  );
}
