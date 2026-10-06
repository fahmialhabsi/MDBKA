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
  Briefcase,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import BrokerSettingsForm from "./components/analysis/BrokerSettingsForm";
import ExtractedDataForm from "./components/extraction/ExtractedDataForm";
import ValidationSummaryCard from "./components/analysis/ValidationSummaryCard";
import SwingLevelsForm from "./components/analysis/SwingLevelsForm";
import AnalysisResult from "./components/result/AnalysisResult";
import { LiveEquityView } from "./components/result/LiveEquity";
import { useEquityStream } from "./hooks/useEquityStream";
import { HoldingsMonitor } from "./components/holdings/HoldingsMonitor";
import {
  createWorkspaceStore,
  hasWorkspaceWork,
  snapshotWorkspace,
} from "./lib/brokerWorkspace";
import { LiveQuotes } from "./components/analysis/LiveQuotes";
import { useQuotesStream } from "./hooks/useQuotesStream";
import dashboard from "./styles/dashboard.module.css";

import { analyzeMarket } from "./calculations/decisionEngine";
import { detectScaleMismatch } from "./calculations/scaleValidator";
import { validateAnalysisInputs } from "./calculations/inputValidator";
import {
  getInstrumentProfile,
  SUPPORTED_SYMBOLS,
} from "./lib/instrumentConfig";
import { parseCsvCandles } from "./lib/csvCandleParser";
import { resolveSwingLevels } from "./calculations/swingDetector";
import { computeIndicators } from "./calculations/indicators";
import { traceOcrStage } from "./lib/debugTrace";
import {
  DEFAULT_BROKER_ID,
  ORBITRADER_BROKER_ID,
  getBrokerProfile,
} from "./lib/brokerRegistry";
import {
  canonicalSymbolForBroker,
  getOtbDetectedNotice,
  hasOtbPresetForSymbol,
  OTB_ALL_SYMBOLS,
} from "./lib/brokerSymbols";

import { getOtbInstrumentProfile } from "./lib/otbInstrumentConfig";
import type { BrokerSettings, MarketData } from "./types/analysis";
import type { BrokerId } from "./types/broker";
import CsvFileConnector from "./components/analysis/CsvFileConnector";
import {
  applyBrokerPreset,
  applyCsvSwingLevels,
  createEmptyMarketForSymbol,
  RESET_MARKET_FIELDS,
  type CsvSwingLevelMeta,
} from "./lib/marketReset";
import {
  buildBlockedReasons,
  getValidationViewState,
} from "./lib/validationView";
import {
  fetchBackendRates,
  fetchECBRates,
  convertToUSD,
  type ExchangeRates,
} from "./services/fxRateService";
import { API_BASE_URL } from "./lib/apiBaseUrl";

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

/**
 * Ukuran 1 tick untuk simbol (dipakai sebagai spread minimal placeholder
 * saat auto-fill Bid/Ask dari candle CSV). OTB dibaca dari profil
 * Specification (EXACT, _ORB terjaga); selainnya dari instrumentConfig.
 * Selalu > 0 agar guard ask > bid lolos.
 */
function tickSizeForSymbol(symbol: string): number {
  const otb = getOtbInstrumentProfile(symbol.trim().toUpperCase());
  if (otb !== null && otb.tickSize > 0) return otb.tickSize;
  const profile = getInstrumentProfile(symbol);
  if (profile.category !== "unknown" && profile.decimals > 0) {
    return Math.pow(10, -profile.decimals);
  }
  return 0.00001;
}

export default function App() {
  const [swingCsv, setSwingCsv] = useState("");
  const [connectedCsvName, setConnectedCsvName] = useState("");
  const [csvResetKey, setCsvResetKey] = useState(0);
  const [market, setMarket] = useState<MarketData>(initialMarket);
  const [broker, setBroker] = useState<BrokerSettings>(initialBroker);
  // Tahap 3: satu-satunya sumber kebenaran broker aktif. Default Finex.
  const [activeBrokerId, setActiveBrokerId] =
    useState<BrokerId>(DEFAULT_BROKER_ID);
  const [brokerNotice, setBrokerNotice] = useState("");
  const [symbolNotice, setSymbolNotice] = useState("");
  const [swingSource, setSwingSource] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof analyzeMarket> | null>(
    null,
  );
  // Tahap 5D-STEP2: ECB daily rate 1x saat app init, cache selama session.
  // Tahap FX-PROXY: via backend sendiri dulu (bebas blokir CORS ECB);
  // direct fetchECBRates hanya cadangan (konteks Node/test).
  const [fxRates, setFxRates] = useState<ExchangeRates | null>(null);

  useEffect(() => {
    fetchBackendRates(API_BASE_URL)
      .then((viaBackend) => viaBackend ?? fetchECBRates())
      .then((rates) => {
        setFxRates(rates);
        console.log("FX rates loaded:", rates.fetchedAt);
      });
  }, []);

  const lastSymbol = useRef(initialMarket.symbol);
  const lastBroker = useRef<BrokerId>(DEFAULT_BROKER_ID);
  // Tahap WS: simpanan workspace per broker (ref: ditulis di handler/
  // effect saja, dibaca untuk badge via state savedFlags di bawah).
  const workspacesRef = useRef(createWorkspaceStore());
  const [savedFlags, setSavedFlags] = useState<Record<BrokerId, boolean>>({
    finex: false,
    orbitraderberjangka: false,
  });

  const scaleIssues = useMemo(() => detectScaleMismatch(market), [market]);

  const validation = useMemo(
    () => validateAnalysisInputs(market, broker, activeBrokerId),
    [market, broker, activeBrokerId],
  );

  // Satu-satunya langganan equity live di App: dipakai panel sidebar
  // SEKALIGUS auto-analisa (tanpa langganan ganda di LiveEquityView).
  const equityStream = useEquityStream(5000, activeBrokerId);
  const liveEquityValue =
    equityStream.equity !== null &&
    Number.isFinite(equityStream.equity.equity) &&
    equityStream.equity.equity > 0
      ? equityStream.equity.equity
      : null;
  // Nilai live terakhir yang diterapkan otomatis. Melindungi edit manual:
  // live hanya menimpa bila field kosong ATAU masih sama dengan nilai
  // live yang diterapkan sebelumnya (bukan ketikan pengguna).
  // Equity contoh bawaan (initialBroker) bukan ketikan pengguna: anggap
  // nilai otomatis agar equity live boleh menggantikannya.
  const appliedLiveEquityRef = useRef<Record<BrokerId, number | null>>({
    finex: initialBroker.equity,
    orbitraderberjangka: initialBroker.equity,
  });

  // Quote live simbol aktif: sumber spread asli untuk ask dari CSV.
  const { quote: liveQuote } = useQuotesStream(
    market.symbol,
    5000,
    activeBrokerId,
  );

  // Inti analisa yang bisa dipanggil dengan nilai eksplisit (bukan state
  // yang belum ter-commit) — dipakai alur otomatis setelah CSV masuk.
  const executeAnalysis = useCallback(
    (marketData: MarketData, brokerData: BrokerSettings) => {
      traceOcrStage("analyze-input", {
        bid: marketData.bid,
        ask: marketData.ask,
        ma50: marketData.ma50,
        cci: marketData.cci,
        support: marketData.support,
        resistance: marketData.resistance,
        equity: brokerData.equity,
      });

      const nextValidation = validateAnalysisInputs(
        marketData,
        brokerData,
        activeBrokerId,
      );
      const nextScale = detectScaleMismatch(marketData);
      const reasons = buildBlockedReasons({
        market: marketData,
        broker: brokerData,
        validation: nextValidation,
        scaleIssues: nextScale,
      });

      if (reasons) {
        setBlockedReasons(reasons);
        setConfirmed(false);
        setResult(null);
        return;
      }

      let effectiveBroker = brokerData;
      if (activeBrokerId === ORBITRADER_BROKER_ID && fxRates !== null) {
        const otb = getOtbInstrumentProfile(marketData.symbol);
        if (otb !== null && otb.currencyProfit !== "USD") {
          const usdPointValue = convertToUSD(
            brokerData.pointValue,
            otb.currencyProfit,
            fxRates,
          );
          effectiveBroker = { ...brokerData, pointValue: usdPointValue };
        }
      }

      setBlockedReasons(null);
      setConfirmed(true);
      setResult(analyzeMarket(marketData, effectiveBroker));
    },
    [activeBrokerId, fxRates],
  );

  // Auto susulan: CSV sudah masuk tapi equity live belum tiba saat itu
  // (hasil masih kosong) → terapkan otomatis begitu live tersedia.
  // Hanya saat belum ada hasil sukses; ketikan manual dilindungi via
  // appliedLiveEquityRef; guard key mencegah loop.
  const autoEquityKeyRef = useRef("");
  useEffect(() => {
    if (liveEquityValue === null || result !== null) return;
    // Hanya alur CSV: tanpa CSV terhubung (mis. data contoh saat start),
    // jangan jalankan analisa otomatis.
    if (connectedCsvName.trim() === "") return;
    const empty = !Number.isFinite(broker.equity) || broker.equity <= 0;
    const followsLive =
      broker.equity === appliedLiveEquityRef.current[activeBrokerId];
    if (!empty && !followsLive) return;
    const key = `${liveEquityValue}|${market.symbol}|${market.close}`;
    if (autoEquityKeyRef.current === key) return;
    autoEquityKeyRef.current = key;
    appliedLiveEquityRef.current[activeBrokerId] = liveEquityValue;
    const nextBroker = { ...broker, equity: liveEquityValue };
    setBroker(nextBroker);
    executeAnalysis(market, nextBroker);
  }, [
    liveEquityValue,
    result,
    market,
    broker,
    executeAnalysis,
    connectedCsvName,
    activeBrokerId,
  ]);

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
  const otbDetectedNotice = getOtbDetectedNotice(activeBrokerId, market.symbol);

  // Status preset OTB via satu helper (suffiks _ORB terjaga).
  const otbPresetMissingNotice =
    market.symbol.trim() !== "" &&
    !hasOtbPresetForSymbol(market.symbol.trim(), activeBrokerId)
      ? `Simbol ${market.symbol.trim()} belum terverifikasi di ` +
        `OrbiTraderBerjangka. Preset instrumen belum diaktifkan. ` +
        `Verifikasi simbol dan parameter broker dari Specification ` +
        `OrbiTraderBerjangka terlebih dahulu.`
      : null;

  // Guard salah file: nama CSV mengandung simbol lain (mis. upload
  // MDBKA_EURAUD_ORB_H1.csv saat simbol aktif EURCAD_ORB). Harga CSV
  // akan mengisi market simbol aktif → analisa memakai data simbol
  // lain. Display-only, tidak memblokir.
  const csvSymbolMismatchNotice = useMemo(() => {
    if (connectedCsvName.trim() === "") return null;
    const upper = connectedCsvName.toUpperCase();
    // Kecocokan terpanjang dulu (sama dengan handleCsvLoaded).
    const longestFirst = (list: readonly string[]) =>
      [...list].sort((a, b) => b.length - a.length);
    const token =
      longestFirst(OTB_ALL_SYMBOLS).find((candidate) =>
        upper.includes(candidate),
      ) ??
      longestFirst(SUPPORTED_SYMBOLS).find((candidate) =>
        upper.includes(candidate),
      );
    if (token === undefined) return null;
    const active = canonicalSymbolForBroker(market.symbol, activeBrokerId);
    if (token !== active) {
      return (
        `File CSV ${connectedCsvName} berisi data ${token}, tapi simbol ` +
        `aktif ${active}. Upload file ${active} agar analisa tidak memakai ` +
        `data simbol lain.`
      );
    }
    return null;
  }, [connectedCsvName, market.symbol, activeBrokerId]);

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

    // Tahap WS: ganti broker → pulihkan workspace tersimpan bila ada
    // (tanpa wipe). Broker baru tanpa simpanan → jalur lama di bawah
    // (preset + reset; semuanya sudah kosong dari handler).
    if (brokerChanged) {
      const saved = workspacesRef.current[activeBrokerId];
      if (saved !== null) {
        lastSymbol.current = canonicalSymbolForBroker(
          saved.market.symbol,
          activeBrokerId,
        );
        lastBroker.current = activeBrokerId;
        setMarket(saved.market);
        setBroker(saved.broker);
        setSwingCsv(saved.swingCsv);
        setConnectedCsvName(saved.connectedCsvName);
        setSwingSource(saved.swingSource);
        setResult(saved.result);
        setConfirmed(saved.confirmed);
        setBlockedReasons(saved.blockedReasons);
        setSymbolNotice("");
        return;
      }
    }

    setBroker((previous) => {
      // Workspace baru untuk broker ini: equity yang terbawa dari broker
      // lain bukan milik akun ini → tandai otomatis agar live menggantinya.
      if (brokerChanged) {
        appliedLiveEquityRef.current[activeBrokerId] = previous.equity;
      }
      return applyBrokerPreset(previous, symbol, activeBrokerId);
    });

    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
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
      const normalized = canonicalSymbolForBroker(nextSymbol, activeBrokerId);

      if (!normalized) return;

      if (
        canonicalSymbolForBroker(market.symbol, activeBrokerId) === normalized
      ) {
        return;
      }

      setMarket((previous) => createEmptyMarketForSymbol(normalized, previous));
      setSymbolNotice(
        `Simbol berubah menjadi ${normalized}. Masukkan atau impor data ${normalized} dari chart MT5.`,
      );
    },
    [market.symbol, activeBrokerId],
  );

  // Propagasi S/R CSV + analisa ulang otomatis (bukan clear): S/R adalah
  // input analisa, sehingga level baru = hasil baru. Equity mengikuti live
  // bila kosong (ketikan manual dilindungi via appliedLiveEquityRef).
  // applyCsvSwingLevels mengembalikan referensi market yang SAMA bila tak
  // ada perubahan → bail out dini tanpa setState, sehingga tidak ada loop
  // deteksi berulang walau identitas callback berubah.
  const handleDetectedLevels = useCallback(
    (
      support: number,
      resistance: number,
      source?: string,
      meta?: CsvSwingLevelMeta,
    ) => {
      const currentMarket = market;
      const currentBroker = broker;
      traceOcrStage("detected-levels", {
        support,
        resistance,
        source,
        csvSymbol: meta?.csvSymbol ?? null,
      });

      // Nama mentah: normalizeSymbol("#AAPL") = "" (lihat applyCsvSwingLevels).
      const activeSymbol = currentMarket.symbol.trim();
      const applied = applyCsvSwingLevels(
        currentMarket,
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
        appliedSupport: applied.appliedSupport,
        appliedResistance: applied.appliedResistance,
        previousSupport: currentMarket.support,
        previousResistance: currentMarket.resistance,
        rejectionReason: applied.rejectionReason,
        source: source ?? null,
      });

      setMarket(applied.market);
      setSwingSource(source ?? null);

      // Level sudah ada (termasuk penolakan): tidak ada yang berubah,
      // hentikan di sini agar tidak memicu render/analisa berulang.
      if (applied.market === currentMarket) return;

      let nextBroker = currentBroker;
      if (
        liveEquityValue !== null &&
        (!Number.isFinite(nextBroker.equity) ||
          nextBroker.equity <= 0 ||
          nextBroker.equity === appliedLiveEquityRef.current[activeBrokerId])
      ) {
        if (nextBroker.equity !== liveEquityValue) {
          nextBroker = { ...nextBroker, equity: liveEquityValue };
        }
        appliedLiveEquityRef.current[activeBrokerId] = liveEquityValue;
      }
      setBroker(nextBroker);
      executeAnalysis(applied.market, nextBroker);
    },
    [market, broker, activeBrokerId, liveEquityValue, executeAnalysis],
  );

  // Alur utama (otomatis): CSV masuk → simbol mengikuti nama file →
  // preset broker → equity live → analisa langsung jalan. Pengguna hanya
  // mengunggah file; tanpa tombol Analisa Sekarang.
  const handleCsvLoaded = useCallback(
    (text: string, fileName: string) => {
      // Simbol dari nama file (mis. MDBKA_EURCAD_ORB_H1.csv → EURCAD_ORB).
      // OTB dicek dulu agar suffiks _ORB tidak terpangkas.
      const upperName = fileName.toUpperCase();
      // Kecocokan terpanjang dulu: cegah BA.US menangkap BABA.US,
      // T.US menangkap WMT.US, #AA menangkap #AAPL, #MA menangkap #MAR.
      const longestFirst = (list: readonly string[]) =>
        [...list].sort((a, b) => b.length - a.length);
      const fileToken =
        longestFirst(OTB_ALL_SYMBOLS).find((candidate) =>
          upperName.includes(candidate),
        ) ??
        longestFirst(SUPPORTED_SYMBOLS).find((candidate) =>
          upperName.includes(candidate),
        ) ??
        null;
      const currentCanonical = canonicalSymbolForBroker(
        market.symbol,
        activeBrokerId,
      );
      let baseSymbol = currentCanonical;
      if (fileToken !== null) {
        const canonicalToken = canonicalSymbolForBroker(
          fileToken,
          activeBrokerId,
        );
        const validForBroker =
          activeBrokerId === ORBITRADER_BROKER_ID
            ? (OTB_ALL_SYMBOLS as readonly string[]).includes(canonicalToken)
            : canonicalToken !== "";
        if (validForBroker) baseSymbol = canonicalToken;
      }

      const parsed = parseCsvCandles(text);
      // Indikator (MA50/RSI/CCI/ATR/MACD) dihitung dari candle — butuh 50+
      // candle; bila kurang, validator yang menolak (bukan angka fiktif).
      const indicators = computeIndicators(parsed.candles);

      // Bangun market berikutnya secara sinkron (bukan dari state yang
      // belum ter-commit) agar auto-analisa memakai nilai yang sama
      // persis dengan yang ditampilkan.
      const emptyBase = createEmptyMarketForSymbol(baseSymbol, market);
      const base: MarketData = { ...emptyBase, symbol: baseSymbol };
      let nextMarket: MarketData = base;
      if (parsed.candles.length > 0) {
        const last = parsed.candles[parsed.candles.length - 1];
        const tfMatch =
          /[_\-\s.](M1|M5|M15|M30|H1|H4|D1|W1|MN1)(?![A-Z0-9])/i.exec(fileName);
        const detectedTimeframe = tfMatch ? tfMatch[1].toUpperCase() : null;
        // Bid = close terakhir; Ask = close + 1 tick (spread minimal agar
        // lolos guard ask > bid — WAJIB diverifikasi via Live Quotes/MT5,
        // karena spread asli hanya diketahui dari quote berjalan).
        const tick = tickSizeForSymbol(baseSymbol);
        // S/R dihitung sinkron agar analisa pertama tidak "ditahan" menunggu
        // SwingLevelsForm (race: market baru S/R=0 → blocked → baru terisi).
        const levels = resolveSwingLevels(parsed.candles, last.close);
        nextMarket = {
          ...base,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          bid: last.close,
          // Spread asli dari quote live simbol sama (fallback 1 tick); bid tetap
          // = close CSV. Dibulatkan agar tanpa sisa float (#488).
          ask: Number(
            (
              last.close +
              (liveQuote !== null &&
              liveQuote.symbol === baseSymbol &&
              liveQuote.ask > liveQuote.bid
                ? liveQuote.ask - liveQuote.bid
                : tick)
            ).toPrecision(12),
          ),
          ...(detectedTimeframe ? { timeframe: detectedTimeframe } : {}),
          ...(indicators !== null
            ? {
                ma50: indicators.ma50,
                rsi: indicators.rsi,
                cci: indicators.cci,
                atr: indicators.atr,
                macd: indicators.macd,
                macdSignal: indicators.macdSignal,
              }
            : {}),
          ...(levels.support !== null ? { support: levels.support } : {}),
          ...(levels.resistance !== null
            ? { resistance: levels.resistance }
            : {}),
        };
      }

      // Preset broker untuk simbol (non-force: override manual aman).
      let nextBroker = applyBrokerPreset(broker, baseSymbol, activeBrokerId);
      // Equity otomatis dari live: isi bila kosong, ikuti bila masih sama
      // dengan nilai live sebelumnya (ketikan manual pengguna dilindungi).
      if (
        liveEquityValue !== null &&
        (!Number.isFinite(nextBroker.equity) ||
          nextBroker.equity <= 0 ||
          nextBroker.equity === appliedLiveEquityRef.current[activeBrokerId])
      ) {
        if (nextBroker.equity !== liveEquityValue) {
          nextBroker = { ...nextBroker, equity: liveEquityValue };
        }
        appliedLiveEquityRef.current[activeBrokerId] = liveEquityValue;
      }

      setSwingCsv(text);
      setConnectedCsvName(fileName);
      setMarket(nextMarket);
      setBroker(nextBroker);
      lastSymbol.current = baseSymbol;
      setSymbolNotice(
        baseSymbol !== currentCanonical
          ? `Simbol mengikuti file CSV: ${baseSymbol}. Hasil analisa berjalan otomatis.`
          : "",
      );
      setSwingSource(null);
      executeAnalysis(nextMarket, nextBroker);
    },
    [
      market,
      broker,
      activeBrokerId,
      liveEquityValue,
      executeAnalysis,
      liveQuote,
    ],
  );

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
        true,
      ),
    );
    clearAnalysisOutput();
  }, [market.symbol, activeBrokerId, clearAnalysisOutput]);

  // Tahap 3: ganti konteks broker saja. Tidak menyentuh data market,
  // pengaturan broker (equity/risiko/preset), parser, atau rumus analisis.
  // Tahap WS: slice aktif DISIMPAN ke workspace broker (bukan dibuang);
  // effect simbol/broker memulihkan simpanan (tanpa wipe) atau memulai
  // segar untuk broker baru. Field yang dibersihkan di bawah hanya
  // tampilan sementara sampai effect pulih/me-reset.
  // Tidak ada angka OTB yang diisi otomatis.
  const handleBrokerChange = useCallback(
    (nextBrokerId: BrokerId) => {
      if (nextBrokerId === activeBrokerId) return;

      workspacesRef.current[activeBrokerId] = snapshotWorkspace({
        market,
        broker,
        swingCsv,
        connectedCsvName,
        swingSource,
        result,
        confirmed,
        blockedReasons,
        image: null,
        rawOcr: "",
      });
      const store = workspacesRef.current;
      setSavedFlags({
        finex: hasWorkspaceWork(store.finex),
        orbitraderberjangka: hasWorkspaceWork(store.orbitraderberjangka),
      });

      setActiveBrokerId(nextBrokerId);
      setSwingCsv("");
      setConnectedCsvName("");
      setCsvResetKey((previous) => previous + 1);
      setBrokerNotice(
        nextBrokerId === "orbitraderberjangka"
          ? "Broker aktif: OrbiTraderBerjangka. Preset instrumen belum diaktifkan. Verifikasi simbol dan parameter broker dari Specification OrbiTraderBerjangka terlebih dahulu."
          : "Broker aktif: Finex. Gunakan CSV dan parameter dari terminal Finex.",
      );
      clearAnalysisOutput();
    },
    [
      activeBrokerId,
      market,
      broker,
      swingCsv,
      connectedCsvName,
      swingSource,
      result,
      confirmed,
      blockedReasons,
      clearAnalysisOutput,
    ],
  );

  function clearAll() {
    workspacesRef.current = createWorkspaceStore();
    setSavedFlags({ finex: false, orbitraderberjangka: false });
    setMarket(emptyMarket);
    setBroker(emptyBroker);
    appliedLiveEquityRef.current[activeBrokerId] = null;
    setActiveBrokerId(DEFAULT_BROKER_ID);
    setBrokerNotice("");
    setSymbolNotice("");
    setSwingSource(null);
    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    clearAnalysisOutput();
    lastSymbol.current = "";
    lastBroker.current = DEFAULT_BROKER_ID;
  }

  function resetToDefault() {
    workspacesRef.current = createWorkspaceStore();
    setSavedFlags({ finex: false, orbitraderberjangka: false });
    setMarket(initialMarket);
    setBroker(initialBroker);
    appliedLiveEquityRef.current[activeBrokerId] = initialBroker.equity;
    setActiveBrokerId(DEFAULT_BROKER_ID);
    setBrokerNotice("");
    setSymbolNotice("");
    setSwingSource(null);
    setSwingCsv("");
    setConnectedCsvName("");
    setCsvResetKey((previous) => previous + 1);
    clearAnalysisOutput();
    lastSymbol.current = initialMarket.symbol;
    lastBroker.current = DEFAULT_BROKER_ID;
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-slate-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-3 py-3 sm:px-4 lg:px-6">
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
            Analisa Otomatis
          </div>
        </div>
      </header>

      <main className={`${dashboard.page} space-y-4 py-4 sm:space-y-6 sm:py-6`}>
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 lg:p-7">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <Sparkles size={14} />
                Analisa trading lebih terstruktur
              </span>
              <div
                role="group"
                aria-label="Pilih broker"
                className="inline-flex overflow-hidden rounded-full border border-white/15"
              >
                <button
                  type="button"
                  data-testid="broker-tab-finex"
                  aria-pressed={activeBrokerId === "finex"}
                  onClick={() => handleBrokerChange("finex")}
                  className={`px-4 py-1.5 text-xs font-bold ${
                    activeBrokerId === "finex"
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-transparent text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Finex
                </button>
                <button
                  type="button"
                  data-testid="broker-tab-otb"
                  aria-pressed={activeBrokerId === "orbitraderberjangka"}
                  onClick={() => handleBrokerChange("orbitraderberjangka")}
                  className={`px-4 py-1.5 text-xs font-bold ${
                    activeBrokerId === "orbitraderberjangka"
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-transparent text-slate-300 hover:bg-white/10"
                  }`}
                >
                  OTB
                </button>
              </div>
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              Upload CSV,
              <span className="text-emerald-400"> analisa otomatis jalan.</span>
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              Pilih simbol, hubungkan file CSV candle dari terminal trading, dan
              biarkan MDBKA menghitung Beli, Jual, atau Tunggu dengan parameter
              risiko Anda.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10 lg:p-6">
          {activeBrokerId === "orbitraderberjangka" && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
              {"Data Finex tidak otomatis valid untuk OrbiTraderBerjangka. " +
                "Ambil ulang data market dari terminal OrbiTraderBerjangka dan " +
                "konfirmasi ulang sebelum analisa."}
            </p>
          )}

          {brokerNotice && (
            <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
              {brokerNotice}
            </p>
          )}

          {((activeBrokerId === "finex" && savedFlags.orbitraderberjangka) ||
            (activeBrokerId === "orbitraderberjangka" && savedFlags.finex)) && (
            <p
              data-testid="workspace-saved-notice"
              className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100"
            >
              Analisa{" "}
              {
                getBrokerProfile(
                  activeBrokerId === "finex" ? "orbitraderberjangka" : "finex",
                ).label
              }{" "}
              tersimpan — pilih broker tersebut untuk kembali tanpa mengulang
              input.
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
                onClick={() => handleBrokerChange("orbitraderberjangka")}
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

        <div className={dashboard.workGrid}>
          <div className={dashboard.mainCol}>
            <div className="space-y-6">
              <Panel
                icon={<BarChart3 size={20} />}
                title="1. Periksa dan koreksi data pasar"
                description="Data terisi otomatis dari CSV. Koreksi bila perlu."
              >
                <ExtractedDataForm
                  market={market}
                  brokerId={activeBrokerId}
                  result={result}
                  setResult={setResult}
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
                title={`2. Atur parameter broker dan risiko — ${activeBrokerLabel}`}
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

              {csvSymbolMismatchNotice && (
                <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                  {csvSymbolMismatchNotice}
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

            <Panel
              icon={<Activity size={20} />}
              title="6. Hasil analisa"
              description={
                confirmed
                  ? "Hasil dihitung otomatis dari CSV yang dihubungkan."
                  : "Hasil tampil otomatis setelah file CSV dihubungkan."
              }
            >
              <AnalysisResult
                result={result}
                market={market}
                viewState={viewState}
                blockedReasons={blockedReasons}
                minLot={broker.minLot}
                lotStep={broker.lotStep}
                brokerId={activeBrokerId}
                fxRates={fxRates}
              />
            </Panel>

            <Panel
              icon={<Briefcase size={20} />}
              title="7. Monitor posisi (manual)"
              description="Catat posisi MT5 manual; pantau P&L live + sinyal exit. Tanpa order."
            >
              <HoldingsMonitor
                brokerId={activeBrokerId}
                fxRates={fxRates}
                activeSymbol={market.symbol}
              />
            </Panel>
          </div>

          <aside className={dashboard.sideCol} aria-label="Data live MT5">
            <LiveQuotes symbol={market.symbol} brokerId={activeBrokerId} />
            <LiveEquityView
              {...equityStream}
              brokerId={activeBrokerId}
              onApplyEquity={(liveEquity) => {
                if (!Number.isFinite(liveEquity) || liveEquity <= 0) return;
                appliedLiveEquityRef.current[activeBrokerId] = liveEquity;
                const nextBroker = { ...broker, equity: liveEquity };
                setBroker(nextBroker);
                executeAnalysis(market, nextBroker);
              }}
            />
          </aside>
        </div>

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
