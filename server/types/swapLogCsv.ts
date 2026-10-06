/**
 * #501 — parser CSV log swap dari ea/MDBKASwapLogger.mq5 (APPEND, 28 kolom).
 * Baris "<reason>_NO_POSITIONS" tetap dibaca (ticket = null) agar
 * jejak jam demi jam utuh walau tanpa posisi.
 */
export interface SwapLogRow {
  readonly serverTime: string;
  readonly gmtTime: string;
  readonly localTime: string;
  readonly reason: string;
  readonly login: string;
  readonly balance: number | null;
  readonly equity: number | null;
  readonly ticket: string | null;
  readonly symbol: string;
  readonly type: string;
  readonly volume: number | null;
  readonly priceOpen: number | null;
  readonly priceCurrent: number | null;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly swap: number | null;
  readonly profit: number | null;
  readonly swapMode: string;
  readonly swapLong: number | null;
  readonly swapShort: number | null;
  readonly swap3Day: string;
  readonly contractSize: number | null;
  readonly calcMode: string;
  readonly baseCurrency: string;
  readonly profitCurrency: string;
  readonly timeOpen: string;
}

const COLUMNS = 28;

function num(raw: string | undefined): number | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseSwapLogCsv(text: string): SwapLogRow[] {
  const rows: SwapLogRow[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < COLUMNS) continue;
    const t = (k: number): string => (c[k] ?? "").trim();
    if (t(0) === "") continue;
    rows.push({
      serverTime: t(0),
      gmtTime: t(1),
      localTime: t(2),
      reason: t(3),
      login: t(4),
      balance: num(c[7]),
      equity: num(c[8]),
      ticket: t(9) === "" ? null : t(9),
      symbol: t(10),
      type: t(11),
      volume: num(c[12]),
      priceOpen: num(c[13]),
      priceCurrent: num(c[14]),
      bid: num(c[15]),
      ask: num(c[16]),
      swap: num(c[17]),
      profit: num(c[18]),
      swapMode: t(19),
      swapLong: num(c[20]),
      swapShort: num(c[21]),
      swap3Day: t(22),
      contractSize: num(c[23]),
      calcMode: t(24),
      baseCurrency: t(25),
      profitCurrency: t(26),
      timeOpen: t(27),
    });
  }
  return rows;
}

/** Login MT5 per broker (env SWAPLOG_LOGIN_FINEX/OTB menimpa default). */
export function swapLogLogin(broker: unknown): string | null {
  const env = (key: string): string => (process.env?.[key] ?? "").trim();
  if (broker === "finex") return env("SWAPLOG_LOGIN_FINEX") || "91811209";
  if (broker === "orbitraderberjangka" || broker === "otb") {
    return env("SWAPLOG_LOGIN_OTB") || "70930952";
  }
  return null;
}
