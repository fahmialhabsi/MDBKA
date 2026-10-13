import { createHash } from "node:crypto";
import { canonicalJson, jsonlRelativePath, type SpesifikasiRecord } from "../../src/lib/jsonlRecord";
import type { LiveSpec } from "../../src/lib/specCompare";
import { appendJsonlRecord, readJsonlRecords } from "./jsonlStore";
import type { SpecSnapshot } from "./specReader";

/**
 * F4 (13 Okt 2026) — versi spesifikasi bertanggal (fondasi A4/C3).
 * Sidik jari dari kolom yang menentukan hitungan risiko & order (contract,
 * tick, digit, lot min/langkah, mata uang profit, mode swap). Tarif swap
 * harian (swapLong/Short) SENGAJA tidak ikut: berubah hampir tiap hari.
 * Versi = "YYYY-MM-DD#<12 hex>" (tanggal pertama terlihat). Riwayat di
 * data/spesifikasi/spesifikasi-<broker>.jsonl (append-only, ikut Backup).
 */
function numOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

export function specVersionMaterial(specs: readonly LiveSpec[]): unknown[] {
  return [...specs]
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
    .map((s) => ({
      symbol: s.symbol,
      contractSize: numOrNull(s.contractSize),
      tickSize: numOrNull(s.tickSize),
      digits: numOrNull(s.digits),
      volumeMin: numOrNull(s.volumeMin),
      volumeStep: numOrNull(s.volumeStep),
      swapMode: numOrNull(s.swapMode),
      profitCurrency: s.profitCurrency,
    }));
}

export function specContentHash(specs: readonly LiveSpec[]): string {
  return createHash("sha256").update(canonicalJson(specVersionMaterial(specs)), "utf8").digest("hex").slice(0, 12);
}

/** Versi aktif broker; tulis baris baru bila isi berubah. null = tanpa spesifikasi. */
export function trackSpecVersion(dataDir: string, snap: SpecSnapshot | null, now: Date): string | null {
  if (snap === null || snap.specs.length === 0) return null;
  const hash = specContentHash(snap.specs);
  const nowIso = now.toISOString().slice(0, 19) + "Z";
  const rel = jsonlRelativePath("spesifikasi", snap.broker, nowIso);
  const book = readJsonlRecords(dataDir, rel, "spesifikasi/1").records;
  const last = book.length === 0 ? null : book[book.length - 1];
  if (last !== null && last.hash === hash && typeof last.versi === "string") return last.versi;
  const rec: SpesifikasiRecord = {
    skema: "spesifikasi/1",
    versi: `${nowIso.slice(0, 10)}#${hash}`,
    broker: snap.broker,
    hash,
    pertamaTerlihatUtc: nowIso,
    berkas: snap.file,
    jumlahSimbol: snap.specs.length,
  };
  appendJsonlRecord(dataDir, rel, rec);
  return rec.versi;
}
