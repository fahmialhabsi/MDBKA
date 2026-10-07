/**
 * Item (e) — parser CSV margin dari script ea/ExportMarginMDBKA.mq5.
 * Format: Symbol,Ask,Bid,Margin_Buy_1Lot,Margin_Sell_1Lot,
 *         Account_Leverage,Account_Currency,Exported
 * Nilai -1/0/invalid → null (OrderCalcMargin gagal; tanpa tebakan).
 */
export interface MarginEntry {
  readonly symbol: string;
  readonly marginBuy: number | null;
  readonly marginSell: number | null;
  readonly leverage: number | null;
  readonly exported: string;
}

function toPositive(raw: string | undefined): number | null {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseMarginCsv(text: string): Map<string, MarginEntry> {
  const out = new Map<string, MarginEntry>();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 8) continue;
    const symbol = cols[0].trim();
    if (symbol === "") continue;
    out.set(symbol, {
      symbol,
      marginBuy: toPositive(cols[3]),
      marginSell: toPositive(cols[4]),
      leverage: toPositive(cols[5]),
      exported: cols[7].trim(),
    });
  }
  return out;
}

/** Nama tag file per broker; null = broker tak dikenal (400). */
export function marginFileTag(broker: unknown): "Finex" | "OTB" | null {
  if (broker === "finex") return "Finex";
  if (broker === "orbitraderberjangka" || broker === "otb") return "OTB";
  return null;
}
