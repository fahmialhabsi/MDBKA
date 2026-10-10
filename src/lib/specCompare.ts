import { getInstrumentSpec32, type InstrumentSpec } from "./instrumentSpecs32";

/**
 * V2a (10 Okt 2026) — pembanding spesifikasi MT5 live vs spec32 (MURNI).
 *
 * Sumber live: Common\Files\MDBKA_Specs_<login>.csv dari MDBKACalendarService
 * (Symbol,ContractSize,TickSize,TickValue,Digits,VolumeMin,VolumeStep,SwapMode,
 * SwapLong,SwapShort,ProfitCurrency,MarginCurrency,Company,Generated).
 * Aturan (disetujui Fahmi 10 Okt):
 * - TAHAN  : contract size, tick size, atau mata uang profit beda → hitungan
 *            risiko Rupiah bisa meleset, sinyal simbol itu wajib ditahan;
 * - CATATAN: swap beli/jual beda (broker biasa mengubah swap mingguan) atau
 *            simbol belum ada di spec32 (golongan risiko sudah menahannya).
 * TickValue TIDAK dibandingkan (MT5 menghitung ulang ikut kurs; saham OTB = 1).
 */
export interface LiveSpec {
  readonly symbol: string;
  readonly contractSize: number;
  readonly tickSize: number;
  readonly digits: number;
  readonly volumeMin: number;
  readonly volumeStep: number;
  readonly swapMode: number;
  readonly swapLong: number;
  readonly swapShort: number;
  readonly profitCurrency: string;
}

export interface LiveSpecFile {
  readonly company: string;
  readonly generated: string;
  readonly specs: readonly LiveSpec[];
}

/** Parse CSV spesifikasi (baris rusak dilewati). */
export function parseSpecsCsv(csv: string): LiveSpecFile {
  const specs: LiveSpec[] = [];
  let company = "";
  let generated = "";
  for (const line of csv.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1)) {
    const c = line.split(",");
    if (c.length < 14) continue;
    const num = (i: number): number => Number(c[i]);
    const spec: LiveSpec = {
      symbol: c[0].trim(),
      contractSize: num(1),
      tickSize: num(2),
      digits: num(4),
      volumeMin: num(5),
      volumeStep: num(6),
      swapMode: num(7),
      swapLong: num(8),
      swapShort: num(9),
      profitCurrency: c[10].trim().toUpperCase(),
    };
    if (spec.symbol === "" || !(spec.contractSize > 0) || !(spec.tickSize > 0)) continue;
    if (![spec.swapLong, spec.swapShort].every(Number.isFinite)) continue;
    specs.push(spec);
    if (company === "") company = c[12].trim();
    if (generated === "") generated = c[13].trim();
  }
  return { company, generated, specs };
}

export type SpecDiffLevel = "TAHAN" | "CATATAN";

export interface SpecDiff {
  readonly symbol: string;
  readonly field: "contract" | "tickSize" | "profitCurrency" | "swapLong" | "swapShort" | "spec32";
  readonly level: SpecDiffLevel;
  readonly live: string;
  readonly spec32: string;
  readonly reason: string;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Bandingkan satu simbol; [] = cocok. */
export function compareSpec(
  live: LiveSpec,
  lookup: (symbol: string) => InstrumentSpec | null = getInstrumentSpec32,
): SpecDiff[] {
  const ref = lookup(live.symbol);
  if (ref === null) {
    return [{ symbol: live.symbol, field: "spec32", level: "CATATAN", live: "ada di MT5", spec32: "-", reason: `${live.symbol} belum ada di spec32` }];
  }
  const out: SpecDiff[] = [];
  const add = (field: SpecDiff["field"], level: SpecDiffLevel, a: string, b: string, label: string): void => {
    out.push({ symbol: live.symbol, field, level, live: a, spec32: b, reason: `${label} ${live.symbol} berubah: MT5 ${a}, MDBKA ${b}` });
  };
  if (!same(live.contractSize, ref.leverage)) add("contract", "TAHAN", String(live.contractSize), String(ref.leverage), "Contract size");
  if (!same(live.tickSize, ref.tickSize)) add("tickSize", "TAHAN", String(live.tickSize), String(ref.tickSize), "Tick size");
  if (live.profitCurrency !== ref.quoteCurrency.toUpperCase()) {
    add("profitCurrency", "TAHAN", live.profitCurrency, ref.quoteCurrency, "Mata uang profit");
  }
  if (!same(live.swapLong, ref.swapLong)) add("swapLong", "CATATAN", String(live.swapLong), String(ref.swapLong), "Swap beli");
  if (!same(live.swapShort, ref.swapShort)) add("swapShort", "CATATAN", String(live.swapShort), String(ref.swapShort), "Swap jual");
  return out;
}

/** Semua simbol file → daftar beda (urut: TAHAN dulu). */
export function compareSpecs(
  file: LiveSpecFile,
  lookup: (symbol: string) => InstrumentSpec | null = getInstrumentSpec32,
): SpecDiff[] {
  const all = file.specs.flatMap((s) => compareSpec(s, lookup));
  return [...all.filter((d) => d.level === "TAHAN"), ...all.filter((d) => d.level === "CATATAN")];
}

/** Simbol yang wajib ditahan (beda contract/tick/mata uang profit). */
export function heldSymbols(diffs: readonly SpecDiff[]): ReadonlySet<string> {
  return new Set(diffs.filter((d) => d.level === "TAHAN").map((d) => d.symbol));
}
