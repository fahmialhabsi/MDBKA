import { useCallback, useEffect, useState } from "react";
import { HardDriveDownload } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";

/**
 * Pengingat + tombol backup data MDBKA (8 Okt 2026).
 * Muncul menonjol bila "sudah waktunya backup" (belum pernah, atau data
 * penting berubah sejak backup terakhir); selain itu baris ringkas.
 */
interface BackupStatus {
  readonly backupDir: string;
  readonly last: { readonly at: string; readonly snapshot: string } | null;
  readonly changedFiles: number;
  readonly historyPending: number;
  readonly due: boolean;
  readonly reason: string;
}

const CHECK_MS = 5 * 60_000;

function formatWaktu(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function BackupBanner() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/backup/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { running?: boolean; status?: BackupStatus };
      if (body.status) setStatus(body.status);
      if (body.running === true) setBusy(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = (): void => {
      if (!cancelled) void loadStatus();
    };
    tick();
    const id = window.setInterval(tick, CHECK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loadStatus]);

  const runNow = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/backup/run`, { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        marker?: { snapshot: string; files: number; historyCopied: number };
        status?: BackupStatus;
      };
      if (!res.ok || body.marker === undefined) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      if (body.status) setStatus(body.status);
      setMessage(
        `Backup selesai: ${body.marker.files} file penting ke folder ${body.marker.snapshot}` +
          (body.marker.historyCopied > 0
            ? `, ${body.marker.historyCopied} file arsip tick.`
            : "."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === null && error === null) return null;
  const due = status?.due === true;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${
        due
          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-slate-400"
      }`}
    >
      <div className="flex items-start gap-3">
        <HardDriveDownload size={18} className={due ? "mt-0.5 text-amber-300" : "mt-0.5"} />
        <div>
          <p className={due ? "font-semibold text-amber-200" : ""}>
            {due ? "Sudah waktunya backup data MDBKA. " : "Backup data MDBKA terbaru. "}
            {status?.reason ?? ""}
          </p>
          <p className="mt-1 text-xs opacity-80">
            Backup terakhir:{" "}
            {status?.last ? formatWaktu(status.last.at) : "belum pernah"}
            {status ? ` · Tujuan: ${status.backupDir}` : ""}
          </p>
          {message !== null && <p className="mt-1 text-xs text-emerald-300">{message}</p>}
          {error !== null && <p className="mt-1 text-xs text-red-300">Gagal: {error}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void runNow()}
        disabled={busy}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          due
            ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
            : "border border-white/15 text-slate-200 hover:bg-white/5"
        } disabled:cursor-wait disabled:opacity-60`}
      >
        {busy ? "Membackup…" : "Backup sekarang"}
      </button>
    </div>
  );
}
