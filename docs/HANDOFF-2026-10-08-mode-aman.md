# HANDOFF MDBKA — Mode Aman (8 Okt 2026)

Dokumen serah-terima untuk melanjutkan pekerjaan MDBKA di chat baru.
Commit terakhir: **lihat `git log`** (sesi 8 Okt pagi: 32a7299 → e0168a2 → commit jeda; branch `main`).
Test terakhir: **536 lolos, 0 gagal**, build sukses (peringatan chunk > 500 kB hanya peringatan).
Nomor test terakhir: **540** → test baru mulai **541**.

---

## 0. GUARD KERJA (WAJIB DIPATUHI)

1. **Bahasa Indonesia**, jawaban ringkas (maks ±5 baris kecuali penjelasan bug kompleks).
2. **Root cause / audit read-only dulu**, baru coding. Jelaskan temuan sebelum mengubah.
3. **Satu perubahan kecil per langkah**, verifikasi tiap langkah sebelum lanjut.
4. **Pengguna yang menjalankan** `npm run build; npm test` lalu `git add -A; git commit -m "..."; git push`
   di Windows PowerShell (`PS E:\MDBKA>`). Claude memberi perintah + pesan commit, lalu menunggu hasilnya.
5. **Jangan bilang selesai sebelum terbukti** (test lolos, data dicek). Bila keliru, akui dan koreksi.
6. **Jumlah uang ditampilkan dalam Rupiah** (USD boleh di samping).
7. **Prinsip trading Fahmi (dasar semua desain):**
   > "biar profitnya sedikit itu lebih baik dan penting, dari pada mengejar profitnya tinggi tetapi malah minus yang didapat"
   Default TUNGGU; jangan pernah mengklaim sinyal "terbukti" tanpa data History ≥ 20 trade.
8. **Jangan merusak yang sudah jalan.** Pernah terjadi ("aplikasinya mulai ngaco") → dipulihkan dengan git stash + audit.
   Bila ragu, audit dulu, tanya pengguna.
9. MDBKA **tidak pernah menempatkan/menutup order**. Semua sinyal (breakeven, time-stop) hanya tampilan; eksekusi manual di MT5.
10. Bukan nasihat keuangan — keputusan trade tetap di tangan Fahmi.

### Cara kerja teknis (dari chat lama, lewat jembatan perangkat / Claude desktop)
- Repo di Windows: `E:\MDBKA` (di VM: `$HOME/mnt/MDBKA`). Terminal MT5 di VM: `$HOME/mnt/Terminal`.
- Edit file dengan python read-modify-write (`open(..., newline='')`) agar CRLF/LF tetap; atau tulis file
  lalu `device_commit_files`. Jangan menyalin ulang isi file dari output tool (bisa terpotong).
- **tsc tidak bisa jalan di VM** (TS7 binary Windows). ESLint bisa: `node node_modules/eslint/bin/eslint.js <file>`.
- Test runner: `scripts/run-tests.ts` (CommonJS via `tsconfig.test.json`, **tidak bisa import .tsx** → logika
  yang dites taruh di modul `.ts`). Test async taruh di IIFE terakhir sebelum baris ringkasan. Tes terakhir: **540**.
- `tsx` juga tidak jalan di VM (esbuild Windows) → test hanya bisa dijalankan pengguna. `scripts/run-tests.ts` CRLF:
  sisipkan teks dengan `\r\n`. File CRLF lain: `src/types/analysis.ts`, `AnalysisResult.tsx`.
- Test `readSrc` mengecek teks sumber: bila kalimat kode diubah, sesuaikan test lamanya (pernah gagal di 538).
- TS: objek uji dengan `decision: "BELI" as const` membuat tipe sempit → pakai anotasi `ReturnType<typeof analyzeMarket>`.
- `git diff` di VM bisa menampilkan seluruh run-tests.ts berubah (CRLF campur) — itu artefak VM; git Windows menormalkan.
- Frontend wajib memakai `API_BASE_URL` (`src/lib/apiBaseUrl.ts`), **jangan** `/api` relatif (akan kena Vite → HTML).

---

## 1. Arsitektur singkat

- **Backend** Express: `tsx watch server/index.ts`, port **3000**. **Frontend** React 19 + Vite + TS, port **5173**.
- **Broker / terminal MT5**
  | Broker | BrokerId | Terminal ID | Akhiran simbol | Komisi |
  |---|---|---|---|---|
  | OTB (PT Orbi Trade Berjangka) | `orbitraderberjangka` | `D0E8209F77C8CF37AD8BF550E51FF075` | `_ORB` (+ `.US`, `.DEC`) | $33/lot, hanya sisi IN |
  | Finex (PT Finex Bisnis Solusi Futures) | `finex` | `C84535A6B43B3F94C032314C1C9A9F5B` | tanpa akhiran (`#` saham) | $1/lot |
- **Akun** (`.env` → `ACCOUNT_LABELS=91811209:Finex live,61823011:Finex demo,70930952:OTB demo`).
- **EA / Service MT5** (sumber di `ea/`):
  - `MDBKAMultiLive` (EA) → `equity.csv` (8 kolom) + `quotes.csv`. **Jangan** pakai `MDBKAEquityLogger` lama (9 kolom, bentrok).
  - `ExportPositions` (EA) → `positions.csv` (presisi pakai `SYMBOL_DIGITS` per simbol).
  - `AutoExportMDBKAService` (service) → `Common\Files\MDBKA_<sym>_H1.csv`, **200 candle** (sejak 22cb986).
  - `MDBKAHistoryService` (service) → `Common\Files\MDBKA_History_<login>.csv` (kolom 16 = Company).
- `quotes.csv` memakai jam server yang sama untuk semua simbol → "pasar tutup" dideteksi dari candle H1 terakhir
  dibanding candle terbaru broker yang sama (selisih ≥ 2 jam = tutup/basi).
- Jam di positions.csv dan quotes.csv = **jam server MT5** (format `YYYY.MM.DD HH:MM:SS`).

---

## 2. Yang sudah selesai (urut commit)

| Commit | Isi |
|---|---|
| bc7ecc1 | Kurs BI dicabut; Rupiah pakai ECB (`getCachedEcbRates()` di `server/routes/fxRoutes.ts`) |
| 7a085b6 | Presisi harga per simbol di ExportPositions; `formatPriceDistance` |
| 3f65bfe | **Mode Aman**: gerbang biaya 10% (`MAX_COST_SHARE_OF_RISK = 0.1`), risiko lot minimum, default risiko 1% |
| 852e8c3 / 29e524a | Panduan TUNGGU + panel header menampilkan alasan Mode Aman (`src/lib/signalReason.ts`) |
| 080a348 | Hapus kode mati T1–T4 (useLiveQuotes, srCalculator, signalAnalyzer, liveQuotesStore, dll.) |
| 1b8b722 | `GET /api/candles?broker=` (`server/routes/candlesRoutes.ts`) |
| b8cee12 / 9c557a3 / 61e5468 | Pemindai simbol: `src/lib/symbolScanner.ts` + `SymbolScannerPanel.tsx` (status LOLOS / DITAHAN_BIAYA / DITAHAN_RISIKO / TUNGGU / PASAR_TUTUP / DATA) |
| 080c780 | **4b** catatan entry posisi (`server/services/tradeEntryLog.ts` → `data/trades/entries-<broker>.jsonl`) + **backup** (`dataBackup.ts`, `backupRoutes.ts`, `BackupBanner.tsx`; tujuan `~/Documents/MDBKA-Backup`) |
| edcfcbb | **4c-1** `server/services/tradeEvaluation.ts` + `GET /api/evaluation` (`evaluationRoutes.ts`) |
| 46ce504 | **4c-2** panel "Evaluasi trade — hasil nyata" (`TradeEvaluationPanel.tsx`, helper `src/lib/evaluationView.ts`) |
| 11a3946 | **4d** label Lolos di pemindai = win rate nyata bila n ≥ 20 (`mergeGroupStats`, `lolosLabel`), merah bila terbukti rugi |
| ba6ff11 | **Breakeven +0,5R** (`BREAKEVEN_R_MULTIPLE = 0.5`) + **time-stop 3 jam** (`checkTimeStop`, `TIME_STOP_HOURS = 3`) di monitor posisi (`HoldingsDashboard.tsx`) |
| 22cb986 | AutoExportMDBKAService ekspor **200 candle H1** (dulu 50); salinan di `ea/AutoExportMDBKAService.mq5`. Diverifikasi: 150 file × 201 baris |
| 32a7299 | **Analisa otomatis tanpa upload**: pilih simbol → CSV dari `/api/candles` masuk alur `handleCsvLoaded` (`src/lib/autoCandle.ts`). Upload manual tetap cadangan |
| 39fa063 | **Saldo & setoran per akun** dari History MT5 (`server/services/accountBalance.ts`, field `balance` di `/api/evaluation`). Cocok MT5: OTB $5.000,22 |
| 549ade1 | **Header saldo Rupiah** 3 akun (`AccountBalancesBar.tsx`, `accountBalanceView.ts`); live di depan; setoran Rupiah asli dari komentar deal |
| abb1f6a / 2412c15 | **Taruhan ganda**: `src/lib/correlationGuard.ts` (eksposur mata uang, Emas/Perak sendiri, "Saham AS" = indeks AS + saham .US/#, "Minyak"); pemindai status `DITAHAN_KORELASI`; pencatat entry menilai terhadap posisi LAIN |
| fb3e81c | Status pemindai = tombol: hanya **Lolos** aktif → pilih simbol + gulir ke `#hasil-analisa`; status lain disabled (tooltip alasan) |
| 4b61766 | Hasil analisa ikut menahan taruhan ganda (`applyDoubleBetHold`, `heldBy: "korelasi"`, kotak ungu) |
| e0168a2 + berikutnya | **Jeda 3 rugi beruntun**: `src/lib/lossStreakGuard.ts` (24 jam jam server, demo+live per broker, fail-safe tanpa jam server), `useLossPause`, pemindai `DITAHAN_JEDA` + baris "Rugi beruntun n/3", Hasil analisa `heldBy: "jeda"` (kotak merah) |

### Aturan Mode Aman yang aktif sekarang
1. Default **TUNGGU**; sinyal hanya bila skor (MA50, CCI, MACD, RSI) kompak.
2. **Risiko 1%** equity per trade; lot minimum melebihi batas → "Ditahan: risiko lot minimum".
3. **Gerbang biaya**: (spread + slippage)·pointValue + komisi ≤ **10%** dari risiko, selain itu "Ditahan: biaya X% (maks 10%)".
   Saat ditahan: decision = TUNGGU, SL/TP/lot = null, `heldBy`/`heldDecision`/`costShareOfRisk` diisi.
4. **Breakeven di +0,5R** (instruksi Modify SL = harga entry di MT5).
5. **Time-stop 3 jam** (selisih jam server quote − jam buka; holding manual format ISO tidak dinilai).
6. **Bukti n ≥ 20**: "Lolos · belum terbukti (n/20)" → "Lolos · win rate X% (n=N)"; merah "terbukti rugi" bila ekspektansi ≤ 0.
   Demo + live satu broker digabung.
7. Data indikator dari **200 candle H1**.
8. **Taruhan ganda diblok**: sinyal searah eksposur posisi terbuka broker aktif → TUNGGU (pemindai + Hasil analisa).
   Aturan USD ketat: posisi apa pun "USD naik/turun" memblok semua sinyal dengan arah USD yang sama.
9. **Jeda 24 jam setelah 3 rugi berturut-turut** (per broker, demo+live). Didahulukan dari taruhan ganda.
10. Urutan tahanan di Hasil analisa: jeda → taruhan ganda (biaya/risiko dari `analyzeMarket`).

### Hasil evaluasi (patokan "sebelum Mode Aman", semua kelompok TANPA_CATATAN)
| Akun | Trade | Win rate | Bersih | Rata-rata untung / rugi |
|---|---|---|---|---|
| OTB demo 70930952 | 15 | 27% | −$183,18 ≈ −Rp3,27 juta | +$7,59 / −$19,41 |
| Finex live 91811209 | 19 | 21% | −$13,71 ≈ −Rp245 ribu | +$0,98 / −$1,18 |
| Finex demo 61823011 | 0 | – | – | – |

Temuan: 3 posisi OTB yang ditahan berhari-hari ≈ **89% kerugian**. Backtest: edge ≈ 0 di semua horizon, negatif
setelah biaya; 3 jam relatif terbaik; TP kecil butuh win rate ±67% untuk impas.

---

## 3. Peta file penting

**Frontend**
- `src/App.tsx` — urutan: section broker → `BackupBanner` → `SymbolScannerPanel` → `TradeEvaluationPanel` → workGrid.
- `src/calculations/decisionEngine.ts` (analyzeMarket, Mode Aman), `indicators.ts` (min 50 candle), `swingDetector.ts` (swing terdekat).
- `src/lib/symbolScanner.ts`, `signalReason.ts`, `evaluationView.ts`, `exitMonitor.ts`, `tickSize.ts`, `marketReset.ts`.
- `src/components/analysis/SymbolScannerPanel.tsx`, `TradeEvaluationPanel.tsx`; `components/layout/BackupBanner.tsx`, `LiveSignalsPanel.tsx`;
  `components/holdings/HoldingsDashboard.tsx` (monitor posisi: TIME-STOP amber, BREAKEVEN hijau).
- `src/types/analysis.ts` (AnalysisResult + `costShareOfRisk`, `heldBy`, `heldDecision`).

**Backend**
- `server/index.ts` (wiring reader + entry log per broker), `server/app.ts` (mount routes).
- Routes: `candlesRoutes.ts`, `evaluationRoutes.ts`, `backupRoutes.ts`, `fxRoutes.ts`, `marginRoutes.ts` (`resolveCommonFilesDir`).
- Services: `tradeEntryLog.ts`, `tradeEvaluation.ts`, `dataBackup.ts`.
- `data/` di-gitignore (entries jsonl, history tick) → hanya aman lewat tombol **Backup sekarang**.

**Endpoint**
- `GET /api/candles?broker=` → `{broker, items:[{symbol,csv,modified,quote}]}`
- `GET /api/evaluation` → `{accounts:[{login,label,company,broker,evaluation:{trades,overall,byGroup,bySymbol,openPositions}}]}`
- `GET /api/backup/status`, `POST /api/backup/run` (409 bila sedang jalan)

**Dokumen**
- Jurnal: "Jurnal Evaluasi Trading MDBKA — 7 Okt 2026" — https://claude.ai/code/artifact/bdf0fd56-04d2-419d-a48a-cd5c6717ae86
  (rev 17; berisi ringkasan, evaluasi posisi, bug data, backtest + koreksi, aturan, audit History, bagian
  "Evaluasi trade dan aturan Mode Aman yang aktif (8 Okt 2026)", checklist langkah berikutnya).
- `docs/Roadmap MDBKA — Finex dan OrbiTraderBerjangka (OTB).md`, `docs/calculation-rules.md`.

---

## 4. Kondisi terbuka / perlu diperhatikan

- **8 Okt 10:17**: Finex rugi beruntun **2/3** (CADJPY, EURCHF) → satu rugi lagi di Finex = jeda 24 jam. OTB 0 (US100 +$186,70).
- Finex demo punya posisi terbuka (GBPUSD/GBPCHF/XTIUSD SELL) → beberapa sinyal JUAL GBP/minyak berstatus Taruhan ganda.
- Pencatat entry server (`tradeEntryLog`) BELUM memperhitungkan jeda (hanya korelasi). Opsional ditambah.

- Posisi OTB masih terbuka sejak 6 Okt: **META.US BUY 0,10 @741,07 tanpa SL/TP**, **AUDUSD_ORB BUY 0,10 @0,69811**
  (SL 0,69311, TP 0,70626). Keduanya kena TIME-STOP; META tanpa SL = risiko tak terbatas. Keputusan di tangan Fahmi.
- OTB Experts log 03:28: `ExportPositions: FileOpen gagal: 5004` (sekali; kemungkinan file sedang dibaca). Pantau bila berulang.
- Belum ada trade Mode Aman tercatat → label pemindai masih "belum terbukti (0/20)".
- Backup pertama sudah sukses; banner muncul lagi bila data penting berubah.

---

## 5. Langkah berikutnya (urutan usulan)

1. **Kumpulkan ≥ 20 trade Mode Aman berstatus Lolos**, lalu nilai ulang di panel Evaluasi trade (win rate, ekspektansi, R).
2. ~~Peringatan korelasi~~ ✅ selesai (diblok, bukan sekadar peringatan).
3. ~~Pause setelah 3 kali rugi berturut-turut~~ ✅ selesai (jeda 24 jam).
4. Gerak terbaik/terburuk (MFE/MAE) tiap trade dari arsip tick.
5. Opsional: biaya breakeven (SL = entry + biaya) agar BE tidak rugi kecil karena komisi/spread.
6. Opsional: pencatat entry server ikut mencatat status jeda; akun ke-4 di header bila ada file History-nya.
7. Opsional: kecilkan bundle JS (> 500 kB) dengan dynamic import.

Setiap langkah: audit read-only → jelaskan → satu perubahan kecil + test baru (mulai nomor **541**) →
ESLint → pengguna build/test/commit → verifikasi.

---

## 6. Prompt pembuka untuk chat baru (salin-tempel)

> Lanjutkan proyek MDBKA (repo E:\MDBKA, GitHub fahmialhabsi/MDBKA, branch main, lihat git log,
> 536 test lolos). Baca dulu `docs/HANDOFF-2026-10-08-mode-aman.md` dan patuhi bagian GUARD KERJA:
> Bahasa Indonesia ringkas, audit read-only dulu, satu perubahan kecil per langkah, saya yang menjalankan
> build/test/commit, jumlah dalam Rupiah, dan prinsip "profit kecil lebih baik daripada mengejar profit besar
> lalu minus". Langkah berikutnya: MFE/MAE dari arsip tick (mulai dengan audit read-only).
