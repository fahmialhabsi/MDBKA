import { useEffect, useRef, useState } from "react";
import { ScanText, LoaderCircle } from "lucide-react";
import { createWorker } from "tesseract.js";
import type { MarketData } from "../../types/analysis";
import { normalizeSymbol } from "../../lib/instrumentConfig";
import {
  parseOcrTextRich,
  combineRegionTexts,
  type OcrMarketResult,
} from "./ocrParser";
import {
  REGION_MIN_SIZE,
  canvasPointFromClient,
  convertToNaturalCoords,
  isRegionBigEnough,
  normalizeRegion,
  regionColor,
  regionLabel,
  type ImageRegion,
  type Point,
  type RegionKind,
} from "../../lib/regionSelection";
import {
  isDebugTraceEnabled,
  traceOcrStage,
  truncateText,
} from "../../lib/debugTrace";

interface Props {
  image: string;
  market: MarketData;
  swingSource: string | null;
  onExtracted: (data: Partial<MarketData>, rawText: string) => void;
}

type ActiveRegion = RegionKind | null;

export default function OcrExtractor({
  image,
  market,
  swingSource,
  onExtracted
}: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [meta, setMeta] = useState<OcrMarketResult | null>(null);
  const [ocrSource, setOcrSource] = useState<"full-image" | "region">("full-image");
  const [mwText, setMwText] = useState<string | null>(null);
  const [dwText, setDwText] = useState<string | null>(null);
  const [regionBusy, setRegionBusy] = useState<null | "mw" | "dw">(null);

  const [activeRegion, setActiveRegion] = useState<ActiveRegion>(null);
  const [marketWatchRegion, setMarketWatchRegion] = useState<ImageRegion | null>(null);
  const [dataWindowRegion, setDataWindowRegion] = useState<ImageRegion | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<Point | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Region tidak berlaku untuk gambar lain: komponen di-remount per
  // screenshot melalui key={image} di App, sehingga semua state region
  // selalu segar tanpa effect reset.

  function syncCanvasSize() {
    const canvas = selectionCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  function drawOverlay() {
    const canvas = selectionCanvasRef.current;
    if (!canvas || canvas.width < 1) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const drawBox = (
      region: ImageRegion,
      color: string,
      label: string,
      dashed: boolean
    ) => {
      context.save();
      context.strokeStyle = color;
      context.lineWidth = 2;
      if (dashed) context.setLineDash([6, 4]);
      context.strokeRect(region.x, region.y, region.width, region.height);
      context.setLineDash([]);
      context.font = "12px sans-serif";
      const textWidth = context.measureText(label).width;
      const labelX = Math.min(Math.max(region.x, 0), Math.max(width - textWidth - 12, 0));
      const labelY = Math.max(region.y - 20, 0);
      context.fillStyle = color;
      context.fillRect(labelX, labelY, textWidth + 12, 18);
      context.fillStyle = "#020617";
      context.fillText(label, labelX + 6, labelY + 13);
      context.restore();
    };

    if (marketWatchRegion) {
      drawBox(marketWatchRegion, regionColor("marketWatch"), regionLabel("marketWatch"), false);
    }
    if (dataWindowRegion) {
      drawBox(dataWindowRegion, regionColor("dataWindow"), regionLabel("dataWindow"), false);
    }
    if (isSelecting && selectionStart && selectionCurrent && activeRegion) {
      drawBox(
        normalizeRegion(selectionStart, selectionCurrent),
        regionColor(activeRegion),
        regionLabel(activeRegion),
        true
      );
    }
  }

  // Sinkron ukuran + gambar ulang setiap render; ResizeObserver mengejar resize browser.
  useEffect(() => {
    syncCanvasSize();
    drawOverlay();

    const container = previewContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      drawOverlay();
    });
    observer.observe(container);
    return () => observer.disconnect();
  });

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return canvasPointFromClient(event.clientX, event.clientY, rect);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeRegion) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    setIsSelecting(true);
    setSelectionStart(point);
    setSelectionCurrent(point);
    setSelectionError("");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Abaikan: pointer sudah dilepas browser.
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isSelecting || !selectionStart) return;
    event.preventDefault();
    setSelectionCurrent(getCanvasPoint(event));
  }

  function finishSelection(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isSelecting || !selectionStart) return;
    const point = getCanvasPoint(event);
    const region = normalizeRegion(selectionStart, point);
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionCurrent(null);

    if (!isRegionBigEnough(region, REGION_MIN_SIZE)) {
      setSelectionError("Kotak terlalu kecil. Seret area yang lebih besar.");
      return;
    }

    const kind: RegionKind = activeRegion === "marketWatch" ? "marketWatch" : "dataWindow";

    if (import.meta.env.DEV) {
      const img = imageRef.current;
      console.debug("[MDBKA REGION]", {
        activeRegion: kind,
        region,
        imageDisplaySize: img
          ? { width: img.clientWidth, height: img.clientHeight }
          : null,
        imageNaturalSize: img
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      });
    }

    if (kind === "marketWatch") {
      setMarketWatchRegion(region);
      setStatus("Market Watch: siap — seret region Data Window.");
    } else {
      setDataWindowRegion(region);
      setStatus("Data Window: siap — klik Ekstrak dari Region.");
    }
    setActiveRegion(null);
    void runRegionOcrFor(kind, region);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    try {
      finishSelection(event);
    } finally {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Abaikan: pointer sudah dilepas browser.
      }
    }
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLCanvasElement>) {
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionCurrent(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Abaikan: pointer sudah dilepas browser.
    }
  }

  function cropRegion(region: ImageRegion): string | null {
    const img = imageRef.current;
    if (!img || !img.naturalWidth) return null;
    const rect = img.getBoundingClientRect();
    const natural = convertToNaturalCoords(
      region,
      { width: rect.width, height: rect.height },
      { width: img.naturalWidth, height: img.naturalHeight }
    );
    if (natural.width < 1 || natural.height < 1) return null;
    const crop = document.createElement("canvas");
    crop.width = natural.width;
    crop.height = natural.height;
    const context = crop.getContext("2d");
    if (!context) return null;
    context.drawImage(
      img,
      natural.x,
      natural.y,
      natural.width,
      natural.height,
      0,
      0,
      natural.width,
      natural.height
    );
    return crop.toDataURL("image/png");
  }

  async function recognizeDataUrl(dataUrl: string): Promise<string> {
    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(dataUrl);
      return result.data.text;
    } finally {
      await worker.terminate();
    }
  }

  function finishExtraction(
    parsed: OcrMarketResult,
    rawText: string,
    source: "full-image" | "region"
  ) {
    traceOcrStage("ocr-extracted", {
      activeSymbol: normalizeSymbol(market.symbol),
      ocrSource: source,
      detectedSymbols: parsed.debug.detectedSymbols,
      rawText: truncateText(rawText),
      marketWatchCandidateLines: parsed.debug.marketWatchCandidateLines,
      chosenMarketWatchLine: parsed.debug.chosenMarketWatchLine,
      ocrData: parsed.data,
      warnings: parsed.warnings,
      missingFields: parsed.missingFields,
      rejectedFields: parsed.debug.rejectedFields,
    });

    onExtracted(parsed.data, rawText);
    setMeta(parsed);
    setOcrSource(source);
    setStatus("Ekstraksi selesai. Periksa dan koreksi data.");
  }

  async function runOcr() {
    setLoading(true);
    setStatus("Menyiapkan OCR...");
    setMeta(null);

    try {
      const worker = await createWorker("eng");

      setStatus("Membaca teks pada screenshot...");
      const result = await worker.recognize(image);

      await worker.terminate();

      // Simbol aktif SELALU dari form (props/state saat tombol diklik),
      // tidak pernah dari simbol pertama hasil OCR.
      const activeSymbol = normalizeSymbol(market.symbol);

      if (import.meta.env.DEV) {
        console.debug("[MDBKA BROWSER OCR INPUT]", {
          activeSymbol,
          marketSymbol: market.symbol,
          rawTextPreview: result.data.text.slice(0, 3000),
        });
      }

      const parsed = parseOcrTextRich(result.data.text, {
        activeSymbol,
      });

      if (import.meta.env.DEV) {
        console.debug("[MDBKA OCR PIPELINE]", parsed.debug);
      }

      finishExtraction(parsed, result.data.text, "full-image");
    } catch (error) {
      console.error(error);
      setStatus(
        "OCR gagal. Isi data secara manual pada form koreksi."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runRegionOcrFor(kind: RegionKind, region: ImageRegion) {
    const cropped = cropRegion(region);
    if (!cropped) {
      setStatus("Crop region gagal. Coba seleksi ulang.");
      return;
    }

    setRegionBusy(kind === "marketWatch" ? "mw" : "dw");
    setStatus(
      kind === "marketWatch"
        ? "Membaca area Market Watch..."
        : "Membaca area Data Window..."
    );

    try {
      const text = await recognizeDataUrl(cropped);

      traceOcrStage("ocr-region", {
        kind,
        region,
        textPreview: truncateText(text, 300),
      });

      if (kind === "marketWatch") {
        setMwText(text);
      } else {
        setDwText(text);
      }
    } catch (error) {
      console.error(error);
      setStatus("OCR region gagal. Coba seleksi lain atau gunakan OCR penuh.");
    } finally {
      setRegionBusy(null);
    }
  }

  async function ensureRegionText(
    kind: RegionKind,
    region: ImageRegion
  ): Promise<string | null> {
    const existing = kind === "marketWatch" ? mwText : dwText;
    if (existing) return existing;
    const cropped = cropRegion(region);
    if (!cropped) return null;
    try {
      const text = await recognizeDataUrl(cropped);
      if (kind === "marketWatch") {
        setMwText(text);
      } else {
        setDwText(text);
      }
      return text;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function runRegionExtract() {
    if (!marketWatchRegion || !dataWindowRegion) {
      setStatus("Pilih kedua region sebelum mengekstrak.");
      return;
    }

    if (import.meta.env.DEV) {
      console.debug("[MDBKA REGION OCR INPUT]", {
        marketWatchRegion,
        dataWindowRegion,
        sourceRegions: ["marketWatch", "dataWindow"],
      });
    }

    setLoading(true);
    setStatus("Membaca region yang belum ada teksnya...");

    try {
      const [mw, dw] = await Promise.all([
        ensureRegionText("marketWatch", marketWatchRegion),
        ensureRegionText("dataWindow", dataWindowRegion),
      ]);

      const combined = combineRegionTexts(mw ?? "", dw ?? "");
      if (!combined) {
        setStatus("OCR region kosong. Coba seleksi ulang.");
        return;
      }

      setStatus("Menggabungkan hasil region...");
      const activeSymbol = normalizeSymbol(market.symbol);
      const parsed = parseOcrTextRich(combined, {
        activeSymbol,
        marketWatchText: mw ?? undefined,
        dataWindowText: dw ?? undefined,
      });

      if (import.meta.env.DEV) {
        console.debug("[MDBKA OCR PIPELINE]", parsed.debug);
      }

      finishExtraction(parsed, combined, "region");
    } catch (error) {
      console.error(error);
      setStatus("Ekstraksi region gagal.");
    } finally {
      setLoading(false);
    }
  }

  function clearRegions() {
    setMarketWatchRegion(null);
    setDataWindowRegion(null);
    setSelectionStart(null);
    setSelectionCurrent(null);
    setIsSelecting(false);
    setActiveRegion(null);
    setSelectionError("");
    setMwText(null);
    setDwText(null);
    setOcrSource("full-image");
  }

  const extractDisabled =
    loading || regionBusy !== null || !marketWatchRegion || !dataWindowRegion;

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

      <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
        <p className="text-xs text-slate-400">
          Aktifkan mode region, lalu seret kotak pada gambar. Jika crop
          gagal, gunakan OCR penuh.
        </p>

        <div
          ref={previewContainerRef}
          className={`relative inline-block max-w-full select-none ${activeRegion ? "cursor-crosshair" : "cursor-default"}`}
        >
          <img
            ref={imageRef}
            src={image}
            alt="Screenshot MetaTrader"
            draggable={false}
            onLoad={() => setImageLoaded(true)}
            className="block max-w-full rounded-lg"
          />
          {imageLoaded && (
            <canvas
              ref={selectionCanvasRef}
              className="absolute inset-0 z-20"
              style={{
                width: "100%",
                height: "100%",
                pointerEvents: activeRegion ? "auto" : "none",
                cursor: activeRegion ? "crosshair" : "default",
                touchAction: "none",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
          )}
        </div>

        <div data-testid="region-status" className="text-xs font-semibold text-slate-300">
          Mode: {activeRegion === "marketWatch" ? "Market Watch" : activeRegion === "dataWindow" ? "Data Window" : "tidak aktif"}
        </div>

        {activeRegion === "marketWatch" && (
          <p className="text-xs text-cyan-200">Mode aktif: seret kotak Market Watch pada gambar.</p>
        )}
        {activeRegion === "dataWindow" && (
          <p className="text-xs text-cyan-200">Mode aktif: seret kotak Data Window pada gambar.</p>
        )}
        {!activeRegion && (
          <p className="text-xs text-slate-500">Pilih salah satu mode region terlebih dahulu.</p>
        )}

        {selectionError && (
          <p className="text-xs text-red-300">{selectionError}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveRegion("marketWatch")}
            disabled={loading || regionBusy !== null}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              activeRegion === "marketWatch"
                ? "border-cyan-300 bg-cyan-400/25 text-cyan-100"
                : "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10"
            }`}
          >
            {regionBusy === "mw" ? "Membaca..." : "Tandai sebagai Market Watch"}
          </button>

          <button
            type="button"
            onClick={() => setActiveRegion("dataWindow")}
            disabled={loading || regionBusy !== null}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              activeRegion === "dataWindow"
                ? "border-cyan-300 bg-cyan-400/25 text-cyan-100"
                : "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10"
            }`}
          >
            {regionBusy === "dw" ? "Membaca..." : "Tandai sebagai Data Window"}
          </button>

          <button
            type="button"
            onClick={() => void runRegionExtract()}
            disabled={extractDisabled}
            className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ekstrak dari Region
          </button>

          <button
            type="button"
            onClick={clearRegions}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5"
          >
            Hapus region
          </button>
        </div>

        <div data-testid="market-watch-region" className="text-xs text-slate-400">
          Market Watch: {marketWatchRegion ? "siap" : "belum ada"}
        </div>
        <div data-testid="data-window-region" className="text-xs text-slate-400">
          Data Window: {dataWindowRegion ? "siap" : "belum ada"}
        </div>

        {(!marketWatchRegion || !dataWindowRegion) && (
          <p className="text-xs text-slate-500">Pilih kedua region sebelum mengekstrak.</p>
        )}
      </div>

      {status && (
        <p className="mt-4 rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-sky-200">
          {status}
        </p>
      )}

      {meta?.sourceLabels.bid === "Market Watch" && (
        <p className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-emerald-200">
          Bid/Ask diambil dari baris Market Watch. Periksa kembali karena
          harga dapat berubah setelah screenshot dibuat.
        </p>
      )}

      {meta && meta.missingFields.length > 0 && (
        <p className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
          Belum ditemukan: {meta.missingFields.join(", ")}. Isi manual bila
          tersedia di chart.
        </p>
      )}

      {meta && meta.warnings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {meta.warnings.map((warning) => (
            <li
              key={warning}
              className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
            >
              {warning}
            </li>
          ))}
        </ul>
      )}

      {isDebugTraceEnabled() && meta && (
        <div className="mt-4 space-y-2 rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/5 p-3 text-xs text-fuchsia-100">
          <p className="font-bold">Diagnostik OCR (development only)</p>
          <dl className="space-y-1">
            <div><dt className="inline font-semibold">activeSymbol: </dt><dd className="inline">{meta.debug.selectedSymbol || "(kosong)"}</dd></div>
            <div><dt className="inline font-semibold">OCR source: </dt><dd className="inline">{ocrSource}</dd></div>
            <div><dt className="inline font-semibold">Market Watch text: </dt><dd className="inline">{mwText ? truncateText(mwText, 120) : "(OCR penuh)"}</dd></div>
            <div><dt className="inline font-semibold">Data Window text: </dt><dd className="inline">{dwText ? truncateText(dwText, 120) : "(OCR penuh)"}</dd></div>
            <div><dt className="inline font-semibold">Market Watch line: </dt><dd className="inline">{meta.debug.chosenMarketWatchLine ?? "(tidak ada)"}</dd></div>
            <div><dt className="inline font-semibold">Bid/Ask candidate: </dt><dd className="inline">{`${meta.debug.parsedBid ?? "-"} / ${meta.debug.parsedAsk ?? "-"}`}</dd></div>
            <div><dt className="inline font-semibold">MA50 candidate: </dt><dd className="inline">{meta.debug.parsedMa50 ?? "-"}</dd></div>
            <div><dt className="inline font-semibold">rejected: </dt><dd className="inline">{meta.debug.rejectedFields.join(", ") || "-"}</dd></div>
            <div><dt className="inline font-semibold">warnings: </dt><dd className="inline">{meta.warnings.length}</dd></div>
            <div><dt className="inline font-semibold">S/R source: </dt><dd className="inline">{swingSource ?? "-"}</dd></div>
            <div><dt className="inline font-semibold">support/resistance: </dt><dd className="inline">{`${market.support} / ${market.resistance}`}</dd></div>
          </dl>
          <p className="text-fuchsia-200/70">Teks OCR lengkap: panel “Lihat teks OCR mentah” + tombol Salin.</p>
        </div>
      )}
    </div>
  );
}
