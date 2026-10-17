import { useCallback, useEffect, useMemo, useState } from "react";
import { useTradeSessions } from "./useTradeSessions";
import { useDataQuality } from "./useDataQuality";
import { useCautions } from "./useCautions";
import { useStorms } from "./useStorms";
import { useTradingMode } from "./useTradingMode";
import { useBrokerPositions } from "./useBrokerPositions";
import { accountsForActiveLogin, pauseLocks } from "../lib/tradingMode";
import { labAllowed, labTicket, minLotFor, type LabTicket } from "../lib/labTrades";
import { combinedRisk } from "../lib/combinedRisk";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { LiveQuoteLike } from "../lib/csvQuote";
import { upcomingHighNews, type NewsEventLike } from "../lib/newsGuard";
import { mergeGroupStats, type EvalAccount } from "../lib/evaluationView";
import {
  lastCandleTimeMs,
  scanSymbol,
  scanPointValueUsd,
  scanSymbolDetailed,
  sortScanRows,
  type ScanInput,
  type ScanStatus,
} from "../lib/symbolScanner";
import { specHoldMap } from "../lib/specCompare";
import { canonicalSymbolForBroker } from "../lib/brokerSymbols";
import { checkLossStreak, tradesForBroker } from "../lib/lossStreakGuard";
import { usdIdrRate, type ExchangeRates } from "../services/fxRateService";
import type { BrokerId } from "../types/broker";

/**
 * Logika pemindai simbol Mode Aman (dipindah apa adanya dari SymbolScannerPanel, 17 Okt 2026) supaya
 * panel pemindai di dashboard dan halaman Meja Trading memakai SATU hitungan yang sama: candle +
 * semua satpam (berita, sesi, spesifikasi, bukti F5, jeda, korelasi, kualitas data) + rencana order.
 */
export interface CandleItem {
  readonly symbol: string;
  readonly csv: string;
  readonly modified: string;
  readonly quote: LiveQuoteLike | null;
}

const REFRESH_MS = 60_000;
const EVAL_REFRESH_MS = 5 * 60_000;

export function useSymbolScan(brokerId: BrokerId, equity: number, fxRates: ExchangeRates | null) {
  const [items, setItems] = useState<readonly CandleItem[]>([]);
  // Broker asal `items`: hasil hanya dipakai untuk broker yang sama.
  const [itemsBroker, setItemsBroker] = useState<BrokerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  // O2: jam nyata saat pindaian dimuat (satpam pembukaan bursa; diperbarui tiap refresh).
  const [scanAtMs, setScanAtMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const key = `${brokerId}|${tick}`;
  // Satpam Kalender K4b: kalender broker aktif (null = tidak tersedia).
  const [calendar, setCalendar] = useState<{
    readonly broker: BrokerId;
    readonly events: readonly NewsEventLike[] | null;
  } | null>(null);
  // V2c: simbol yang spesifikasi MT5-nya beda dengan spec32 (null = tidak tersedia).
  const [specBook, setSpecBook] = useState<{
    readonly broker: BrokerId;
    readonly holds: ReadonlyMap<string, string> | null;
  } | null>(null);
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
  // T2 (Tahap 15): kunci memuat harga buka + SL (syarat "posisi pertama aman").
  const positionsKey = positions
    .map((p) => `${p.symbol}:${p.side}:${p.priceOpen}:${p.sl}`)
    .sort()
    .join(",");
  const openPositions = useMemo(
    () =>
      positionsKey === ""
        ? []
        : positionsKey.split(",").map((part) => {
            const cells = part.split(":");
            const n = cells.length;
            return {
              symbol: cells.slice(0, n - 3).join(":"),
              side: cells[n - 3] ?? "",
              priceOpen: Number(cells[n - 2]),
              sl: Number(cells[n - 1]),
            };
          }),
    [positionsKey],
  );
  // E1/E2 (Tahap 15): rugi gabungan bila semua SL posisi terbuka kena.
  const risk = useMemo(
    () =>
      combinedRisk(
        positions,
        (sym) => scanPointValueUsd(sym, brokerId, fxRates),
        equity > 0 ? equity : null,
        usdIdrRate(fxRates),
      ),
    [positions, brokerId, fxRates, equity],
  );
  // Tahap 13: saklar mode A + K-4 (jeda & bukti F5 hanya dari login aktif).
  const tradingMode = useTradingMode(brokerId);
  const activeLogin = tradingMode.state.login;
  const activeAccounts = useMemo(() => accountsForActiveLogin(evalAccounts, brokerId, activeLogin), [evalAccounts, brokerId, activeLogin]);
  // F5: memo agar pemindai tidak dihitung ulang tiap render.
  const lolosStats = useMemo(() => mergeGroupStats(activeAccounts, brokerId, "LOLOS"), [activeAccounts, brokerId]);

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
        setScanAtMs(Date.now());
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
      // Satpam Kalender K4b: gagal / tidak tersedia = satpam diabaikan.
      try {
        const res = await fetch(`${API_BASE_URL}/api/calendar?broker=${brokerId}`);
        const body = res.ok
          ? ((await res.json()) as { available?: boolean; events?: NewsEventLike[] })
          : null;
        if (!cancelled) {
          setCalendar({
            broker: brokerId,
            events:
              body !== null && body.available === true && Array.isArray(body.events)
                ? body.events
                : null,
          });
        }
      } catch {
        if (!cancelled) setCalendar({ broker: brokerId, events: null });
      }
      // V2c: gagal / tidak tersedia = satpam spesifikasi diabaikan.
      try {
        const res = await fetch(`${API_BASE_URL}/api/specs?broker=${brokerId}`);
        const body = res.ok
          ? ((await res.json()) as { available?: boolean; diffs?: { symbol: string; level: string; reason: string }[] })
          : null;
        if (!cancelled) {
          setSpecBook({
            broker: brokerId,
            holds: body !== null && body.available === true && Array.isArray(body.diffs) ? specHoldMap(body.diffs) : null,
          });
        }
      } catch {
        if (!cancelled) setSpecBook({ broker: brokerId, holds: null });
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

  // Langkah F: jam server terbaru (quote) + status jeda 3 rugi beruntun.
  const nowServer = (itemsBroker === brokerId ? items : []).reduce<string | null>(
    (max, item) =>
      item.quote !== null && (max === null || item.quote.timestamp > max)
        ? item.quote.timestamp
        : max,
    null,
  );
  const lossPause = useMemo(
    () => checkLossStreak(tradesForBroker(activeAccounts, brokerId), nowServer),
    [activeAccounts, brokerId, nowServer],
  );
  // Mode Demo: jeda tetap dihitung & ditampilkan, tetapi TIDAK mengunci sinyal.
  const pauseLocked = lossPause.paused && pauseLocks(tradingMode.state.mode);
  const pauseReason = pauseLocked ? lossPause.reason : null;
  const newsEvents = calendar !== null && calendar.broker === brokerId ? calendar.events : null;
  const specHolds = specBook !== null && specBook.broker === brokerId ? specBook.holds : null;
  // Satpam Sesi S3: jam trading resmi broker.
  const sessions = useTradeSessions(brokerId);
  // F2: terminal putus / ekspor EA berhenti → semua sinyal status DATA (lebih aman).
  const dataQualityReason = useDataQuality(brokerId);
  // PR-2: catatan waspada per simbol (hanya peringatan, tidak menahan).
  const cautions = useCautions(brokerId);
  // K6: berita Tinggi mendatang (jam server broker ini).
  const upcoming = useMemo(() => upcomingHighNews(newsEvents, nowServer), [newsEvents, nowServer]);

  const source = useMemo(() => (itemsBroker === brokerId ? items : []), [items, itemsBroker, brokerId]);
  // Candle terbaru broker ini = acuan "pasar buka" (jam server yang sama).
  const reference = useMemo(
    () =>
      source.reduce<number | null>((max, item) => {
        const t = lastCandleTimeMs(item.csv);
        return t !== null && (max === null || t > max) ? t : max;
      }, null),
    [source],
  );
  // Satu pintu analisa: dipakai tabel DAN tombol [SL] (quote baru, satpam sama).
  const inputFor = useCallback(
    (item: CandleItem, quote: LiveQuoteLike | null): ScanInput => ({
        symbol: item.symbol,
        brokerId,
        csv: item.csv,
        quote,
        equity,
        fxRates,
        referenceCandleMs: reference,
        openPositions,
        // T2: masuk lagi simbol sama hanya di mode efektif Demo.
        addOnAllowed: tradingMode.state.mode === "DEMO",
        pauseReason,
        // K4b: jam server terbaru broker (quote simbol tutup bisa basi).
        newsEvents,
        newsNow: nowServer ?? undefined,
        sessions,
        specHolds,
        openingNowMs: scanAtMs,
        // F4/F5: bukti History MT5 kelompok LOLOS broker ini (demo + live).
        proof: lolosStats,
        dataQualityReason,
      }),
    [brokerId, equity, fxRates, reference, openPositions, tradingMode.state.mode, pauseReason, newsEvents, nowServer, sessions, specHolds, scanAtMs, lolosStats, dataQualityReason],
  );
  const scanItem = useCallback(
    (item: CandleItem, quote: LiveQuoteLike | null) => scanSymbol(inputFor(item, quote)),
    [inputFor],
  );
  // LAB-2 (Opsi A): trade uji hanya di akun terbukti demo + mode Demo; Fahmi membuka sendiri di MT5.
  const labOn = labAllowed(tradingMode.state.jenisAkun, tradingMode.state.mode);
  const labTickets = useMemo<LabTicket[]>(
    () =>
      !labOn
        ? []
        : source
            .map((item) => {
              const d = scanSymbolDetailed(inputFor(item, item.quote));
              return labTicket(d.row, d.setup, minLotFor(d.row.symbol, brokerId));
            })
            .filter((t): t is LabTicket => t !== null),
    [labOn, source, inputFor, brokerId],
  );
  const rows = useMemo(
    () => sortScanRows(source.map((item) => scanItem(item, item.quote))),
    [source, scanItem],
  );
  // CU-1: Peringatan Badai 30 menit (CSV M15, nama simbol asli broker) — hanya peringatan.
  const stormSymbols = useMemo(() => source.map((i) => i.symbol), [source]);
  const storms = useStorms(stormSymbols);
  const stormOf = useCallback(
    (symbol: string) => {
      const item = source.find((i) => canonicalSymbolForBroker(i.symbol, brokerId) === symbol);
      const w = item === undefined ? undefined : storms.get(item.symbol);
      return w !== undefined && w.status === "BADAI" ? w : null;
    },
    [source, storms, brokerId],
  );
  const recomputePlan = useCallback(
    (symbol: string, quote: LiveQuoteLike) => {
      const item = source.find((i) => canonicalSymbolForBroker(i.symbol, brokerId) === symbol);
      if (item === undefined) return null;
      const row = scanItem(item, quote);
      return row.status === "LOLOS" ? (row.plan ?? null) : null;
    },
    [source, scanItem, brokerId],
  );

  const counts = rows.reduce<Record<ScanStatus, number>>(
    (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
    { LOLOS: 0, DITAHAN_BIAYA: 0, DITAHAN_RISIKO: 0, DITAHAN_KORELASI: 0, DITAHAN_JEDA: 0, DITAHAN_BERITA: 0, DITAHAN_SESI: 0, DITAHAN_SPEK: 0, DITAHAN_BUKA: 0, DITAHAN_BUKTI: 0, TUNGGU: 0, PASAR_TUTUP: 0, DATA: 0 },
  );
  const loading =
    loadedKey === null || (itemsBroker !== brokerId && error === null);
  const rescan = useCallback(() => setTick((t) => t + 1), []);
  return { rows, counts, loading, error, fetchedAt, rescan, calendar, newsEvents, upcoming, risk, tradingMode, labOn, labTickets, lossPause, pauseLocked, cautions, stormOf, recomputePlan, lolosStats, source, nowServer, sessions };
}
