/**
 * #504 — parser CSV History dari ea/ExportHistoryMDBKA.mq5 (18 kolom).
 * Satu baris = satu deal MT5. dealTicket unik -> dasar impor anti-duplikat
 * untuk jurnal pajak. Waktu = waktu server broker (Finex GMT+3).
 * Setoran/penarikan = type BALANCE (profit > 0 setoran, < 0 penarikan);
 * komentar setoran Finex memuat nominal Rupiah asli ("... IDR 200000.00").
 */
export interface HistoryDeal {
  readonly dealTicket: string;
  readonly positionId: string;
  readonly orderTicket: string;
  readonly serverTime: string;
  readonly symbol: string;
  readonly type: string;
  readonly entry: string;
  readonly volume: number;
  readonly price: number;
  readonly commission: number;
  readonly swap: number;
  readonly profit: number;
  readonly fee: number;
  readonly comment: string;
  readonly login: string;
  readonly accountCurrency: string;
  /** Nominal IDR dari komentar setoran/penarikan; null bila tidak ada. */
  readonly idrAmount: number | null;
  /** H4: S/L & T/P deal (kolom 19-20, sejak 9 Okt); null bila 0/kosong/CSV lama. */
  readonly sl: number | null;
  readonly tp: number | null;
}

const COLUMNS = 18;

function num(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Level S/L/T/P: 0, kosong, atau kolom tidak ada (CSV 18 kolom) → null. */
function level(raw: string | undefined): number | null {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractIdrAmount(comment: string): number | null {
  const m = /IDR\s+([0-9]+(?:\.[0-9]+)?)/i.exec(comment);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseHistoryCsv(text: string): HistoryDeal[] {
  const deals: HistoryDeal[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < COLUMNS) continue;
    const t = (k: number): string => (c[k] ?? "").trim();
    if (t(0) === "") continue;
    const type = t(5);
    const comment = t(14);
    deals.push({
      dealTicket: t(0),
      positionId: t(1),
      orderTicket: t(2),
      serverTime: t(3),
      symbol: t(4),
      type,
      entry: t(6),
      volume: num(c[7]),
      price: num(c[8]),
      commission: num(c[9]),
      swap: num(c[10]),
      profit: num(c[11]),
      fee: num(c[12]),
      comment,
      login: t(15),
      accountCurrency: t(17),
      idrAmount: type === "BALANCE" ? extractIdrAmount(comment) : null,
      sl: level(c[18]),
      tp: level(c[19]),
    });
  }
  return deals;
}
