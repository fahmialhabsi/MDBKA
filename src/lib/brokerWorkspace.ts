import type { analyzeMarket } from "../calculations/decisionEngine";
import type { BrokerId } from "../types/broker";
import type { BrokerSettings, MarketData } from "../types/analysis";

/**
 * Tahap WS — workspace analisis per broker (MODUL MURNI, CJS-safe:
 * tanpa import.meta, tanpa DOM).
 *
 * Masalah: market + hasil + CSV cuma SATU (shared). Ganti broker
 * me-wipe semuanya (anti-kontaminasi) sehingga analisa broker lain
 * hilang. Solusi: tiap broker punya slice state sendiri; pindah
 * broker = simpan slice aktif + pulihkan slice target (tanpa wipe).
 * Broker yang belum dikunjungi mulai dari workspace segar (setara
 * fresh-load hari ini).
 *
 * Slice mencakup SEMUA yang membentuk "hasil kerja": market, setting
 * broker, CSV swing + nama file, sumber swing, hasil analisa, status
 * konfirmasi, alasan blokir, screenshot, teks OCR. Yang TIDAK ikut:
 * fxRates/live (global, sudah per-broker via parameter), holdings
 * (punya brokerId sendiri), filter UI sementara (notice = kontekstual).
 */

export type AnalysisOutcome = ReturnType<typeof analyzeMarket>;

export interface BrokerWorkspace {
  readonly market: MarketData;
  readonly broker: BrokerSettings;
  readonly swingCsv: string;
  readonly connectedCsvName: string;
  readonly swingSource: string | null;
  readonly result: AnalysisOutcome | null;
  readonly confirmed: boolean;
  readonly blockedReasons: string[] | null;
  readonly image: string | null;
  readonly rawOcr: string;
}

export type WorkspaceStore = Record<BrokerId, BrokerWorkspace | null>;

/** Store kosong: kedua broker belum dikunjungi. */
export function createWorkspaceStore(): WorkspaceStore {
  return { finex: null, orbitraderberjangka: null };
}

/** Bekukan slice aktif menjadi workspace (snapshot sekali jalan). */
export function snapshotWorkspace(state: {
  readonly market: MarketData;
  readonly broker: BrokerSettings;
  readonly swingCsv: string;
  readonly connectedCsvName: string;
  readonly swingSource: string | null;
  readonly result: AnalysisOutcome | null;
  readonly confirmed: boolean;
  readonly blockedReasons: string[] | null;
  readonly image: string | null;
  readonly rawOcr: string;
}): BrokerWorkspace {
  return {
    market: { ...state.market },
    broker: { ...state.broker },
    swingCsv: state.swingCsv,
    connectedCsvName: state.connectedCsvName,
    swingSource: state.swingSource,
    result: state.result,
    confirmed: state.confirmed,
    blockedReasons:
      state.blockedReasons === null ? null : [...state.blockedReasons],
    image: state.image,
    rawOcr: state.rawOcr,
  };
}

/** Workspace segar = setara fresh-load (market/broker awal app). */
export function createFreshWorkspace(
  market: MarketData,
  broker: BrokerSettings,
): BrokerWorkspace {
  return snapshotWorkspace({
    market,
    broker,
    swingCsv: "",
    connectedCsvName: "",
    swingSource: null,
    result: null,
    confirmed: false,
    blockedReasons: null,
    image: null,
    rawOcr: "",
  });
}

/**
 * True bila workspace punya hasil kerja (analisa jadi ATAU data parsial
 * yang rugi bila di-wipe: market terisi/CSV Hasil/konfirmasi).
 * Dipakai badge "analisa tersimpan" di pemilih broker.
 */
export function hasWorkspaceWork(workspace: BrokerWorkspace | null): boolean {
  if (workspace === null) return false;
  if (workspace.result !== null) return true;
  if (workspace.confirmed) return true;
  if (workspace.swingCsv.trim() !== "") return true;
  const market = workspace.market;
  return (
    market.symbol.trim() !== "" &&
    (market.bid > 0 ||
      market.close > 0 ||
      market.support > 0 ||
      market.resistance > 0)
  );
}
