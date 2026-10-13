/** PR-1 (13 Okt 2026) — sebab rugi → rekomendasi → tim penerima; status rekomendasi. Murni. */
export type LossCause =
  | "MELAWAN_SEJAK_MASUK"
  | "BERBALIK_SETELAH_0_5R"
  | "SL_TERLALU_DEKAT"
  | "DEKAT_BERITA_ATAU_TUTUP"
  | "MELAWAN_ARAH_D1"
  | "BIAYA_BESAR"
  | "DATA_BERMASALAH"
  | "SARAN_TIDAK_DIJALANKAN";

export type RecommendationTarget =
  | "T-ANALISA"
  | "T-MONITOR"
  | "T-PENJAGA"
  | "T-PELUANG"
  | "T-BIAYA"
  | "T-GERBANG"
  | "FAHMI";

export type RecommendationStatus = "DIUSULKAN" | "DIUJI" | "DITERIMA" | "DITOLAK" | "MENJADI_VERSI";

export interface CauseRoute {
  readonly rekomendasi: string;
  readonly penerima: readonly RecommendationTarget[];
}

export const CAUSE_ROUTES: Readonly<Record<LossCause, CauseRoute>> = {
  MELAWAN_SEJAK_MASUK: { rekomendasi: "Perketat pemicu masuk", penerima: ["T-ANALISA"] },
  BERBALIK_SETELAH_0_5R: { rekomendasi: "Titik impas lebih awal atau geser SL", penerima: ["T-MONITOR"] },
  SL_TERLALU_DEKAT: { rekomendasi: "Terapkan batas SL minimum (0,5 × ATR)", penerima: ["T-ANALISA"] },
  DEKAT_BERITA_ATAU_TUTUP: { rekomendasi: "Perlebar jendela penjaga untuk golongan ini", penerima: ["T-PENJAGA"] },
  MELAWAN_ARAH_D1: { rekomendasi: "Terapkan penyaring arah D1", penerima: ["T-ANALISA"] },
  BIAYA_BESAR: { rekomendasi: "Data untuk ambang biaya per golongan", penerima: ["T-PELUANG", "T-BIAYA"] },
  DATA_BERMASALAH: { rekomendasi: "Perbaiki sumber data", penerima: ["T-GERBANG"] },
  SARAN_TIDAK_DIJALANKAN: { rekomendasi: "Laporan kepatuhan", penerima: ["FAHMI"] },
};

const ALLOWED_TRANSITIONS: Readonly<Record<RecommendationStatus, readonly RecommendationStatus[]>> = {
  DIUSULKAN: ["DIUJI"],
  DIUJI: ["DITERIMA", "DITOLAK"],
  DITERIMA: ["MENJADI_VERSI"],
  DITOLAK: [],
  MENJADI_VERSI: [],
};

export function canTransition(from: RecommendationStatus, to: RecommendationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function routeFor(cause: LossCause): CauseRoute {
  return CAUSE_ROUTES[cause];
}
