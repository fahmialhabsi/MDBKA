/**
 * KC-4 Kepala Ruang Ujian & Penguji Data Lama (menyusul, 16 Okt 2026) — Lampu 1: uji Pola Calon yang
 * SUDAH DISETUJUI Pusat (KC-3) di bagian UJIAN bersegel (hanya KC-4 yang boleh membacanya — lihat
 * bolehBaca() di branchArchitecture.ts), memakai kriteria K1–K7 yang SAMA dengan yang sudah ditetapkan
 * Fahmi untuk riset strategi versi MDBKA (docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md §2,
 * scripts/research/strategi_versi_mdbka_bt.py):
 *   K1 n≥20 · K2 rata-rata R>0 · K3 PF≥1,2 · K4 ≥5/7 blok positif · K5 terburuk ≥−1,1R ·
 *   K6 positif tanpa blok terbaik (tidak bergantung satu blok beruntung) · K7 LATIH juga positif.
 * MURNI. Eksekusi trade (tambangBadaiSimbol) DIPAKAI ULANG dari kc3Penambang.ts — mesin yang SAMA
 * dengan Penambang Fakta, hanya diberi candle UJIAN (bukan LATIH). Satu pola hanya diuji SEKALI
 * (ditegakkan pemanggil, bukan di sini — lihat server/services/kc4Runner.ts).
 */
import { candleTimeMs } from "./symbolScanner";
import type { BadaiTrade } from "./kc3Penambang";
import type { RecommendationInput } from "./branchOffice";

export const K1_MIN_N = 20;
export const K3_MIN_PF = 1.2;
export const K4_MIN_BLOK_POSITIF = 5;
export const K5_MIN_TERBURUK_R = -1.1;
export const BLOK_N = 7;

export interface HasilK1K7 {
  readonly n: number;
  readonly rataR: number | null;
  /** null bila tanpa trade ATAU tanpa rugi sama sekali (PF tak terhingga — lihat rugiNol, bukan JSON Infinity). */
  readonly profitFactor: number | null;
  /** true = ada trade menang dan TIDAK ADA satu pun rugi (PF tak terhingga, K3 lolos otomatis). */
  readonly rugiNol: boolean;
  readonly terburuk: number | null;
  readonly blok: readonly number[];
  readonly blokPositif: number;
  readonly k1: boolean;
  readonly k2: boolean;
  readonly k3: boolean;
  readonly k4: boolean;
  readonly k5: boolean;
  readonly k6: boolean;
  readonly k7: boolean;
  readonly lulus: boolean;
  readonly gagal: readonly string[];
}

/**
 * Profit factor = jumlah R untung ÷ jumlah |R| rugi. Tanpa rugi sama sekali (tapi ada yang menang) =
 * PF tak terhingga secara matematis (sama seperti scripts/research/strategi_versi_mdbka_bt.py: pf =
 * pos/neg if neg>0 else inf) — dikembalikan null di sini (Infinity tidak valid JSON) dan ditandai
 * lewat `rugiNol` di ujiK1K7() supaya K3 tetap lolos otomatis, bukan digugurkan karena null disalahbaca.
 */
function profitFactor(trades: readonly BadaiTrade[]): number | null {
  if (trades.length === 0) return null;
  const untung = trades.filter((t) => t.rMultiple > 0).reduce((s, t) => s + t.rMultiple, 0);
  const rugi = trades.filter((t) => t.rMultiple < 0).reduce((s, t) => s + Math.abs(t.rMultiple), 0);
  return rugi === 0 ? null : untung / rugi;
}

/** Bagi trade ke BLOK_N blok waktu sama panjang dalam [dariIso, sampaiIso); jumlah R per blok. */
export function bagiBlok(trades: readonly BadaiTrade[], dariIso: string, sampaiIso: string): number[] {
  const blok = new Array(BLOK_N).fill(0) as number[];
  const dariMs = candleTimeMs(dariIso);
  const sampaiMs = candleTimeMs(sampaiIso);
  if (dariMs === null || sampaiMs === null || sampaiMs <= dariMs) return blok;
  const lebar = (sampaiMs - dariMs) / BLOK_N;
  for (const t of trades) {
    const ms = candleTimeMs(t.signalTime);
    if (ms === null) continue;
    const idx = Math.min(BLOK_N - 1, Math.max(0, Math.floor((ms - dariMs) / lebar)));
    blok[idx] = (blok[idx] as number) + t.rMultiple;
  }
  return blok;
}

/** K1–K7 di UJIAN (dariUjianIso s/d sampaiUjianIso); K7 memastikan LATIH juga positif (bukan kebetulan satu bagian). */
export function ujiK1K7(ujian: readonly BadaiTrade[], latih: readonly BadaiTrade[], dariUjianIso: string, sampaiUjianIso: string): HasilK1K7 {
  const n = ujian.length;
  const rataR = n === 0 ? null : ujian.reduce((s, t) => s + t.rMultiple, 0) / n;
  const pf = profitFactor(ujian);
  const rugiNol = n > 0 && pf === null && ujian.some((t) => t.rMultiple > 0);
  const terburuk = n === 0 ? null : Math.min(...ujian.map((t) => t.rMultiple));
  const blok = bagiBlok(ujian, dariUjianIso, sampaiUjianIso);
  const blokPositif = blok.filter((b) => b > 0).length;
  const totalBlok = blok.reduce((s, b) => s + b, 0);
  const blokTerbaik = blok.length === 0 ? 0 : Math.max(...blok);
  const latihRataR = latih.length === 0 ? null : latih.reduce((s, t) => s + t.rMultiple, 0) / latih.length;

  const k1 = n >= K1_MIN_N;
  const k2 = rataR !== null && rataR > 0;
  const k3 = rugiNol || (pf !== null && pf >= K3_MIN_PF);
  const k4 = blokPositif >= K4_MIN_BLOK_POSITIF;
  const k5 = terburuk !== null && terburuk >= K5_MIN_TERBURUK_R;
  const k6 = totalBlok - blokTerbaik > 0;
  const k7 = latih.length > 0 && latihRataR !== null && latihRataR > 0;

  const status: readonly (readonly [string, boolean])[] = [["K1", k1], ["K2", k2], ["K3", k3], ["K4", k4], ["K5", k5], ["K6", k6], ["K7", k7]];
  const gagal = status.filter(([, ok]) => !ok).map(([kode]) => kode);
  const bulat2 = (v: number): number => Math.round(v * 100) / 100;

  return {
    n,
    rataR: rataR === null ? null : bulat2(rataR),
    profitFactor: pf === null ? null : bulat2(pf),
    rugiNol,
    terburuk: terburuk === null ? null : bulat2(terburuk),
    blok: blok.map(bulat2),
    blokPositif,
    k1, k2, k3, k4, k5, k6, k7,
    lulus: gagal.length === 0,
    gagal,
  };
}

export type VonisUjian = "LULUS" | "GAGAL";

export function formulirVonis(polaId: string, broker: string, k: HasilK1K7, vonis: VonisUjian, tanggal: string): RecommendationInput {
  return {
    judul: `Vonis Ujian KC-4 (${broker}): ${polaId} ${vonis}`,
    fakta: [
      { teks: `UJIAN: n=${k.n}, rata-rata R=${k.rataR ?? "…"}, PF=${k.rugiNol ? "tak terhingga (tanpa rugi)" : (k.profitFactor ?? "…")}, terburuk=${k.terburuk ?? "…"}R, blok positif ${k.blokPositif}/${BLOK_N}.`, sumber: `ujiK1K7() KC-4 ${tanggal}` },
      {
        teks: vonis === "LULUS" ? "Semua K1-K7 lolos." : `Gagal: ${k.gagal.join(", ")}.`,
        sumber: "Kriteria K1-K7, docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md §2",
      },
    ],
    batasData: "Hanya rentang UJIAN bersegel (tidak pernah dibuka KC-1..KC-3); satu pola diuji SEKALI — gagal = gugur, tidak diuji ulang dengan angka sama.",
    usulan:
      vonis === "LULUS"
        ? `Setujui Pola Calon "${polaId}" (${broker}) masuk Buku Aturan UJI_DEMO (lampu 2, belum dibangun) — lanjut diuji di akun demo setara live.`
        : `Pola Calon "${polaId}" (${broker}) GAGAL ujian data lama; arsipkan, tidak diuji ulang dengan angka yang sama.`,
    risiko: "Tidak mengirim order; hanya menilai data historis. LULUS bukan jaminan untung di demo/live — masih perlu lampu 2 dan 3 (belum dibangun).",
  };
}
