/** S1 (13 Okt 2026) — shadow Hasil analisa (A7-2, fondasi A8). Murni; hanya membaca, tidak pernah mengubah hasil yang tampil. */
import type { AnalysisResult, Decision } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import type { KeputusanRecord } from "./jsonlRecord";
import { RISK_CAP_SLIPPAGE_RESERVE, riskCapFor, riskGroupOf } from "./riskGroup";
import { findSessionHold, type TradeSession } from "./sessionGuard";

/** Bagian hasil terlihat yang dibaca shadow (dikirim App ke server). */
export interface ShownSummary {
  readonly decision: Decision;
  readonly entry: number | null;
  readonly stopLoss: number | null;
  readonly takeProfit: number | null;
  readonly suggestedLot: number | null;
  readonly costShareOfRisk: number | null;
  /** R-1: risiko USD pada lot minimum (absen = App lama; R-1 tidak dinilai). */
  readonly riskAtMinLot?: number | null;
}

export interface ResultShadow {
  readonly shownDecision: Decision;
  readonly shadowDecision: Decision;
  readonly differs: boolean;
  readonly shadowCode: "DITAHAN_SESI" | "DITAHAN_RISIKO" | null;
  readonly shadowReason: string | null;
  readonly closesInMin: number | null;
}

const SERVER_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Salinan ringkas hasil terlihat; tidak menyimpan referensi ke objek aslinya. */
export function summarizeShown(shown: Readonly<AnalysisResult>): ShownSummary {
  return {
    decision: shown.decision,
    entry: finiteOrNull(shown.entry),
    stopLoss: finiteOrNull(shown.stopLoss),
    takeProfit: finiteOrNull(shown.takeProfit),
    suggestedLot: finiteOrNull(shown.suggestedLot),
    costShareOfRisk: finiteOrNull(shown.costShareOfRisk),
    riskAtMinLot: finiteOrNull(shown.riskAtMinLot),
  };
}

/**
 * Penjaga sesi yang sama dengan pemindai, dinilai di atas hasil terlihat.
 * null = tidak bisa dinilai (jam server tidak sah / data sesi kosong) → tidak dicatat.
 */
export function computeResultShadow(
  shown: ShownSummary,
  symbol: string,
  serverNow: string | null,
  sessions: readonly TradeSession[] | null,
  /** R-1: kurs USD→Rp; null/absen = cadangan slippage tidak dinilai. */
  usdIdr: number | null = null,
): ResultShadow | null {
  if (serverNow === null || !SERVER_TIME.test(serverNow)) return null;
  if (sessions === null || sessions.length === 0) return null;
  if (shown.decision !== "BELI" && shown.decision !== "JUAL") {
    return { shownDecision: shown.decision, shadowDecision: shown.decision, differs: false, shadowCode: null, shadowReason: null, closesInMin: null };
  }
  const hold = findSessionHold(symbol, serverNow, sessions);
  if (hold === null) {
    // R-1: lolos batas golongan penuh, tetapi melewati batas ÷1,1 → pemindai akan menahan.
    const cap = riskCapFor(symbol, usdIdr);
    const risk = shown.riskAtMinLot ?? null;
    if (cap.usd !== null && cap.idr !== null && risk !== null && risk > cap.usd / RISK_CAP_SLIPPAGE_RESERVE && risk <= cap.usd) {
      const rp = cap.usdIdr === null ? null : Math.round(risk * cap.usdIdr);
      return {
        shownDecision: shown.decision,
        shadowDecision: "TUNGGU",
        differs: true,
        shadowCode: "DITAHAN_RISIKO",
        shadowReason: `R-1: risiko lot minimum ${rp === null ? `$${risk.toFixed(2)}` : `Rp${rp.toLocaleString("id-ID")}`} > batas ${cap.label} ÷ ${String(RISK_CAP_SLIPPAGE_RESERVE).replace(".", ",")} (Rp${Math.round(cap.idr / RISK_CAP_SLIPPAGE_RESERVE).toLocaleString("id-ID")})`,
        closesInMin: null,
      };
    }
    return { shownDecision: shown.decision, shadowDecision: shown.decision, differs: false, shadowCode: null, shadowReason: null, closesInMin: null };
  }
  return {
    shownDecision: shown.decision,
    shadowDecision: "TUNGGU",
    differs: true,
    shadowCode: "DITAHAN_SESI",
    shadowReason: hold.reason,
    closesInMin: hold.closesInMin,
  };
}

/** Maksimal sekali per broker + simbol + candle H1 (jam server "YYYY.MM.DD HH"). */
export function shadowDedupKey(broker: BrokerId, symbol: string, serverNow: string): string {
  return `${broker}|${symbol}|${serverNow.slice(0, 13)}`;
}

export interface ShadowRecordMeta {
  readonly keputusanId: string;
  readonly waktuUtc: string;
  readonly broker: BrokerId;
  readonly symbol: string;
  readonly serverNow: string;
}

/** Baris `keputusan` jalur "hasil-shadow"; nilai yang tidak diketahui = null. */
export function buildShadowRecord(meta: ShadowRecordMeta, shown: ShownSummary, shadow: ResultShadow): KeputusanRecord {
  return {
    skema: "keputusan/1",
    keputusanId: meta.keputusanId,
    jalur: "hasil-shadow",
    waktuUtc: meta.waktuUtc,
    waktuServer: meta.serverNow,
    waktuDiterima: meta.waktuUtc,
    broker: meta.broker,
    login: null,
    jenisAkun: "tidak-terbukti",
    setaraLive: null,
    simbol: meta.symbol,
    golongan: riskGroupOf(meta.symbol).id,
    versiSpesifikasi: null,
    aturanId: "skor",
    versi: "1",
    sidikJariSnapshot: null,
    masukan: {
      bid: null, ask: null, umurKuotasiDetik: null, candleTerakhir: null, jumlahCandle: null,
      ma50: null, rsi: null, cci: null, macd: null, atr: null, kursUsdIdr: null, tanggalKurs: null, equity: null,
    },
    kualitasData: [],
    penjaga: [
      {
        nama: "sesi",
        hasil: shadow.shadowCode === "DITAHAN_SESI" ? "GAGAL" : "LULUS",
        kodeAlasan: shadow.shadowCode === "DITAHAN_SESI" ? shadow.shadowCode : null,
        sumberData: "MDBKA_Sessions",
        umurDataDetik: null,
      },
      ...(shadow.shadowCode === "DITAHAN_RISIKO"
        ? [{ nama: "risiko_cadangan_r1", hasil: "GAGAL" as const, kodeAlasan: shadow.shadowCode, sumberData: "riskGroup", umurDataDetik: null }]
        : []),
    ],
    hasil: {
      status: shadow.shadowCode,
      keputusan: shadow.shadowDecision,
      arahAsli: shown.decision,
      entry: shown.entry,
      sl: shown.stopLoss,
      tp: shown.takeProfit,
      lot: shown.suggestedLot,
      risikoUsd: null,
      risikoRp: null,
      porsiBiaya: shown.costShareOfRisk,
      kodeAlasanUtama: shadow.shadowCode,
    },
    sumber: null,
    diubahManual: [],
    mengoreksi: null,
  };
}
