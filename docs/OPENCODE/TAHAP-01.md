# Tahap 01 — Fondasi murni: lint, klasifikasi penjaga, trade bayangan, rekomendasi

**Fase:** 0 (tidak mengubah perilaku apa pun). **Nomor test:** 688–693.
**Tidak boleh disentuh di tahap ini:** semua berkas di aturan umum bagian 2 butir 1, ditambah `src/lib/symbolScanner.ts`, `src/lib/exitMonitor.ts`, `src/lib/backtest.ts`, `src/lib/lossStreakGuard.ts`, `src/lib/riskGroup.ts` (hanya boleh diimpor).

Urutan pengerjaan: L0 → LAB-1 → TB-1 → PR-1.

---

## L0 — Perbaikan error lint lama

**Masalah (sudah diperiksa):** `npm run lint` gagal dengan `no-duplicate-imports` di `scripts/run-tests.ts`:

- baris 37: `import { collectCandleItems } from "../server/routes/candlesRoutes";`
- baris 57: `import { readCandleCsv } from "../server/routes/candlesRoutes";`

**Perubahan:**
1. Ubah baris 37 menjadi `import { collectCandleItems, readCandleCsv } from "../server/routes/candlesRoutes";`
2. Hapus baris 57.
3. Jaga CRLF.

**Diterima bila:** `npm test` tetap 683 lolos dan error di atas hilang dari `npm run lint`. Bila `npm run lint` masih menunjukkan error **lain** yang sudah ada sebelumnya, jangan diperbaiki; tulis daftarnya di laporan.

---

## LAB-1 — Klasifikasi penjaga keras/lunak

**Rancangan:** `docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md` bagian 11.2; SOP-15.

**Berkas baru:** `src/lib/guardClass.ts` (murni).

**Isi:**

```ts
/** LAB-1 (13 Okt 2026) — klasifikasi penahan untuk demo laboratorium. Murni. */
import type { ScanStatus } from "./symbolScanner";

export type GuardClass = "LOLOS" | "KERAS" | "LUNAK" | "BUKAN_SETUP";

export interface GuardClassDetail {
  /** Dari findSessionHold: 0 = pasar sedang tutup; > 0 = menit sampai tutup. */
  readonly sessionClosesInMin?: number | null;
}

export function classifyScanStatus(status: ScanStatus, detail?: GuardClassDetail): GuardClass;
```

**Tabel wajib** (`ScanStatus` diambil dari `src/lib/symbolScanner.ts`):

| ScanStatus | GuardClass |
| --- | --- |
| `LOLOS` | `LOLOS` |
| `TUNGGU` | `BUKAN_SETUP` |
| `DATA` | `KERAS` |
| `PASAR_TUTUP` | `KERAS` |
| `DITAHAN_SPEK` | `KERAS` |
| `DITAHAN_BUKTI` | `KERAS` |
| `DITAHAN_BIAYA` | `LUNAK` |
| `DITAHAN_RISIKO` | `LUNAK` |
| `DITAHAN_JEDA` | `LUNAK` |
| `DITAHAN_BERITA` | `LUNAK` |
| `DITAHAN_BUKA` | `LUNAK` |
| `DITAHAN_KORELASI` | `LUNAK` |
| `DITAHAN_SESI` | `LUNAK` bila `sessionClosesInMin > 0` (jelang tutup); `KERAS` bila `0`, `null`, atau tidak ada (pasar sedang tutup atau tidak diketahui → aman) |

- Gunakan `switch` atas semua nilai `ScanStatus` dengan pengecekan lengkap (exhaustive), supaya status baru di masa depan memicu error kompilasi.
- Ekspor juga `export const LAB_SOFT_STATUSES: readonly ScanStatus[]` dan `export const LAB_HARD_STATUSES: readonly ScanStatus[]` sesuai tabel (`DITAHAN_SESI` tidak dimasukkan ke keduanya karena bergantung detail).
- Margin tidak cukup bukan `ScanStatus`; ditangani di tahap 14. Tulis komentar satu baris tentang ini.

**Test 688:** semua 13 status sesuai tabel; `DITAHAN_SESI` dengan `{ sessionClosesInMin: 30 }` → `LUNAK`; dengan `0` → `KERAS`; tanpa detail → `KERAS`.

---

## TB-1 — Modul murni trade bayangan

**Rancangan:** rancangan tim bagian 11.1; SOP-14.

**Berkas baru:** `src/lib/shadowTrade.ts` (murni).

**Impor yang dipakai (sudah ada, jangan diubah):**
- `serverTimeMs(time: string): number | null` dari `src/lib/lossStreakGuard.ts` (format `"YYYY.MM.DD HH:MM:SS"`).
- `timeStopApplies(symbol: string): boolean` dan `TIME_STOP_HOURS` (= 3) dari `src/lib/exitMonitor.ts`. Terverifikasi: AUDJPY → `FOREX_JPY`/true, EURUSD → `FOREX`/true, XAUUSD → `LOGAM`/false.
- `type ScanStatus` dari `src/lib/symbolScanner.ts`.

**Tipe dan fungsi:**

```ts
/** TB-1 (13 Okt 2026) — trade bayangan: mengikuti sinyal yang ditahan dengan harga nyata. Murni. */
export const DEFAULT_MAX_OBSERVE_HOURS = 120; // usulan rancangan; dikunci per versi aturan

export type ShadowOutcome = "TP" | "SL" | "WAKTU" | "BATAS_AMATAN" | "BERJALAN";

export interface ShadowTick {
  readonly tsServer: string; // jam server MT5 "YYYY.MM.DD HH:MM:SS"
  readonly bid: number;
  readonly ask: number;
}

export interface ShadowTradeInput {
  readonly symbol: string;
  readonly direction: "BELI" | "JUAL";
  readonly signalServerTime: string;
  readonly entry: number;       // ask saat sinyal untuk BELI, bid untuk JUAL
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly heldBy: ScanStatus;  // status penahan dari pemindai
  readonly maxObserveHours?: number; // default DEFAULT_MAX_OBSERVE_HOURS
}

export interface ShadowTradeResult {
  readonly outcome: ShadowOutcome;
  readonly exitServerTime: string | null;
  readonly exitPrice: number | null;
  readonly r: number | null;            // dibulatkan 2 desimal; null untuk BATAS_AMATAN dan BERJALAN
  readonly maxFavorableR: number | null; // MFE dalam R, 2 desimal; null bila belum ada tick
  readonly maxAdverseR: number | null;   // MAE dalam R (angka positif), 2 desimal
}

export function validateShadowInput(input: ShadowTradeInput): string | null; // null = sah; selain itu alasan
export function evaluateShadowTrade(input: ShadowTradeInput, ticks: readonly ShadowTick[]): ShadowTradeResult;
```

**Aturan `validateShadowInput`** (kembalikan alasan berbahasa Indonesia bila tidak sah):
- BELI: `stopLoss < entry < takeProfit`. JUAL: `takeProfit < entry < stopLoss`.
- Semua harga angka hingga dan > 0; `signalServerTime` bisa dibaca `serverTimeMs`.

**Aturan `evaluateShadowTrade`:**
1. Bila input tidak sah → lempar `Error` berisi alasan dari `validateShadowInput`.
2. Abaikan tick yang jamnya tidak terbaca atau sebelum/sama dengan `signalServerTime`. Proses tick berurutan menurut jam (urutkan dulu; jangan ubah array masukan).
3. Harga keluar: **BELI memakai `bid`, JUAL memakai `ask`.**
4. Untuk setiap tick, urutan pemeriksaan:
   a. **SL:** BELI `bid <= stopLoss`; JUAL `ask >= stopLoss` → `SL`, harga keluar = `stopLoss`.
   b. **TP:** BELI `bid >= takeProfit`; JUAL `ask <= takeProfit` → `TP`, harga keluar = `takeProfit`.
   c. **Time-stop:** bila `timeStopApplies(symbol)` dan jam tick − jam sinyal ≥ `TIME_STOP_HOURS` jam → `WAKTU`, harga keluar = harga tick (bid/ask sesuai arah).
   d. **Batas amatan:** bila jam tick − jam sinyal ≥ `maxObserveHours` → `BATAS_AMATAN`, `r = null`, `exitPrice = null`, `exitServerTime` = jam tick itu.
5. Bila tick habis tanpa a–d → `BERJALAN`, `r`/`exitPrice`/`exitServerTime` = `null`.
6. `r`: BELI `(exit − entry) / (entry − stopLoss)`; JUAL `(entry − exit) / (stopLoss − entry)`.
7. MFE/MAE dihitung dari semua tick yang diproses sampai tick keluar (termasuk tick keluar), memakai harga keluar per arah, dalam R. MAE ditulis sebagai angka positif.
8. Tidak ada biaya, USD, atau Rupiah di tahap ini (menyusul di TB-2).

**Test 689–691** (harga tick adalah harga uji, bukan data nyata; tulis komentar itu di test):
- **689 (time-stop JPY, angka dari trade nyata AUDJPY Finex demo 61823011, 12 Okt 2026):** BELI, entry 110.528, SL 110.379, TP 110.759, sinyal `2026.10.12 02:27:27`. Tick uji: `03:00:00` bid 110.600; `05:27:27` bid 110.500. Harapan: `WAKTU`, `exitPrice` 110.5, `r` = −0.19, `maxFavorableR` = 0.48.
- **690 (TP dan SL; semua tick dalam 1 jam setelah sinyal agar tidak terkena time-stop Forex 3 jam):** (a) BELI EURUSD entry 1.1000, SL 1.0950, TP 1.1100: tick bid 1.1050 lalu 1.1101 → `TP`, `exitPrice` 1.1100, `r` = 2. (b) JUAL EURUSD entry 1.1000, SL 1.1050, TP 1.0900: tick ask naik ke 1.1050 → `SL`, `exitPrice` 1.1050, `r` = −1. (c) Tick sebelum jam sinyal diabaikan.
- **691 (emas tanpa time-stop, batas amatan, berjalan, input tidak sah):** (a) BELI XAUUSD entry 4196.84, SL 4184.03, TP 4242.03, sinyal `2026.10.12 07:51:21`; tick 4 jam kemudian bid 4200 → tick habis → `BERJALAN`. (b) Sama, `maxObserveHours: 2`, tick 3 jam kemudian → `BATAS_AMATAN`, `r` null. (c) `validateShadowInput` dengan SL di atas entry untuk BELI → mengembalikan alasan (bukan null), dan `evaluateShadowTrade` melempar error.

---

## PR-1 — Tipe dan jalur rekomendasi pembelajaran rugi

**Rancangan:** rancangan tim bagian 12; SOP-17.

**Berkas baru:** `src/lib/lossLesson.ts` (murni).

```ts
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
  | "T-ANALISA" | "T-MONITOR" | "T-PENJAGA" | "T-PELUANG" | "T-BIAYA" | "T-GERBANG" | "FAHMI";

export type RecommendationStatus = "DIUSULKAN" | "DIUJI" | "DITERIMA" | "DITOLAK" | "MENJADI_VERSI";

export interface CauseRoute {
  readonly rekomendasi: string;
  readonly penerima: readonly RecommendationTarget[];
}

export const CAUSE_ROUTES: Readonly<Record<LossCause, CauseRoute>>;
export function canTransition(from: RecommendationStatus, to: RecommendationStatus): boolean;
export function routeFor(cause: LossCause): CauseRoute;
```

**Isi `CAUSE_ROUTES` (wajib persis maknanya):**

| LossCause | rekomendasi | penerima |
| --- | --- | --- |
| `MELAWAN_SEJAK_MASUK` | "Perketat pemicu masuk" | `T-ANALISA` |
| `BERBALIK_SETELAH_0_5R` | "Titik impas lebih awal atau geser SL" | `T-MONITOR` |
| `SL_TERLALU_DEKAT` | "Terapkan batas SL minimum (0,5 × ATR)" | `T-ANALISA` |
| `DEKAT_BERITA_ATAU_TUTUP` | "Perlebar jendela penjaga untuk golongan ini" | `T-PENJAGA` |
| `MELAWAN_ARAH_D1` | "Terapkan penyaring arah D1" | `T-ANALISA` |
| `BIAYA_BESAR` | "Data untuk ambang biaya per golongan" | `T-PELUANG`, `T-BIAYA` |
| `DATA_BERMASALAH` | "Perbaiki sumber data" | `T-GERBANG` |
| `SARAN_TIDAK_DIJALANKAN` | "Laporan kepatuhan" | `FAHMI` |

**Transisi status yang sah (selain ini `false`):** `DIUSULKAN → DIUJI`, `DIUJI → DITERIMA`, `DIUJI → DITOLAK`, `DITERIMA → MENJADI_VERSI`.

**Test 692–693:**
- **692:** delapan sebab punya rute; `BIAYA_BESAR` punya dua penerima; `SARAN_TIDAK_DIJALANKAN` ke `FAHMI`.
- **693:** empat transisi sah bernilai `true`; contoh tidak sah bernilai `false`: `DIUSULKAN → DITERIMA`, `DITOLAK → DIUJI`, `MENJADI_VERSI → DIUSULKAN`, `DIUSULKAN → DIUSULKAN`.

---

## Selesai tahap

- `npm test`: 683 + 6 = **689 lolos**, 0 gagal.
- `npm run lint`: error `no-duplicate-imports` hilang.
- Tulis `docs/OPENCODE/LAPORAN-TAHAP-01.md`.
- Jangan commit.
