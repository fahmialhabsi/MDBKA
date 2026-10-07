/**
 * #514 - kurs Bank Indonesia (wsKursBI, Kurs Transaksi) - logika murni.
 * Respons getSubKursLokal3 (ASMX DataSet) memuat per baris:
 *   nil_subkurslokal (unit), beli_/jual_subkurslokal, tgl_subkurslokal,
 *   mts_subkurslokal (kode mata uang).
 * PENTING: ini kurs informasi, BUKAN kurs pajak (KMK Menteri Keuangan).
 */
export interface KursBi {
  readonly currency: string;
  /** Jumlah mata uang asing per kurs (USD=1, JPY=100). */
  readonly unit: number;
  readonly buy: number;
  readonly sell: number;
  /** Tanggal kurs YYYY-MM-DD (waktu Indonesia). */
  readonly date: string;
  readonly source: "BANK_INDONESIA";
  readonly rateType: "KURS_TRANSAKSI";
}

const tag = (chunk: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(chunk);
  return m === null ? null : m[1].trim();
};

/** Parse XML wsKursBI; baris tak lengkap/angka tak sah dilewati (tanpa tebakan). */
export function parseBiKursXml(xml: string): KursBi[] {
  const out: KursBi[] = [];
  for (const chunk of xml.split("<id_subkurslokal>").slice(1)) {
    const currency = tag(chunk, "mts_subkurslokal");
    const unit = Number(tag(chunk, "nil_subkurslokal"));
    const buy = Number(tag(chunk, "beli_subkurslokal"));
    const sell = Number(tag(chunk, "jual_subkurslokal"));
    const dateRaw = tag(chunk, "tgl_subkurslokal");
    const date = dateRaw === null ? "" : dateRaw.slice(0, 10);
    if (currency === null || currency === "") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (![unit, buy, sell].every((n) => Number.isFinite(n) && n > 0)) continue;
    out.push({
      currency,
      unit,
      buy,
      sell,
      date,
      source: "BANK_INDONESIA",
      rateType: "KURS_TRANSAKSI",
    });
  }
  return out;
}

/** Kurs terbaru (tanggal terbesar) untuk satu mata uang, atau null. */
export function latestKursBi(
  list: readonly KursBi[],
  currency: string,
): KursBi | null {
  let best: KursBi | null = null;
  for (const k of list) {
    if (k.currency !== currency) continue;
    if (best === null || k.date > best.date) best = k;
  }
  return best;
}

/** Kurs tengah (beli+jual)/2 per 1 unit mata uang asing, dalam Rupiah. */
export function midRateIdr(k: KursBi): number {
  return (k.buy + k.sell) / 2 / k.unit;
}
