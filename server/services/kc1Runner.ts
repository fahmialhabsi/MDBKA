import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseSpreadsFromMargin } from "../../src/lib/backtestCli";
import type { BrokerSettings } from "../../src/types/analysis";
import type { BrokerId } from "../../src/types/broker";
import { canonicalSymbolForBroker } from "../../src/lib/brokerSymbols";
import { kepalaCabang, type BrokerBahan, type FaktaNilai, type HasilKepala } from "../../src/lib/kc1Assessment";
import { applyBrokerPreset } from "../../src/lib/marketReset";
import { riskGroupOf } from "../../src/lib/riskGroup";
import { parseSpecsCsv, type LiveSpec } from "../../src/lib/specCompare";
import { withUsdPointValue } from "../../src/lib/usdPointValue";
import type { ExchangeRates } from "../../src/services/fxRateService";
import { saveHasil, saveRecommendation } from "./branchStore";
import type { Recommendation } from "../../src/lib/branchOffice";

/**
 * KC-1 (16 Okt 2026) — penjalan penilaian broker. HANYA MEMBACA Common Files dan
 * config/kc1-fakta-broker.json; menulis Kartu Broker + Formulir R ke data/cabang/KC-1/.
 * Tidak mengubah aplikasi, preset, atau akun; tidak mengirim order.
 */
interface FaktaBroker {
  readonly id: BrokerId;
  readonly nama: string;
  readonly margin: string;
  readonly akunDemo: readonly { login: string; sumber: string }[];
  readonly akunLive: readonly { login: string; sumber: string }[];
  readonly legal: FaktaNilai<boolean>;
  readonly setoranMinUsd: FaktaNilai<number>;
}

const BROKER_IDS: readonly BrokerId[] = ["finex", "orbitraderberjangka", "mifx", "exness"];

export function readFaktaBroker(file: string): FaktaBroker[] {
  const j = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as { broker?: unknown };
  if (!Array.isArray(j.broker)) throw new Error("kc1-fakta-broker.json: daftar broker tidak ada");
  return j.broker.filter((b): b is FaktaBroker => {
    const r = b as Partial<FaktaBroker>;
    return typeof r.id === "string" && BROKER_IDS.includes(r.id) && typeof r.nama === "string" && typeof r.margin === "string" && Array.isArray(r.akunDemo) && Array.isArray(r.akunLive);
  });
}

const ZERO: BrokerSettings = {
  equity: 758, riskPercent: 0, minLot: 0, lotStep: 0, pointValue: 0,
  contractSize: 0, commission: 0, slippage: 0, buffer: 0, atrMultiplier: 0, targetRR: 0,
};

const TIME = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})/;
function timeMs(line: string): number | null {
  const m = TIME.exec(line.trim());
  return m === null ? null : Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** Waktu candle pertama dan terakhir tanpa membaca seluruh file (file M1 bisa puluhan MB). */
export function fileSpanDays(file: string): number | null {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const head = Buffer.alloc(Math.min(512, size));
    readSync(fd, head, 0, head.length, 0);
    const tailLen = Math.min(1024, size);
    const tail = Buffer.alloc(tailLen);
    readSync(fd, tail, 0, tailLen, size - tailLen);
    const first = timeMs(head.toString("utf8").split(/\r?\n/)[1] ?? "");
    const lastLines = tail.toString("utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
    const last = timeMs(lastLines[lastLines.length - 1] ?? "");
    return first === null || last === null || last < first ? null : (last - first) / 86_400_000;
  } finally {
    closeSync(fd);
  }
}

function readSpecs(commonDir: string, login: string | undefined): { specs: readonly LiveSpec[]; sumber: string } | null {
  if (login === undefined) return null;
  const f = join(commonDir, `MDBKA_Specs_${login}.csv`);
  if (!existsSync(f)) return null;
  const parsed = parseSpecsCsv(readFileSync(f, "utf8"));
  return parsed.specs.length === 0 ? null : { specs: parsed.specs, sumber: `MDBKA_Specs_${login}.csv (${parsed.generated || "tanpa tanggal"})` };
}

export function collectBahan(commonDir: string, fakta: readonly FaktaBroker[], rates: ExchangeRates, usdIdr: number): BrokerBahan[] {
  const longFiles = readdirSync(commonDir)
    .map((name) => /^MDBKA_(.+)_(H4|H1|M15|M5|M1)_LONG\.csv$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null);
  return fakta.map((f) => {
    // Nama yang tidak dikenal buku simbol broker (mis. Exness "EURUSDm") → nama asli.
    const canon = (s: string): string => canonicalSymbolForBroker(s, f.id) || s;
    const golonganOf = (s: string): string => riskGroupOf(canon(s)).id;
    const marginFile = join(commonDir, `MDBKA_Margin_${f.margin}.csv`);
    const spreads = existsSync(marginFile) ? parseSpreadsFromMargin(readFileSync(marginFile, "utf8")) : new Map<string, number>();
    const marginStamp = existsSync(marginFile) ? (readFileSync(marginFile, "utf8").split(/\r?\n/)[1]?.split(",").pop() ?? "") : "";
    const specsDemo = readSpecs(commonDir, f.akunDemo[0]?.login);
    const specsLive = readSpecs(commonDir, f.akunLive[0]?.login);
    const lotOf = new Map((specsDemo?.specs ?? []).map((s) => [s.symbol, s.volumeMin]));
    const biayaRp: { symbol: string; golongan: string; rp: number }[] = [];
    let tanpaBiaya = 0;
    for (const [symbol, spread] of spreads) {
      const canonical = canon(symbol);
      const b = withUsdPointValue(applyBrokerPreset({ ...ZERO }, canonical, f.id), canonical, f.id, rates);
      const lot = lotOf.get(symbol) ?? b.minLot;
      if (!(b.pointValue > 0) || !(lot > 0)) {
        tanpaBiaya += 1;
        continue;
      }
      biayaRp.push({ symbol, golongan: golonganOf(symbol), rp: (spread * b.pointValue + b.commission) * lot * usdIdr });
    }
    const span = new Map<string, number>();
    for (const m of longFiles) {
      const symbol = m[1] as string;
      if (!spreads.has(symbol)) continue;
      const d = fileSpanDays(join(commonDir, m[0]));
      if (d !== null) span.set(symbol, Math.max(span.get(symbol) ?? 0, d));
    }
    const setoran = f.setoranMinUsd.nilai;
    return {
      id: f.id,
      nama: f.nama,
      akunDemoAda: { nilai: f.akunDemo.length > 0, sumber: f.akunDemo.map((a) => a.sumber).join("; ") || "tidak ada akun demo tercatat" },
      akunLiveAda: f.akunLive.length > 0 ? { nilai: true, sumber: f.akunLive.map((a) => a.sumber).join("; ") } : { nilai: null, sumber: "belum ada akun live tercatat" },
      legal: f.legal,
      setoranMinRp: { nilai: setoran === null ? null : Math.round(setoran * usdIdr), sumber: f.setoranMinUsd.sumber },
      specsDemo,
      specsLive,
      biayaRp,
      biayaSumber: `MDBKA_Margin_${f.margin}.csv (${marginStamp || "…"}) + preset komisi MDBKA, kurs Rp${Math.round(usdIdr).toLocaleString("id-ID")}/USD${tanpaBiaya > 0 ? `; ${tanpaBiaya} simbol belum dikenal MDBKA (nilai poin "…") tidak ikut dihitung` : ""}`,
      sejarah: [...span.entries()].map(([symbol, hari]) => ({ symbol, golongan: golonganOf(symbol), hari })),
      golonganOf,
    };
  });
}

export interface Kc1Run {
  readonly hasil: HasilKepala;
  readonly rec: Recommendation;
  readonly kartuFile: string;
}

export function runKc1(opts: {
  readonly dataDir: string;
  readonly commonDir: string;
  readonly faktaFile: string;
  readonly rates: ExchangeRates;
  readonly usdIdr: number;
  readonly now: Date;
}): Kc1Run {
  const bahan = collectBahan(opts.commonDir, readFaktaBroker(opts.faktaFile), opts.rates, opts.usdIdr);
  const tanggal = opts.now.toISOString().slice(0, 10);
  const hasil = kepalaCabang(bahan, tanggal);
  const kartuFile = saveHasil(opts.dataDir, "KC-1", "KARTU_BROKER", hasil.kartu, opts.now);
  const terpilih = hasil.kartu.find((k) => k.broker === hasil.terpilih);
  const rec = saveRecommendation(opts.dataDir, "KC-1", {
    ...hasil.formulir,
    lampiran: {
      kind: "PILIHAN_BROKER",
      data: { broker: hasil.terpilih, alasan: terpilih === undefined ? "belum ada broker yang lolos syarat wajib" : `nilai ${terpilih.total}, paling dekat prinsip MDBKA` },
    },
  }, opts.now);
  return { hasil, rec, kartuFile };
}
