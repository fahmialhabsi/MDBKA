import type { HistoryDeal } from "./historyCsv";

/**
 * #505 - logika murni jurnal pajak Finex (tanpa I/O).
 * - Impor anti-duplikat per dealTicket; kurs & catatan manual TIDAK ditimpa.
 * - Rekap per tahun: profit, swap, komisi, fee, netto USD; setoran/penarikan
 *   dipisah (BALANCE bukan penghasilan). Netto Rupiah memakai kurs pajak
 *   (KMK) yang diisi pengguna per transaksi; transaksi tanpa kurs dihitung
 *   terpisah (tanpaKurs) agar tidak ada angka tebakan.
 * Catatan: alat bantu pencatatan, bukan nasihat pajak/konsultan.
 */
export interface JurnalEntry extends HistoryDeal {
  /** Kurs pajak (KMK) Rp per 1 USD pada tanggal transaksi; null = belum diisi. */
  readonly kursIdr: number | null;
  /** Asal kurs: KMK (ditempel pengguna), manual (diedit per transaksi), atau null. */
  readonly kursSumber: "KMK" | "manual" | null;
  readonly catatan: string;
}

export interface JurnalYearSummary {
  readonly year: string;
  readonly profitUsd: number;
  readonly swapUsd: number;
  readonly commissionUsd: number;
  readonly feeUsd: number;
  readonly nettoUsd: number;
  readonly depositUsd: number;
  readonly withdrawalUsd: number;
  readonly nettoIdr: number;
  readonly dealCount: number;
  readonly tanpaKurs: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function isTradeDeal(deal: Pick<HistoryDeal, "type">): boolean {
  return deal.type === "BUY" || deal.type === "SELL";
}

export function dealNettoUsd(
  deal: Pick<HistoryDeal, "profit" | "swap" | "commission" | "fee">,
): number {
  return deal.profit + deal.swap + deal.commission + deal.fee;
}

export function mergeDeals(
  existing: readonly JurnalEntry[],
  incoming: readonly HistoryDeal[],
): { entries: JurnalEntry[]; added: number } {
  const seen = new Set(existing.map((e) => e.dealTicket));
  const entries: JurnalEntry[] = [...existing];
  let added = 0;
  for (const deal of incoming) {
    if (seen.has(deal.dealTicket)) continue;
    seen.add(deal.dealTicket);
    entries.push({ ...deal, kursIdr: null, kursSumber: null, catatan: "" });
    added++;
  }
  entries.sort((a, b) => a.serverTime.localeCompare(b.serverTime));
  return { entries, added };
}

export function updateEntry(
  entries: readonly JurnalEntry[],
  dealTicket: string,
  patch: { kursIdr?: number | null; catatan?: string },
): JurnalEntry[] | null {
  if (!entries.some((e) => e.dealTicket === dealTicket)) return null;
  return entries.map((e) => {
    if (e.dealTicket !== dealTicket) return e;
    const kurs =
      patch.kursIdr === undefined
        ? e.kursIdr
        : patch.kursIdr !== null &&
            Number.isFinite(patch.kursIdr) &&
            patch.kursIdr > 0
          ? patch.kursIdr
          : null;
    return {
      ...e,
      kursIdr: kurs,
      kursSumber:
        patch.kursIdr === undefined ? e.kursSumber : kurs === null ? null : "manual",
      catatan: patch.catatan === undefined ? e.catatan : patch.catatan.trim(),
    };
  });
}

export function summarizeByYear(
  entries: readonly JurnalEntry[],
): JurnalYearSummary[] {
  const map = new Map<
    string,
    {
      profit: number;
      swap: number;
      commission: number;
      fee: number;
      deposit: number;
      withdrawal: number;
      idr: number;
      count: number;
      tanpaKurs: number;
    }
  >();
  for (const e of entries) {
    const year = e.serverTime.slice(0, 4);
    const y = map.get(year) ?? {
      profit: 0,
      swap: 0,
      commission: 0,
      fee: 0,
      deposit: 0,
      withdrawal: 0,
      idr: 0,
      count: 0,
      tanpaKurs: 0,
    };
    if (e.type === "BALANCE") {
      if (e.profit >= 0) y.deposit += e.profit;
      else y.withdrawal += -e.profit;
    } else if (isTradeDeal(e)) {
      y.profit += e.profit;
      y.swap += e.swap;
      y.commission += e.commission;
      y.fee += e.fee;
      y.count++;
      const net = dealNettoUsd(e);
      if (e.kursIdr !== null) y.idr += net * e.kursIdr;
      else if (net !== 0) y.tanpaKurs++;
    }
    map.set(year, y);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, y]) => ({
      year,
      profitUsd: r2(y.profit),
      swapUsd: r2(y.swap),
      commissionUsd: r2(y.commission),
      feeUsd: r2(y.fee),
      nettoUsd: r2(y.profit + y.swap + y.commission + y.fee),
      depositUsd: r2(y.deposit),
      withdrawalUsd: r2(y.withdrawal),
      nettoIdr: Math.round(y.idr),
      dealCount: y.count,
      tanpaKurs: y.tanpaKurs,
    }));
}

export interface KursRule {
  /** Tanggal mulai-akhir (YYYY-MM-DD, inklusif). Satu tanggal: from === to. */
  readonly from: string;
  readonly to: string;
  readonly kurs: number;
}

const DATE_RE = /(\d{4})[-./](\d{2})[-./](\d{2})|(\d{2})[-/](\d{2})[-/](\d{4})/g;

function parseKursNumber(raw: string): number | null {
  let s = raw.trim().replace(/[^0-9.,]/g, "");
  if (s === "") return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = parts.join("");
    } else {
      s = s.replace(sep, ".");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 1000 && n <= 100000 ? n : null;
}

/**
 * Tempel kurs pajak: satu aturan per baris. Contoh yang dikenali:
 *   2026-09-30 16650
 *   30/09/2026 s/d 06/10/2026 16.650,00
 *   2026-09-30 - 2026-10-06 16650
 * Baris tak dikenali dikembalikan di `rejected` (tidak ada tebakan).
 */
export function parseKursText(text: string): {
  rules: KursRule[];
  rejected: string[];
} {
  const rules: KursRule[] = [];
  const rejected: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (raw === "") continue;
    const dates: string[] = [];
    const rest = raw.replace(DATE_RE, (_m, y, mo, d, d2, mo2, y2) => {
      dates.push(y ? `${y}-${mo}-${d}` : `${y2}-${mo2}-${d2}`);
      return " ";
    });
    const kurs = parseKursNumber(rest.replace(/s\/d|sd|-|sampai/gi, " ").trim());
    const valid = dates.every((d) => !Number.isNaN(Date.parse(d)));
    if (dates.length < 1 || dates.length > 2 || kurs === null || !valid) {
      rejected.push(raw);
      continue;
    }
    const from = dates[0];
    const to = dates[1] ?? dates[0];
    if (from > to) {
      rejected.push(raw);
      continue;
    }
    rules.push({ from, to, kurs });
  }
  return { rules, rejected };
}

/**
 * Selisih jam server MT5 Finex terhadap UTC. Diukur 2026-10-07: Market Watch
 * 07:46 saat jam WIB 13:46 (UTC+1). Bisa ditimpa env MT5_SERVER_UTC_OFFSET_HOURS.
 */
export const DEFAULT_SERVER_UTC_OFFSET_HOURS = 1;
const WIB_UTC_OFFSET_HOURS = 7;

/** Tanggal WIB (YYYY-MM-DD) dari waktu server MT5 "YYYY.MM.DD HH:MM:SS". */
export function serverDateWib(
  serverTime: string,
  serverUtcOffsetHours: number = DEFAULT_SERVER_UTC_OFFSET_HOURS,
): string {
  const m = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    serverTime,
  );
  if (m === null) return serverTime.slice(0, 10).replace(/\./g, "-");
  const utcMs =
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) -
    serverUtcOffsetHours * 3_600_000;
  return new Date(utcMs + WIB_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

/** Terapkan aturan kurs (yang di bawah menimpa yang di atas); tanggal transaksi = tanggal WIB. */
export function applyKursRules(
  entries: readonly JurnalEntry[],
  rules: readonly KursRule[],
  serverUtcOffsetHours: number = DEFAULT_SERVER_UTC_OFFSET_HOURS,
): { entries: JurnalEntry[]; updated: number } {
  let updated = 0;
  const out = entries.map((e) => {
    const day = serverDateWib(e.serverTime, serverUtcOffsetHours);
    let hit: KursRule | null = null;
    for (const r of rules) {
      if (day >= r.from && day <= r.to) hit = r;
    }
    if (hit === null) return e;
    updated++;
    return { ...e, kursIdr: hit.kurs, kursSumber: "KMK" as const };
  });
  return { entries: out, updated };
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV jurnal untuk diunduh/dibuka di Excel (BOM UTF-8 + CRLF). */
export function entriesToCsv(entries: readonly JurnalEntry[]): string {
  const header = [
    "DealTicket",
    "Waktu",
    "Simbol",
    "Tipe",
    "Entry",
    "Lot",
    "Harga",
    "Profit USD",
    "Swap USD",
    "Komisi USD",
    "Fee USD",
    "Netto USD",
    "Kurs IDR",
    "Sumber Kurs",
    "Netto IDR",
    "Nominal IDR (setoran)",
    "Catatan",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const e of entries) {
    const net = isTradeDeal(e) ? r2(dealNettoUsd(e)) : null;
    lines.push(
      [
        e.dealTicket,
        e.serverTime,
        e.symbol,
        e.type,
        e.entry,
        e.volume,
        e.price,
        e.profit,
        e.swap,
        e.commission,
        e.fee,
        net,
        e.kursIdr,
        e.kursSumber,
        net !== null && e.kursIdr !== null ? Math.round(net * e.kursIdr) : null,
        e.idrAmount,
        e.catatan,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
