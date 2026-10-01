import { useEffect, useMemo, useState } from "react";
import {
  resolveSwingLevels,
  type SwingLevelSource,
} from "../../calculations/swingDetector";
import { parseCsvCandles } from "../../lib/csvCandleParser";
import { checkInstrumentMismatch } from "../../lib/instrumentMismatch";
import {
  formatInstrumentPrice,
  getInstrumentProfile,
} from "../../lib/instrumentConfig";

interface Props {
  symbol: string;
  currentPrice: number;
  csvText: string;
  onCsvTextChange: (text: string) => void;
  onDetected: (
    support: number,
    resistance: number,
    source: SwingLevelSource
  ) => void;
}

const SOURCE_LABELS: Record<Exclude<SwingLevelSource, "none">, string> = {
  "strength-1": "Swing strength 1",
  "strength-2": "Swing strength 2",
  "strength-3": "Swing strength 3",
  extreme: "Extreme fallback",
};

export default function SwingLevelsForm({
  symbol,
  currentPrice,
  csvText,
  onCsvTextChange,
  onDetected,
}: Props) {
  const [strength, setStrength] = useState(2);
  const [clearNotice, setClearNotice] = useState(false);

  // App.tsx adalah source of truth untuk csvText; tidak ada salinan lokal.
  const parsed = useMemo(() => parseCsvCandles(csvText), [csvText]);
  const candles = parsed.candles;

  const minimumCandles = strength * 2 + 1;

  const mismatch = useMemo(
    () => checkInstrumentMismatch(candles, symbol, currentPrice),
    [candles, symbol, currentPrice],
  );

  const resolved = useMemo(() => {
    if (candles.length < minimumCandles) {
      return null;
    }

    if (mismatch) return null;

    return resolveSwingLevels(candles, currentPrice, strength);
  }, [candles, currentPrice, strength, minimumCandles, mismatch]);

  // Pesan status diturunkan (derived) langsung dari data saat render,
  // bukan disimpan lalu disinkronkan lewat effect. Effect di bawah hanya
  // meneruskan level valid ke App dan tidak memanggil setState.
  const message = useMemo(() => {
    if (!csvText.trim()) {
      return clearNotice
        ? "Data candle dihapus. Support dan resistance perlu diisi ulang."
        : "Belum ada CSV. Tempel data candle atau hubungkan file CSV MT5.";
    }

    if (mismatch) return mismatch;

    if (candles.length < minimumCandles) {
      return `CSV terbaca, tetapi baru ${candles.length} candle valid. Minimal ${minimumCandles} candle diperlukan.`;
    }

    if (!resolved || resolved.source === "none") {
      const tried = resolved && resolved.triedStrengths.length > 0
        ? `strength ${resolved.triedStrengths.join(", ")}`
        : `strength ${strength}`;
      return (
        `${candles.length} candle valid, tetapi tidak ada swing ${tried} ` +
        "yang memenuhi syarat. Tambahkan candle atau periksa harga referensi."
      );
    }

    const { support, resistance } = resolved;

    if (support === null || resistance === null) {
      return "Support/Resistance belum lengkap. Swing belum lengkap \u2014 tambahkan candle sebelum dan sesudah swing, lalu periksa kembali level.";
    }

    const profile = getInstrumentProfile(symbol);

    return (
      `Support dan Resistance berhasil diperbarui dari CSV ${candles.length} candle ` +
      `(${SOURCE_LABELS[resolved.source]}) \u2014 Support: ${formatInstrumentPrice(
        support,
        symbol,
      )}, Resistance: ${formatInstrumentPrice(resistance, symbol)} (${
        profile.symbol
      })`
    );
  }, [
    csvText,
    clearNotice,
    mismatch,
    candles.length,
    minimumCandles,
    resolved,
    strength,
    symbol,
  ]);

  // Otomatis mengisi Support dan Resistance
  // setiap kali CSV, harga, atau strength berubah.
  useEffect(() => {
    if (mismatch) return;

    if (candles.length < minimumCandles) return;

    if (!resolved || resolved.source === "none") return;

    const { support, resistance } = resolved;

    if (support === null || resistance === null) return;

    if (import.meta.env.DEV) {
      console.debug("[MDBKA S/R BROWSER]", {
        symbol,
        candleCount: candles.length,
        requestedStrength: strength,
        resolvedStrength: resolved.source,
        source: resolved.source,
        support,
        resistance,
        callbackCalled: true,
      });
    }

    onDetected(support, resistance, resolved.source);
  }, [candles.length, resolved, minimumCandles, onDetected, mismatch, symbol, strength]);

  function clearCsv() {
    onCsvTextChange("");
    setClearNotice(true);
  }

  function handleTextareaChange(text: string) {
    setClearNotice(false);
    onCsvTextChange(text);
  }

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div>
        <h2 className="font-bold text-white">
          5. Support &amp; Resistance otomatis
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Tempel data candle untuk mengisi Support dan Resistance tanpa input
          manual. Level hanya dihitung dari candle valid.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Simbol aktif
          <input
            value={symbol}
            readOnly
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
          />
        </label>

        <label className="text-sm text-slate-300">
          Kekuatan swing
          <select
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
          >
            <option value={1}>1 candle kiri/kanan</option>
            <option value={2}>2 candle kiri/kanan</option>
            <option value={3}>3 candle kiri/kanan</option>
          </select>
        </label>
      </div>

      <textarea
        value={csvText}
        onChange={(event) => handleTextareaChange(event.target.value)}
        className="min-h-48 w-full rounded-xl border border-white/10 bg-slate-900 p-3 font-mono text-xs text-white outline-none"
        placeholder={`time,open,high,low,close
2026-10-01 01:00,30480,30540,30450,30520
2026-10-01 02:00,30520,30590,30490,30570
2026-10-01 03:00,30570,30614.76,30508.57,30515.32
2026-10-01 04:00,30515.32,30560,30480,30500
2026-10-01 05:00,30500,30540,30460,30520`}
      />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={clearCsv}
          className="rounded-xl border border-red-400/30 px-4 py-3 font-semibold text-red-200 hover:bg-red-400/10"
        >
          Clear CSV
        </button>

        <span className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300">
          {parsed.validRows} candle valid (minimal {minimumCandles}) dari{" "}
          {parsed.totalRows} baris
          {parsed.invalidRows > 0
            ? ` \u2014 ${parsed.invalidRows} baris invalid dilewati`
            : ""}
        </span>
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">
        {message}
      </div>
    </div>
  );
}
