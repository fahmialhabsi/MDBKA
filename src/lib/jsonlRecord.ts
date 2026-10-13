/** G-1 (13 Okt 2026) — format catatan JSONL append-only (fondasi G5). Murni. */
import type { BrokerId } from "../types/broker";
import type { GuardClass } from "./guardClass";
import type { LossCause, RecommendationStatus, RecommendationTarget } from "./lossLesson";
import type { ShadowOutcome } from "./shadowTrade";
import type { ScanStatus } from "./symbolScanner";
export type JsonlSchema = "keputusan/1" | "bayangan/1" | "rekomendasi/1" | "laporan_tim/1";
export type JsonlTable = "keputusan" | "bayangan" | "rekomendasi" | "laporan";

export type GuardResult = "LULUS" | "GAGAL" | "TIDAK_DINILAI";

export interface GuardEntry {
  readonly nama: string;
  readonly hasil: GuardResult;
  readonly kodeAlasan: string | null;
  readonly sumberData: string | null;
  readonly umurDataDetik: number | null;
}

export interface DecisionInputs {
  readonly bid: number | null;
  readonly ask: number | null;
  readonly umurKuotasiDetik: number | null;
  readonly candleTerakhir: string | null;
  readonly jumlahCandle: number | null;
  readonly ma50: number | null;
  readonly rsi: number | null;
  readonly cci: number | null;
  readonly macd: number | null;
  readonly atr: number | null;
  readonly kursUsdIdr: number | null;
  readonly tanggalKurs: string | null;
  readonly equity: number | null;
}

export interface DecisionOutcome {
  readonly status: ScanStatus | null;
  readonly keputusan: "BELI" | "JUAL" | "TUNGGU";
  readonly arahAsli: "BELI" | "JUAL" | "TUNGGU" | null;
  readonly entry: number | null;
  readonly sl: number | null;
  readonly tp: number | null;
  readonly lot: number | null;
  readonly risikoUsd: number | null;
  readonly risikoRp: number | null;
  readonly porsiBiaya: number | null;
  readonly kodeAlasanUtama: string | null;
}

export interface KeputusanRecord {
  readonly skema: "keputusan/1";
  readonly keputusanId: string;
  readonly jalur: "pemindai" | "hasil" | "hasil-shadow" | "entry" | "backtest";
  readonly waktuUtc: string | null;
  readonly waktuServer: string | null;
  readonly waktuDiterima: string | null;
  readonly broker: BrokerId;
  readonly login: string | null;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti";
  readonly setaraLive: boolean | null;
  readonly simbol: string;
  readonly golongan: string | null;
  readonly versiSpesifikasi: string | null;
  readonly aturanId: string;
  readonly versi: string;
  readonly sidikJariSnapshot: string | null;
  readonly masukan: DecisionInputs;
  readonly kualitasData: readonly GuardEntry[];
  readonly penjaga: readonly GuardEntry[];
  readonly hasil: DecisionOutcome;
  readonly sumber: "live" | "csv" | "ocr" | "manual" | null;
  readonly diubahManual: readonly string[];
  readonly mengoreksi: string | null;
  /** A7-4: tiket posisi MT5 untuk jalur entry (G3); absen/null di jalur lain. */
  readonly tiket?: string | null;
}

export interface BayanganRecord {
  readonly skema: "bayangan/1";
  readonly bayanganId: string;
  /** Satu baris saat dibuat (DIBUAT), satu baris saat selesai (SELESAI). */
  readonly fase: "DIBUAT" | "SELESAI";
  readonly waktuUtc: string;
  readonly broker: BrokerId;
  readonly login: string | null;
  readonly simbol: string;
  readonly golongan: string | null;
  readonly arah: "BELI" | "JUAL";
  readonly waktuSinyalServer: string;
  readonly entry: number;
  readonly sl: number;
  readonly tp: number;
  readonly lotTeoretis: number | null;
  readonly porsiBiaya: number | null;
  readonly ditahanOleh: ScanStatus;
  readonly kelasPenjaga: GuardClass;
  readonly aturanId: string;
  readonly versi: string;
  readonly hasil: ShadowOutcome | null;
  readonly waktuKeluarServer: string | null;
  readonly hargaKeluar: number | null;
  readonly r: number | null;
  readonly mfeR: number | null;
  readonly maeR: number | null;
  readonly mengoreksi: string | null;
}

export interface RekomendasiRecord {
  readonly skema: "rekomendasi/1";
  readonly rekomendasiId: string;
  readonly waktuUtc: string;
  readonly sebab: LossCause;
  readonly rekomendasi: string;
  readonly penerima: readonly RecommendationTarget[];
  readonly status: RecommendationStatus;
  readonly sumberJenis: "rangkaian" | "bayangan" | "uji";
  readonly sumberId: string;
  readonly broker: BrokerId | null;
  readonly simbol: string | null;
  readonly golongan: string | null;
  readonly catatan: string | null;
  readonly mengoreksi: string | null;
}

export interface LaporanTimRecord {
  readonly skema: "laporan_tim/1";
  readonly laporanId: string;
  readonly login: string;
  readonly broker: BrokerId;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti";
  readonly tim: string;
  readonly jendelaMulaiUtc: string;
  readonly jendelaSelesaiUtc: string;
  readonly sumberData: readonly { readonly berkas: string; readonly umurDetik: number | null }[];
  readonly kualitasData: readonly GuardEntry[];
  readonly temuan: readonly string[];
  readonly kejadianPenting: boolean;
  readonly diserahkanKe: readonly string[];
  readonly mengoreksi: string | null;
}

export type JsonlRecord = KeputusanRecord | BayanganRecord | RekomendasiRecord | LaporanTimRecord;

export interface JsonlParseResult {
  readonly records: readonly Record<string, unknown>[];
  readonly brokenLines: number;
  readonly otherSchemaLines: number;
}

/** G-1: JSON kanonik — kunci urut abjad, tanpa spasi; angka tidak hingga ditolak (tanpa angka fiktif). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`angka tidak hingga: ${String(value)}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (const item of value as readonly unknown[]) {
      items.push(item === undefined ? "null" : canonicalJson(item));
    }
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const props: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const val = obj[key];
      if (val === undefined) continue;
      props.push(`${JSON.stringify(key)}:${canonicalJson(val)}`);
    }
    return `{${props.join(",")}}`;
  }
  throw new Error(`tipe tidak bisa ditulis ke JSONL: ${typeof value}`);
}

/** G-1: satu record → satu baris JSONL (tanpa "\n" di akhir). */
export function toJsonlLine(record: JsonlRecord): string {
  return canonicalJson(record);
}

/** G-1: hanya pola UTC presisi detik "YYYY-MM-DDTHH:MM:SSZ". */
export function isUtcSecondIso(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text);
}

const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

/** G-1: path relatif (pemisah "/") berkas tabel di bawah data/. */
export function jsonlRelativePath(table: JsonlTable, key: string | null, utcIso: string): string {
  if (!isUtcSecondIso(utcIso)) throw new Error(`waktu UTC harus "YYYY-MM-DDTHH:MM:SSZ": ${utcIso}`);
  if (table === "rekomendasi") return "rekomendasi/rekomendasi.jsonl";
  if (key === null || !SAFE_KEY.test(key)) throw new Error(`kunci berkas ${table} tidak sah: ${String(key)}`);
  return `${table}/${table}-${key}-${utcIso.slice(0, 7)}.jsonl`;
}

/** G-1: baca teks JSONL; baris rusak dihitung, tidak menghentikan. */
export function parseJsonlText(text: string, schema: JsonlSchema): JsonlParseResult {
  const records: Record<string, unknown>[] = [];
  let brokenLines = 0;
  let otherSchemaLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      brokenLines += 1;
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      brokenLines += 1;
      continue;
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.skema !== "string") {
      brokenLines += 1;
    } else if (obj.skema !== schema) {
      otherSchemaLines += 1;
    } else {
      records.push(obj);
    }
  }
  return { records, brokenLines, otherSchemaLines };
}
