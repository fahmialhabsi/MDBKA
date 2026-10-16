import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseSpreadsFromMargin } from "../../src/lib/backtestCli";
import { canonicalSymbolForBroker } from "../../src/lib/brokerSymbols";
import type { Recommendation } from "../../src/lib/branchOffice";
import {
  formulirKc2,
  KATALOG_FUNGSI,
  periksaMasalah,
  ringkas,
  scanCandles,
  TIMEFRAMES,
  type FileData,
  type Masalah,
  type RingkasanTf,
  type Timeframe,
} from "../../src/lib/kc2Bridge";
import { riskGroupOf } from "../../src/lib/riskGroup";
import type { BrokerId } from "../../src/types/broker";
import { readLatestHasil, saveHasil, saveRecommendation } from "./branchStore";
import { readFaktaBroker } from "./kc1Runner";

/**
 * KC-2 (16 Okt 2026) — penjalan Jembatan MT5. Membaca map PILIHAN_BROKER (KC-1), memindai file
 * Common Files broker itu, menulis map DAFTAR_DATA + KATALOG_FUNGSI, dan Formulir R bila ada masalah.
 * HANYA MEMBACA file MT5; tidak mengubah EA/skrip/.env; tidak mengirim order.
 */
export interface Kc2Run {
  readonly broker: string;
  readonly ringkasan: readonly RingkasanTf[];
  readonly masalah: readonly Masalah[];
  readonly rec: Recommendation | null;
}

export class Kc2Error extends Error {}

const ageHours = (file: string, now: Date): number | null => (existsSync(file) ? (now.getTime() - statSync(file).mtimeMs) / 3_600_000 : null);

export function runKc2(opts: { readonly dataDir: string; readonly commonDir: string; readonly faktaFile: string; readonly now: Date }): Kc2Run {
  const pilihan = readLatestHasil(opts.dataDir, "KC-1", "PILIHAN_BROKER");
  const data = pilihan?.data as { broker?: unknown } | null | undefined;
  const brokerId = typeof data?.broker === "string" ? data.broker : null;
  if (brokerId === null) throw new Kc2Error("Belum ada broker terpilih dari KC-1 (map PILIHAN_BROKER disetujui Pusat).");
  const fakta = readFaktaBroker(opts.faktaFile).find((f) => f.id === brokerId);
  if (fakta === undefined) throw new Kc2Error(`Broker ${brokerId} tidak ada di config/kc1-fakta-broker.json`);
  const id = fakta.id as BrokerId;
  const marginFile = join(opts.commonDir, `MDBKA_Margin_${fakta.margin}.csv`);
  const symbols = existsSync(marginFile) ? [...parseSpreadsFromMargin(readFileSync(marginFile, "utf8")).keys()] : [];
  const mine = new Set(symbols);
  const golongan = (s: string): string => riskGroupOf(canonicalSymbolForBroker(s, id) || s).id;

  const files: FileData[] = [];
  let autoNewest: number | null = null;
  for (const name of readdirSync(opts.commonDir)) {
    const long = /^MDBKA_(.+)_(H4|H1|M15|M5|M1)_LONG\.csv$/.exec(name);
    if (long !== null && mine.has(long[1] as string)) {
      files.push(scanCandles(readFileSync(join(opts.commonDir, name), "utf8"), long[1] as string, golongan(long[1] as string), long[2] as Timeframe));
      continue;
    }
    const auto = /^MDBKA_(.+)_H1\.csv$/.exec(name);
    if (auto !== null && mine.has(auto[1] as string)) {
      const h = ageHours(join(opts.commonDir, name), opts.now);
      if (h !== null) autoNewest = autoNewest === null ? h : Math.min(autoNewest, h);
    }
  }
  files.sort((a, b) => a.simbol.localeCompare(b.simbol) || TIMEFRAMES.indexOf(a.timeframe) - TIMEFRAMES.indexOf(b.timeframe));
  const marginH = ageHours(marginFile, opts.now);
  const demoLogin = fakta.akunDemo[0]?.login;
  const specsH = demoLogin === undefined ? null : ageHours(join(opts.commonDir, `MDBKA_Specs_${demoLogin}.csv`), opts.now);
  const day = opts.now.getUTCDay();
  const kes = {
    broker: brokerId,
    brokerNama: fakta.nama,
    marginUmurHari: marginH === null ? null : marginH / 24,
    specsDemoUmurHari: specsH === null ? null : specsH / 24,
    candleOtomatisUmurJam: autoNewest,
    akhirPekan: day === 0 || day === 6,
  };
  const masalah = periksaMasalah(files, kes);
  const ringkasan = ringkas(files);
  const tanggal = opts.now.toISOString().slice(0, 10);
  saveHasil(opts.dataDir, "KC-2", "DAFTAR_DATA", { broker: brokerId, kesehatan: kes, ringkasan, masalah, files }, opts.now);
  saveHasil(opts.dataDir, "KC-2", "KATALOG_FUNGSI", { fungsi: KATALOG_FUNGSI }, opts.now);
  const form = formulirKc2(kes, masalah, ringkasan, tanggal);
  const rec = form === null ? null : saveRecommendation(opts.dataDir, "KC-2", form, opts.now);
  return { broker: brokerId, ringkasan, masalah, rec };
}
