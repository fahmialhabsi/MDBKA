import { useEffect, useRef, useState } from "react";

interface CsvFileConnectorProps {
  onCsvLoaded: (text: string, fileName: string) => void;
  onConnectionChange?: (fileName: string, connected: boolean) => void;
  /** Dinaikkan App saat simbol berubah / clear agar handle lama dibuang. */
  resetKey?: number;
}

const AUTO_RELOAD_MS = 5000;

export default function CsvFileConnector({
  onCsvLoaded,
  onConnectionChange,
  resetKey = 0,
}: CsvFileConnectorProps) {
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const lastModifiedRef = useRef<number | null>(null);
  const lastSizeRef = useRef<number | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const onCsvLoadedRef = useRef(onCsvLoaded);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onCsvLoadedRef.current = onCsvLoaded;
  }, [onCsvLoaded]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Belum ada file CSV yang terhubung.");
  const [permissionStatus, setPermissionStatus] = useState("");
  const [autoReload, setAutoReload] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const firstResetRef = useRef(true);

  // Buang koneksi file lama saat App meminta reset (ganti simbol / clear).
  // Handle File System tidak bertahan antar simbol dan antar sesi tab.
  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    fileHandleRef.current = null;
    lastModifiedRef.current = null;
    lastSizeRef.current = null;
    setFileName("");
    setIsConnected(false);
    setPermissionStatus("");
    setStatus("Belum ada file CSV yang terhubung.");
    onConnectionChangeRef.current?.("", false);
  }, [resetKey]);

  const isSupported =
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function";

  async function readConnectedFile(requestPermission = false) {
    const handle = fileHandleRef.current;

    if (!handle) {
      // Tick auto-reload tanpa handle harus diam (mis. mode upload
      // fallback): jangan menimpa status sukses upload.
      if (requestPermission) {
        setStatus("Belum ada file CSV yang terhubung.");
      }
      return;
    }

    let permission: "granted" | "denied" | "prompt";
    try {
      permission = await handle.queryPermission({ mode: "read" });
    } catch {
      permission = "prompt";
    }

    if (permission !== "granted" && requestPermission) {
      try {
        permission = await handle.requestPermission({ mode: "read" });
      } catch {
        permission = "denied";
      }
    }

    if (permission !== "granted") {
      setPermissionStatus("Izin file: belum diberikan.");
      setStatus(
        "Izin membaca file ditolak atau belum diberikan. Klik “Muat Ulang CSV” untuk meminta izin kembali.",
      );
      return;
    }

    setPermissionStatus("Izin file: diberikan.");

    let file: File;
    try {
      file = await handle.getFile();
    } catch {
      setStatus(
        "File hilang atau tidak dapat dibaca. Hubungkan ulang file CSV.",
      );
      setIsConnected(false);
      onConnectionChangeRef.current?.(handle.name, false);
      return;
    }

    // Auto reload: lewati jika file belum berubah.
    if (
      !requestPermission &&
      lastModifiedRef.current === file.lastModified &&
      lastSizeRef.current === file.size
    ) {
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setStatus("File tidak dapat dibaca. Coba muat ulang atau pilih ulang file.");
      return;
    }

    lastModifiedRef.current = file.lastModified;
    lastSizeRef.current = file.size;
    setFileName(file.name);
    setIsConnected(true);
    onCsvLoadedRef.current(text, file.name);
    onConnectionChangeRef.current?.(file.name, true);

    if (requestPermission) {
      setStatus(`CSV berhasil dimuat: ${file.name} (${file.size} bytes).`);
    } else {
      setStatus(`CSV diperbarui otomatis: ${file.name}.`);
    }
  }

  async function connectCsv() {
    if (!window.showOpenFilePicker) {
      setStatus(
        "Browser tidak mendukung koneksi file langsung. Gunakan Upload CSV.",
      );
      fallbackInputRef.current?.click();
      return;
    }

    setIsBusy(true);
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "CSV MetaTrader",
            accept: {
              "text/csv": [".csv"],
            },
          },
        ],
      });

      const handle = handles[0];
      if (!handle) return;

      fileHandleRef.current = handle;
      lastModifiedRef.current = null;
      lastSizeRef.current = null;
      setFileName(handle.name);
      setIsConnected(true);

      await readConnectedFile(true);
      setStatus((prev) =>
        prev.startsWith("Izin")
          ? prev
          : `File CSV berhasil dihubungkan: ${handle.name}.`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Pemilihan file dibatalkan.");
        return;
      }
      setStatus("File CSV gagal dihubungkan. Coba pilih ulang file.");
    } finally {
      setIsBusy(false);
    }
  }

  async function reloadCsv() {
    if (!fileHandleRef.current || !isConnected) {
      setStatus("Belum ada file CSV yang terhubung.");
      return;
    }
    setIsBusy(true);
    try {
      await readConnectedFile(true);
    } catch {
      setStatus("CSV gagal dimuat ulang. Coba hubungkan ulang file.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFallbackFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      fileHandleRef.current = null;
      lastModifiedRef.current = null;
      lastSizeRef.current = file.size;
      setFileName(file.name);
      setIsConnected(true);
      setPermissionStatus("Mode upload: izin browser tidak diperlukan.");
      onCsvLoadedRef.current(text, file.name);
      onConnectionChangeRef.current?.(file.name, true);
      setStatus(
        `File CSV berhasil dihubungkan (mode upload): ${file.name}.`,
      );
    } catch {
      setStatus("File CSV gagal dibaca. Coba file lain.");
    }
  }

  useEffect(() => {
    if (!autoReload) return;

    const timer = window.setInterval(() => {
      void readConnectedFile(false);
    }, AUTO_RELOAD_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoReload]);

  return (
    <div className="space-y-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
      <div>
        <h3 className="font-bold text-white">
          4. Hubungkan CSV MetaTrader
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Pilih file CSV satu kali. MDBKA akan memeriksa perubahan file secara
          otomatis setiap 5 detik. Koneksi file tidak bertahan setelah tab
          ditutup — hubungkan ulang setelah membuka kembali.
        </p>
        {!isSupported && (
          <p className="mt-2 text-sm text-amber-200">
            Browser tidak mendukung koneksi file langsung. Gunakan Upload CSV.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void connectCsv()}
          disabled={isBusy}
          className="rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
        >
          Hubungkan CSV MT5
        </button>

        <button
          type="button"
          onClick={() => void reloadCsv()}
          disabled={!isConnected || isBusy}
          className="rounded-xl border border-cyan-400/30 px-4 py-3 font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Muat Ulang CSV
        </button>

        <label className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoReload}
            onChange={(event) => setAutoReload(event.target.checked)}
          />
          Muat ulang otomatis
        </label>

        <button
          type="button"
          onClick={() => fallbackInputRef.current?.click()}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5"
        >
          Upload CSV
        </button>
      </div>

      <input
        ref={fallbackInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          void handleFallbackFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {!isSupported && (
        <p className="text-xs text-slate-400">
          Auto reload berbasis file handle tidak tersedia pada mode upload.
        </p>
      )}

      {fileName && isConnected ? (
        <p className="text-sm text-cyan-200">
          File CSV aktif: <strong>{fileName}</strong>
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          Belum ada file CSV yang terhubung.
        </p>
      )}

      {permissionStatus && (
        <p className="text-xs text-slate-400">{permissionStatus}</p>
      )}

      <p className="text-sm text-slate-300">
        {isBusy ? "File sedang dimuat..." : status}
      </p>
    </div>
  );
}
