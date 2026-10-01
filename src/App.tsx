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
import BrokerSettingsForm from "./components/analysis/BrokerSettingsForm";
import ValidationSummaryCard from "./components/analysis/ValidationSummaryCard";
import SwingLevelsForm from "./components/analysis/SwingLevelsForm";
import AnalysisResult from "./components/result/AnalysisResult";

import { analyzeMarket } from "./calculations/decisionEngine";
import { detectScaleMismatch } from "./calculations/scaleValidator";
import { validateAnalysisInputs } from "./calculations/inputValidator";
import { getInstrumentPreset, normalizeSymbol } from "./lib/instrumentConfig";

import type { BrokerSettings, MarketData } from "./types/analysis";
import CsvFileConnector from "./components/analysis/CsvFileConnector";

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
  const [rawOcr, setRawOcr] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof analyzeMarket> | null>(
    null,
  );

  const lastSymbol = useRef(initialMarket.symbol);

  const scaleIssues = useMemo(() => detectScaleMismatch(market), [market]);

  const validation = useMemo(
    () => validateAnalysisInputs(market, broker),
    [market, broker],
  );

  const analysis = useMemo(
    () => analyzeMarket(market, broker),
    [market, broker],
  );

  // Menyesuaikan parameter broker ketika simbol diganti.
  // CSV instrumen lama tidak boleh dipakai untuk simbol baru.
  useEffect(() => {
    const symbol = normalizeSymbol(market.symbol);

    if (!symbol) return;

    if (symbol === lastSymbol.current) return;

    const preset = getInstrumentPreset(symbol);

    setBroker((previous) => ({
      ...previous,
      pointValue: preset.defaultPointValue,
      contractSize: preset.contractSize,
      buffer: preset.defaultBuffer,
    }));

    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    setMarket((previous) => {
      if (previous.support === 0 && previous.resistance === 0) {
        return previous;
      }
      return {
        ...previous,
        support: 0,
        resistance: 0,
      };
    });
    setResult(null);
    setConfirmed(false);

    lastSymbol.current = symbol;
  }, [market.symbol]);

  const handleExtracted = useCallback(
    (data: Partial<MarketData>, rawText: string) => {
      setMarket((previous) => {
        const merged = {
          ...previous,
          ...data,
        };

        // OCR boleh mengusulkan simbol, tetapi tidak boleh menimpa
        // pilihan dropdown pengguna secara diam-diam.
        if (data.symbol !== undefined) {
          const incoming = normalizeSymbol(data.symbol);
          const current = normalizeSymbol(previous.symbol);

          if (!incoming) {
            merged.symbol = previous.symbol;
          } else if (current && incoming !== current) {
            merged.symbol = previous.symbol;
          } else {
            merged.symbol = incoming;
          }
        }

        return merged;
      });
      setRawOcr(rawText);
      setConfirmed(false);
      setResult(null);
    },
    [],
  );

  const handleDetectedLevels = useCallback(
    (support: number, resistance: number) => {
      setMarket((previous) => {
        if (
          previous.support === support &&
          previous.resistance === resistance
        ) {
          return previous;
        }

        return {
          ...previous,
          support,
          resistance,
        };
      });

      setResult(null);
      setConfirmed(false);
    },
    [],
  );

  const handleCsvLoaded = useCallback((text: string, fileName: string) => {
    setSwingCsv(text);
    setConnectedCsvName(fileName);
    setResult(null);
    setConfirmed(false);
  }, []);

  const handleConnectionChange = useCallback(
    (fileName: string, connected: boolean) => {
      setConnectedCsvName(connected ? fileName : "");
    },
    [],
  );

  function runAnalysis() {
    if (!validation.valid || scaleIssues.length > 0) {
      setConfirmed(false);
      setResult(null);
      return;
    }

    setConfirmed(true);
    setResult(analysis);
  }

  function clearAll() {
    setImage(null);
    setMarket(emptyMarket);
    setBroker(emptyBroker);
    setRawOcr("");
    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    setConfirmed(false);
    setResult(null);
  }

  function resetToDefault() {
    setImage(null);
    setMarket(initialMarket);
    setBroker(initialBroker);
    setRawOcr("");
    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    setConfirmed(false);
    setResult(null);
    lastSymbol.current = initialMarket.symbol;
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
                }}
              />

              {image && (
                <div className="mt-5">
                  <OcrExtractor
                    image={image}
                    market={market}
                    onExtracted={handleExtracted}
                  />
                </div>
              )}

              {rawOcr && (
                <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-300">
                    Lihat teks OCR mentah
                  </summary>

                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
                    {rawOcr}
                  </pre>
                </details>
              )}
            </Panel>

            <Panel
              icon={<BarChart3 size={20} />}
              title="2. Periksa dan koreksi data pasar"
              description="Hasil OCR dapat keliru. Koreksi sebelum analisa."
            >
              <ExtractedDataForm
                market={market}
                onChange={(nextMarket) => {
                  setMarket(nextMarket);
                  setConfirmed(false);
                  setResult(null);
                }}
              />
            </Panel>

            <Panel
              icon={<ShieldCheck size={20} />}
              title="3. Atur parameter broker dan risiko"
              description="Nilai point dan contract size wajib diverifikasi dari broker."
            >
              <BrokerSettingsForm
                broker={broker}
                symbol={market.symbol}
                onChange={(nextBroker) => {
                  setBroker(nextBroker);
                  setResult(null);
                  setConfirmed(false);
                }}
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

            <SwingLevelsForm
              symbol={market.symbol}
              currentPrice={market.bid > 0 ? market.bid : market.close}
              csvText={swingCsv}
              onCsvTextChange={(text) => {
                setSwingCsv(text);
                setResult(null);
                setConfirmed(false);
              }}
              onDetected={handleDetectedLevels}
            />

            <ValidationSummaryCard
              validation={validation}
              symbol={market.symbol}
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
                scaleIssues={scaleIssues}
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
