import { PTKP_STATUSES, type PtkpStatus } from "./pajakOP";

/**
 * #510 - tipe + validasi murni catatan pembayaran pajak & profil pajak.
 * Bukti bayar (PDF/PNG/JPG) disimpan di data/bukti-pajak oleh store.
 */
export const JENIS_PEMBAYARAN = [
  "PPh Pasal 29 OP",
  "PPh Pasal 25 OP",
  "Lainnya",
] as const;
export type JenisPembayaran = (typeof JENIS_PEMBAYARAN)[number];

export const MAX_BUKTI_BYTES = 5 * 1024 * 1024;
export const BUKTI_MIME_EXT: Readonly<Record<string, string>> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

export interface BuktiMeta {
  readonly fileName: string;
  readonly mime: string;
  readonly size: number;
  readonly storedName: string;
}

export interface PembayaranPajak {
  readonly id: string;
  readonly year: number;
  readonly tanggalBayar: string;
  readonly jenis: JenisPembayaran;
  readonly kodeAkun: string;
  readonly jumlahIdr: number;
  readonly ntpn: string;
  readonly kodeBilling: string;
  readonly catatan: string;
  readonly bukti: BuktiMeta | null;
  readonly createdAt: string;
}

export interface ProfilPajak {
  readonly ptkpStatus: PtkpStatus;
  readonly otherNetIncomeIdr: number;
  readonly creditIdr: number;
}

export const DEFAULT_PROFIL: ProfilPajak = {
  ptkpStatus: "TK/0",
  otherNetIncomeIdr: 0,
  creditIdr: 0,
};

export interface PembayaranInput {
  readonly year: number;
  readonly tanggalBayar: string;
  readonly jenis: JenisPembayaran;
  readonly jumlahIdr: number;
  readonly ntpn: string;
  readonly kodeBilling: string;
  readonly catatan: string;
}

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

const KODE_AKUN: Readonly<Record<JenisPembayaran, string>> = {
  "PPh Pasal 29 OP": "411125-200",
  "PPh Pasal 25 OP": "411125-260",
  Lainnya: "",
};

export function kodeAkunFor(jenis: JenisPembayaran): string {
  return KODE_AKUN[jenis];
}

function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export function validatePembayaran(raw: unknown): Validated<PembayaranInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const year = Number(r["year"]);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { ok: false, error: "Tahun pajak tidak valid" };
  }
  const tanggalBayar = String(r["tanggalBayar"] ?? "");
  if (!isRealDate(tanggalBayar)) {
    return { ok: false, error: "Tanggal bayar harus YYYY-MM-DD yang valid" };
  }
  const jenis = String(r["jenis"] ?? "") as JenisPembayaran;
  if (!JENIS_PEMBAYARAN.includes(jenis)) {
    return { ok: false, error: "Jenis pembayaran tidak dikenal" };
  }
  const jumlahIdr = Number(r["jumlahIdr"]);
  if (!Number.isFinite(jumlahIdr) || jumlahIdr <= 0) {
    return { ok: false, error: "Jumlah bayar harus lebih dari 0" };
  }
  const ntpn = String(r["ntpn"] ?? "")
    .trim()
    .toUpperCase();
  if (ntpn !== "" && !/^[A-Z0-9]{16}$/.test(ntpn)) {
    return {
      ok: false,
      error: "NTPN harus 16 karakter huruf/angka (kosongkan bila belum ada)",
    };
  }
  const kodeBilling = String(r["kodeBilling"] ?? "").trim();
  if (kodeBilling !== "" && !/^\d{15}$/.test(kodeBilling)) {
    return {
      ok: false,
      error: "Kode billing harus 15 digit (kosongkan bila belum ada)",
    };
  }
  return {
    ok: true,
    value: {
      year,
      tanggalBayar,
      jenis,
      jumlahIdr: Math.round(jumlahIdr),
      ntpn,
      kodeBilling,
      catatan: String(r["catatan"] ?? "")
        .trim()
        .slice(0, 500),
    },
  };
}

export function validateProfil(raw: unknown): Validated<ProfilPajak> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = String(r["ptkpStatus"] ?? "") as PtkpStatus;
  if (!PTKP_STATUSES.includes(status)) {
    return { ok: false, error: "Status PTKP tidak dikenal" };
  }
  const other = Number(r["otherNetIncomeIdr"] ?? 0);
  const credit = Number(r["creditIdr"] ?? 0);
  if (
    !Number.isFinite(other) ||
    other < 0 ||
    !Number.isFinite(credit) ||
    credit < 0
  ) {
    return {
      ok: false,
      error: "Penghasilan lain dan kredit pajak harus angka 0 atau lebih",
    };
  }
  return {
    ok: true,
    value: {
      ptkpStatus: status,
      otherNetIncomeIdr: Math.round(other),
      creditIdr: Math.round(credit),
    },
  };
}

export interface BuktiUpload {
  readonly name: string;
  readonly mime: string;
  readonly dataBase64: string;
}

/** Validasi file bukti; kembalikan byte hasil decode bila sah. */
export function decodeBukti(
  raw: unknown,
): Validated<{ upload: BuktiUpload; bytes: Uint8Array }> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mime = String(r["mime"] ?? "");
  if (BUKTI_MIME_EXT[mime] === undefined) {
    return { ok: false, error: "Bukti harus PDF, PNG, atau JPG" };
  }
  const dataBase64 = String(r["dataBase64"] ?? "");
  if (dataBase64 === "" || !/^[A-Za-z0-9+/=\s]+$/.test(dataBase64)) {
    return { ok: false, error: "Data bukti tidak valid" };
  }
  const bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
  if (bytes.length === 0 || bytes.length > MAX_BUKTI_BYTES) {
    return { ok: false, error: "Ukuran bukti harus 1 byte sampai 5 MB" };
  }
  const name =
    String(r["name"] ?? "bukti")
      .replace(/[^\w.\- ]/g, "_")
      .slice(0, 120) || "bukti";
  return { ok: true, value: { upload: { name, mime, dataBase64 }, bytes } };
}
