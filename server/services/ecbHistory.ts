import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Halaman History H1 (9 Okt 2026) — buku kurs USD→Rp harian dari ECB.
 *
 * Penetapan Fahmi: kolom Rupiah memakai kurs TANGGAL TRANSAKSI. ECB hanya
 * menyediakan 90 hari terakhir (eurofxref-hist-90d.xml), jadi kurs disimpan
 * ke buku sendiri `data/fx/ecb-usdidr.json` (gabung, tidak pernah dihapus)
 * agar transaksi lama tetap punya kurs. Kurs USD→Rp = IDR per EUR ÷ USD per
 * EUR. Akhir pekan/libur = kurs hari kerja sebelumnya (maks 7 hari).
 */
export const ECB_HIST_90D_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

/** Buku kurs: "YYYY-MM-DD" → Rupiah per 1 USD. */
export type UsdIdrBook = Record<string, number>;

export interface UsdIdrOn {
  /** Tanggal kurs yang dipakai (bisa hari kerja sebelumnya). */
  readonly date: string;
  readonly rate: number;
}

/** Parse XML ECB historis (MURNI). Hari tanpa USD/IDR dilewati. */
export function parseEcbHistXml(xml: string): UsdIdrBook {
  const out: UsdIdrBook = {};
  const dayRe = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>\s*(?=<Cube\s+time=|<\/Cube>)/g;
  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(xml)) !== null) {
    const body = m[2];
    const rate = (cur: string): number | null => {
      const r = new RegExp(`currency=['"]${cur}['"]\\s+rate=['"]([0-9.]+)['"]`).exec(body);
      const n = r === null ? NaN : Number(r[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const usd = rate("USD");
    const idr = rate("IDR");
    if (usd !== null && idr !== null) out[m[1]] = Math.round((idr / usd) * 100) / 100;
  }
  return out;
}

export function readUsdIdrBook(file: string): UsdIdrBook {
  try {
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: UsdIdrBook = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "number" && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Gabung kurs baru ke buku (yang lama tetap) & tulis atomik. */
export function mergeUsdIdrBook(file: string, fresh: UsdIdrBook): UsdIdrBook {
  const merged: UsdIdrBook = { ...readUsdIdrBook(file), ...fresh };
  const sorted: UsdIdrBook = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(sorted, null, 1));
  renameSync(tmp, file);
  return sorted;
}

/**
 * Kurs untuk satu tanggal transaksi (jam server "YYYY.MM.DD HH:MM:SS" atau
 * "YYYY-MM-DD"). Tidak ada di hari itu → hari sebelumnya, maks 7 hari.
 */
export function usdIdrOn(book: UsdIdrBook, dateText: string): UsdIdrOn | null {
  const m = /^(\d{4})[.-](\d{2})[.-](\d{2})/.exec(dateText.trim());
  if (m === null) return null;
  let ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  for (let i = 0; i <= 7; i++) {
    const key = new Date(ms).toISOString().slice(0, 10);
    const rate = book[key];
    if (typeof rate === "number" && rate > 0) return { date: key, rate };
    ms -= 86_400_000;
  }
  return null;
}

/** Ambil 90 hari ECB lalu gabungkan ke buku. Gagal → buku lama apa adanya. */
export async function refreshUsdIdrBook(
  file: string,
  doFetch: typeof fetch | undefined = (globalThis as { fetch?: typeof fetch }).fetch,
): Promise<UsdIdrBook> {
  try {
    if (typeof doFetch !== "function") return readUsdIdrBook(file);
    const res = await doFetch(ECB_HIST_90D_URL);
    if (!res.ok) return readUsdIdrBook(file);
    const fresh = parseEcbHistXml(await res.text());
    if (Object.keys(fresh).length === 0) return readUsdIdrBook(file);
    return mergeUsdIdrBook(file, fresh);
  } catch {
    return readUsdIdrBook(file);
  }
}
