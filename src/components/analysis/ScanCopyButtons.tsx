import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { LiveQuoteLike } from "../../lib/csvQuote";
import {
  COPY_LOCK_SECONDS,
  copyButtonsView,
  copyLockState,
  startCopyLock,
  type CopyLock,
} from "../../lib/copyGuard";
import type { ScanPlan } from "../../lib/symbolScanner";
import { formatPrice } from "../../lib/tickSize";
import type { BrokerId } from "../../types/broker";

/**
 * Tombol [SL] [TP] di kolom Arah pemindai (penetapan Fahmi 10 Okt 2026).
 * [SL] = ambil harga live TERBARU, hitung ulang rencana (semua satpam ikut),
 * salin SL lalu kunci rencana 10 dtk. [TP] memakai rencana terkunci yang sama
 * selama harga belum bergeser > 10% jarak SL (lib/copyGuard.ts).
 * Hanya menyalin teks angka; MDBKA tidak menempatkan order.
 */
interface Props {
  readonly brokerId: BrokerId;
  readonly symbol: string;
  /** Hitung ulang rencana pemindai dengan quote baru; null = tidak lolos lagi. */
  readonly recompute: (quote: LiveQuoteLike) => ScanPlan | null;
}

const POLL_MS = 1000;
const DONE_MS = 8000;

async function fetchLatestQuote(brokerId: BrokerId, symbol: string): Promise<LiveQuoteLike | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/quotes/${encodeURIComponent(symbol)}?broker=${brokerId}&limit=1`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: LiveQuoteLike[] };
    const q = Array.isArray(body.data) ? body.data[body.data.length - 1] : undefined;
    return q !== undefined && typeof q.bid === "number" && typeof q.ask === "number" ? q : null;
  } catch {
    return null;
  }
}

function writeClipboard(text: string): Promise<boolean> {
  const clip = navigator.clipboard;
  if (clip === undefined) return Promise.resolve(false);
  return clip.writeText(text).then(() => true, () => false);
}

export function ScanCopyButtons({ brokerId, symbol, recompute }: Props) {
  const [lock, setLock] = useState<CopyLock | null>(null);
  const [quote, setQuote] = useState<LiveQuoteLike | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Selama kunci berlaku: harga live + jam tiap 1 dtk.
  useEffect(() => {
    if (lock === null) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const q = await fetchLatestQuote(brokerId, symbol);
      if (cancelled) return;
      const t = Date.now();
      setQuote(q);
      setNow(t);
      // Kunci habis → kembali ke awal (polling berhenti), wajib ulang dari SL.
      if (lock !== null && t - lock.startedMs >= COPY_LOCK_SECONDS * 1000) {
        setLock(null);
        setMessage(`Waktu ${COPY_LOCK_SECONDS} dtk habis — salin ulang dari SL`);
      }
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lock, brokerId, symbol]);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), DONE_MS);
    return () => window.clearTimeout(id);
  }, [done]);

  const state = lock === null ? null : copyLockState(lock, quote, now);
  const view = copyButtonsView(lock, state, done);
  const note = message ?? view.note;

  const onSl = async (): Promise<void> => {
    setMessage(null);
    setDone(false);
    const q = await fetchLatestQuote(brokerId, symbol);
    if (q === null) {
      setLock(null);
      setMessage("Harga live tidak terbaca — coba lagi");
      return;
    }
    const plan = recompute(q);
    if (plan === null) {
      setLock(null);
      setMessage("Dengan harga terbaru simbol ini tidak lolos lagi — jangan entry");
      return;
    }
    if (!(await writeClipboard(formatPrice(plan.stopLoss, symbol)))) {
      setMessage("Gagal menyalin ke clipboard");
      return;
    }
    const t = Date.now();
    setQuote(q);
    setNow(t);
    setLock(startCopyLock(symbol, plan, t));
  };

  const onTp = async (): Promise<void> => {
    if (lock === null || state === null || state.phase !== "SIAP_TP") return;
    if (!(await writeClipboard(formatPrice(lock.plan.takeProfit, symbol)))) {
      setMessage("Gagal menyalin ke clipboard");
      return;
    }
    setLock(null);
    setDone(true);
  };

  const tpClass =
    view.tone === "merah"
      ? "border-rose-400/60 bg-rose-500/20 text-rose-200"
      : view.tpEnabled
        ? "border-sky-400/60 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30"
        : "border-white/10 text-slate-500";

  return (
    <span className="ml-2 inline-flex flex-col gap-1 align-middle">
      <span className="inline-flex gap-1">
        <button
          type="button"
          data-testid={`scan-copy-sl-${symbol}`}
          onClick={() => void onSl()}
          title={lock === null ? "Hitung ulang dengan harga live lalu salin SL (kunci 10 dtk)" : undefined}
          className="rounded-md border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
        >
          {view.slLabel}
        </button>
        <button
          type="button"
          data-testid={`scan-copy-tp-${symbol}`}
          disabled={!view.tpEnabled}
          onClick={() => void onTp()}
          title={view.tpEnabled ? "Salin TP dari rencana yang sama" : "Tekan SL dulu"}
          className={`rounded-md border px-2 py-0.5 text-xs font-semibold disabled:cursor-not-allowed ${tpClass}`}
        >
          {view.tpLabel}
        </button>
      </span>
      {note !== null && <span className="text-[11px] leading-4 text-slate-400">{note}</span>}
    </span>
  );
}
