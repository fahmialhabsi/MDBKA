import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  ImagePlus,
  Trash2,
  UploadCloud
} from "lucide-react";

interface Props {
  image: string | null;
  onImageChange: (image: string | null) => void;
}

export default function ScreenshotDropzone({
  image,
  onImageChange
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteMessage, setPasteMessage] = useState("");

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) =>
        item.type.startsWith("image/")
      );

      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();

      reader.onload = () => {
        onImageChange(String(reader.result));
        setPasteMessage(
          "Screenshot berhasil ditempel dari clipboard."
        );
      };

      reader.readAsDataURL(file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onImageChange]);

  function readFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();

    reader.onload = () => {
      onImageChange(String(reader.result));
      setPasteMessage("Gambar berhasil dimuat.");
    };

    reader.readAsDataURL(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    readFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-4">
      {!image ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            "cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition",
            isDragging
              ? "border-emerald-300 bg-emerald-300/10"
              : "border-white/15 bg-white/[0.03] hover:border-emerald-400/50 hover:bg-white/[0.06]"
          ].join(" ")}
        >
          <ImagePlus
            className="mx-auto mb-4 text-emerald-400"
            size={42}
          />

          <h3 className="text-xl font-bold text-white">
            Tempel screenshot di sini
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            Tekan Ctrl + V untuk menempelkan gambar dari clipboard,
            atau klik untuk memilih file gambar.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              <ClipboardPaste size={15} />
              Ctrl + V
            </span>

            <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              <UploadCloud size={15} />
              Upload gambar
            </span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) =>
              readFile(event.target.files?.[0])
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-emerald-400/30 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="font-semibold text-white">
                Screenshot siap dianalisa
              </p>
              <p className="text-xs text-slate-400">
                Periksa gambar sebelum menjalankan OCR.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onImageChange(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10"
            >
              <Trash2 size={16} />
              Hapus
            </button>
          </div>

          <div className="max-h-[520px] overflow-auto bg-black/30 p-3">
            <img
              src={image}
              alt="Screenshot trading"
              className="mx-auto max-h-[480px] max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      {pasteMessage && (
        <p className="text-sm text-emerald-300">{pasteMessage}</p>
      )}
    </div>
  );
}
