import { useState } from "react";
import { ScanText, LoaderCircle } from "lucide-react";
import { createWorker } from "tesseract.js";
import type { MarketData } from "../../types/analysis";
import { parseOcrText } from "./ocrParser";

interface Props {
  image: string;
  market: MarketData;
  onExtracted: (data: Partial<MarketData>, rawText: string) => void;
}

export default function OcrExtractor({
  image,
  market,
  onExtracted
}: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function runOcr() {
    setLoading(true);
    setStatus("Menyiapkan OCR...");

    try {
      const worker = await createWorker("eng");

      setStatus("Membaca teks pada screenshot...");
      const result = await worker.recognize(image);

      await worker.terminate();

      const parsed = parseOcrText(result.data.text, market);
      onExtracted(parsed, result.data.text);
      setStatus("Ekstraksi selesai. Periksa dan koreksi data.");
    } catch (error) {
      console.error(error);
      setStatus(
        "OCR gagal. Isi data secara manual pada form koreksi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">
            Ekstraksi data screenshot
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            OCR membantu membaca teks, tetapi semua hasil wajib diperiksa.
          </p>
        </div>

        <button
          type="button"
          onClick={runOcr}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : (
            <ScanText size={18} />
          )}
          {loading ? "Membaca..." : "Ekstrak Data"}
        </button>
      </div>

      {status && (
        <p className="mt-4 rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-sky-200">
          {status}
        </p>
      )}
    </div>
  );
}
