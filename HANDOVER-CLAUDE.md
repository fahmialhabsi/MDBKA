# HANDOVER KE CLAUDE AI — Proyek MDBKA, Tahap Spesifikasi OTB

> Dokumen ini dibaca pertama kali oleh Claude AI agar langsung memahami
> konteks tanpa kehilangan riwayat pekerjaan dari Manus/Muse Spark.

---

## 1. CARA MEMAKAI DOKUMEN INI

**Untuk pemilik proyek (Anda):**

1. Salin seluruh isi file ini ke chat Claude AI (atau unggah file ini
   + file sumber pada Bagian 9).
2. Tempel prompt pada Bagian 2 sebagai pesan pertama.
3. Lanjutkan dengan instruksi tahap berikutnya (draf awal ada di Bagian 8,
   sesuaikan sebelum dikirim).

**Untuk Claude AI (baca Bagian 3–9 sebelum bertindak):**

* Jangan melakukan perubahan apa pun sebelum menyelesaikan audit
  struktur pada Bagian 6.
* Patuhi semua aturan mutlak pada Bagian 5.
* Sistem test BUKAN vitest/jest — baca Bagian 7 dengan teliti.

---

## 2. PROMPT SIAP-TEMPEL (pesan pertama ke Claude AI)

```text
Konteks: lanjutkan pekerjaan dari Manus/Muse Spark pada proyek MDBKA
(branch feature/orbitraderberjangka-isolated, 209 test lolos, build +
lint bersih). Baca HANDOVER-CLAUDE.md sampai selesai, lalu audit
struktur proyek (src/, scripts/run-tests.ts, tsconfig.test.json)
sebelum mengubah apa pun.

Tugas tahap ini: SPESIFIKASI OTB — mengisi parameter instrumen
OrbiTraderBerjangka yang riil (terverifikasi dari menu Specification
MetaTrader OTB), TANPA angka fiktif, TANPA merusak jalur Finex.

Aturan: Finex tetap default; hasil analisis Finex tidak boleh berubah;
jangan ubah decision engine, rumus risiko, parser OCR/CSV; setiap
perubahan harus ditambah test tanpa menghapus test lama (target tetap
209 lolos + test baru); verifikasi wajib npm run build, npm test,
npm run lint; jangan commit otomatis.

Jika ada data spesifikasi OTB yang belum saya berikan, minta datanya
dulu — JANGAN mengarang angka. Mulai dengan audit dan laporkan
rencana sebelum implementasi.
```

---

## 3. RINGKASAN PROYEK

* **MDBKA** ("Merangkak Dari Bawah Ke Atas"): aplikasi analisa trading
  edukasi berbasis screenshot (React 19 + Vite + TypeScript + Tailwind).
* Alur: screenshot terminal MT5 → OCR (tesseract.js) / CSV candle →
  koreksi manual → parameter broker/risiko → tombol ANALISA SEKARANG →
  keputusan BELI/JUAL/TUNGGU + lot/risiko.
* **Broker utama: Finex** (default, jalur stabil, tidak boleh berubah
  hasilnya). **Broker kedua: OrbiTraderBerjangka (OTB)** — saat ini
  HANYA terdaftar sebagai konteks/tampilan; preset angka & perhitungannya
  BELUM aktif (inilah tahap berikutnya).
* Lokasi repo: `E:\MDBKA`. Tidak ada secret di repo (cek `.env.example`).

---

## 4. STATUS TERKINI (per 02 Okt 2026)

* Branch: `feature/orbitraderberjangka-isolated`
* Working tree: BERSIH. Komit terakhir: `6bd7b20 fix: safely propagate
  CSV swing levels to market state`.
* Riwayat komit (baru → lama): `6bd7b20` (S/R) → `cf3b98e` (guard
  equity %) → `41aea4a` (broker selector) → `5b52d32` (broker
  registry) → `b63edbc` (baseline Finex stabil).
* Kualitas: **209/209 test lolos, `npm run build` sukses,
  `npm run lint` bersih.**

---

## 5. ATURAN MUTLAK (berlaku untuk semua tahap)

1. Finex tetap broker default; hasil analisis Finex tidak boleh berubah.
2. Jangan ubah rumus `src/calculations/decisionEngine.ts` dan rumus risiko.
3. Jangan ubah parser OCR (`ocrParser.ts`, `marketWatchParser.ts`) dan
   parser CSV (`csvCandleParser.ts`).
4. Jangan ubah nilai preset Finex di `src/lib/instrumentConfig.ts`.
5. Jangan memasukkan angka fiktif OTB; jangan memakai angka Finex
   sebagai angka OTB. Data OTB yang belum terverifikasi = koleksi
   kosong / null eksplisit + catatan "Perlu verifikasi dari
   Specification OrbiTraderBerjangka."
6. Jangan hapus/rename fungsi lama; jangan duplikasi tipe yang sudah ada;
   hindari `any` (ESLint error); tidak ada refactor besar.
7. Test lama tidak boleh dihapus — hanya append. Baseline Finex wajib
   tetap hijau.
8. Verifikasi wajib tiap tahap: `npm run build`, `npm test`,
   `npm run lint`. Jangan commit otomatis; laporkan hasil dulu.

---

## 6. PETA ARSITEKTUR & FILE KUNCI

```text
src/
  App.tsx                        # state terpusat: market, broker,
                                 # activeBrokerId, swingCsv; semua handler
  types/analysis.ts              # MarketData, BrokerSettings (akun/risiko),
                                 # AnalysisResult (JANGAN diubah strukturnya)
  types/broker.ts                # Tahap 2: BrokerId, BrokerProfile,
                                 # BrokerInstrumentPreset (= InstrumentProfile),
                                 # BrokerContext
  lib/brokerRegistry.ts          # Tahap 2: DEFAULT_BROKER_ID="finex",
                                 # BROKER_PROFILES (frozen), getBrokerProfile,
                                 # isSupportedBrokerId, helper simbol preservatif
  lib/instrumentConfig.ts        # SATU-SATUNYA sumber preset Finex
                                 # (SUPPORTED_SYMBOLS 10 simbol, profil,
                                 # normalizeSymbol). JANGAN diubah nilainya.
  lib/marketReset.ts             # RESET_MARKET_FIELDS, applyBrokerPreset,
                                 # applySwingLevels, mergeValidOcrMarketData,
                                 # applyCsvSwingLevels (guard simbol/skala/
                                 # broker + rejectionReason)
  calculations/decisionEngine.ts # JANGAN DIUBAH (rumus keputusan + lot)
  calculations/inputValidator.ts # validasi + warning (termasuk guard equity
                                 # dan aturan S/R wajib > 0)
  calculations/swingDetector.ts  # resolveSwingLevels / detectSwingLevels
  components/analysis/
    BrokerSelector.tsx           # Tahap 3: dropdown (value/onChange/
                                 # disabled), badge dari state,
                                 # data-testid="broker-selector"
    BrokerSettingsForm.tsx       # prop opsional brokerId (display only)
    CsvFileConnector.tsx         # koneksi file CSV (JANGAN diubah logikanya)
    SwingLevelsForm.tsx          # deteksi S/R CSV → onDetected(+meta
                                 # {csvSymbol, brokerId})
scripts/run-tests.ts             # SATU-SATUNYA file test: custom runner
                                 # (bukan vitest/jest), test 1–209
tsconfig.test.json               # daftar file yg dikompilasi utk test
                                 # (tambah file baru ke "include" bila perlu)
```

**Alur S/R (hasil audit + hardening terakhir):**
`resolveSwingLevels` → `SwingLevelsForm` (guard mismatch) →
`onDetected(support, resistance, source, {csvSymbol, brokerId})` →
`App.handleDetectedLevels` (functional `setMarket` + `applyCsvSwingLevels`
+ trace DEV `sr-propagation` berisi activeSymbol/csvSymbol/brokerId/
detectedSupport/detectedResistance/appliedSupport/appliedResistance/
previousSupport/previousResistance/rejectionReason) → `market.support` /
`market.resistance` → `ExtractedDataForm` (baca langsung dari market) →
`inputValidator` → `AnalysisResult`. Aturan merge: S/R CSV valid mengisi
state; OCR tanpa S/R tidak menghapus; null/0/NaN/negatif tidak menimpa;
simbol/broker beda ditolak (state tak berubah + alasan tercatat).

---

## 7. SISTEM TEST (PENTING — BUKAN VITEST/JEST)

* `npm test` = `tsc -p tsconfig.test.json` → `prepare-tests.mjs` →
  `node dist-tests/scripts/run-tests.js`.
* Pola: `test("NNN. judul", () => {...})` + `assert(kondisi, "pesan")`
  + helper `readSrc("src/...")` untuk **source-contract test**
  (`src.includes(...)`), dan pemanggilan fungsi langsung untuk
  **runtime test**.
* Nomor test = urutan sejarah: 1–167 baseline Finex, 168–176 registry
  (Tahap 2), 177–190 selector (Tahap 3), 191–197 guard equity %,
  198–209 propagasi S/R. **Test baru selalu append bernomor lanjut;
  JANGAN mengubah/menghapus test lama.**
* Ketat: `strict: true` + `noEmitOnError` — `assert` kustom TIDAK
  me-narrowing tipe; gunakan pola `if (x === null) throw new Error(...)`
  untuk meyakinkan compiler.
* Quirks lint: proyek memakai TS 7 untuk build tetapi lint memakai
  TS 5.9.3 via alias `typescript-for-lint` (lihat `eslint.config.js`);
  JANGAN "memperbaiki" ini.

---

## 8. TAHAP BERIKUTNYA: SPESIFIKASI OTB (draf — sesuaikan dulu)

**Tujuan:** mengisi parameter instrumen OTB yang RIIL dan terverifikasi
(dari menu Specification MetaTrader OrbiTraderBerjangka), lalu
mengaktifkannya secara bertahap TANPA menyentuh jalur Finex.

**Yang HARUS diminta dulu ke pemilik proyek (jangan dikarang):**
untuk tiap simbol OTB yang dipakai (minimal GBPUSD + US100): digits,
contract size, tick size, tick value, spread tipikal, min lot, lot step,
(leverage/kebijakan margin bila relevan) — plus screenshot/hasil
ekspor Specification sebagai bukti.

**Saran sub-tahap:**

* **4A — Data:** tambah `OTB_INSTRUMENT_PRESETS` (atau struktur setara)
  bertipe ketat, hanya berisi simbol yang datanya sudah diberikan;
  simbol tanpa data tetap kosong + catatan verifikasi. Test: tiap angka
  OTB ≠ salinan Finex; simbol tak berdokumen tetap kosong.
* **4B — Wiring:** `applyBrokerPreset`/`applyCsvSwingLevels` memilih
  sumber preset berdasar `activeBrokerId` (Finex = perilaku lama
  byte-identik; OTB = preset terverifikasi atau penolakan eksplisit).
  Test: hasil Finex sebelum/sesudah identik; OTB tanpa preset menolak
  dengan pesan jelas, bukan angka fiktif.
* **4C — UI:** peringatan "belum diverifikasi" hilang HANYA untuk simbol
  OTB yang datanya lengkap; badge/konteks broker tetap.

**Batasan tahap ini:** tetap jangan ubah decisionEngine/rumus; Finex
tetap default; target: 209 test lama hijau + test baru hijau.

---

## 9. FILE UNTUK DIUNGGAH KE CLAUDE AI (bila tidak satu mesin)

Jika Claude AI tidak punya akses repo, unggah minimal:

1. File ini (`HANDOVER-CLAUDE.md`).
2. `package.json`, `tsconfig.test.json`, `eslint.config.js`.
3. `src/App.tsx`, `src/types/broker.ts`, `src/lib/brokerRegistry.ts`,
   `src/lib/instrumentConfig.ts`, `src/lib/marketReset.ts`.
4. `src/calculations/decisionEngine.ts`,
   `src/calculations/inputValidator.ts`.
5. `src/components/analysis/BrokerSelector.tsx`,
   `src/components/analysis/SwingLevelsForm.tsx`.
6. `scripts/run-tests.ts` (besar — boleh potongan awal + 20 test terakhir).

Jika satu mesin/akses penuh: cukup arahkan Claude ke root repo +
file ini.

---

## 10. CATATAN SERAH TERIMA

* Seluruh pekerjaan Manus/Muse Spark sudah di-commit (`6bd7b20`);
  tidak ada perubahan menggantung.
* Jika pindah mesin: salin folder repo (atau `git push` branch
  `feature/orbitraderberjangka-isolated` lalu `clone`), jalankan
  `npm install`, lalu verifikasi `npm run build && npm test &&
  npm run lint` sebelum mulai Tahap 4.
* Kontak/riwayat keputusan penting: prioritas data
  manual > CSV > OCR; S/R dimentahkan hanya saat ganti simbol/clear;
  `BrokerSettings` = parameter akun/risiko (bukan identitas broker —
  itu `BrokerId`/`BrokerProfile`).

---

## 11. PEMBARUAN 12 OKT 2026 — BROKER KE-4 EXNESS (baca ini dulu)

Test terakhir: **686** (`npm test` = 682 lolos). HEAD: `305b65c`. Langkah
X1a–X5 + K1 (commit `b356858` … `305b65c`).

### 11.1 Empat terminal MT5 = empat folder data (JANGAN dicampur)

| Broker | Akun | Folder `AppData\Roaming\MetaQuotes\Terminal\…` | Mata uang | Akhiran simbol |
|---|---|---|---|---|
| OTB (Orbi) | demo 70930952 | `D0E8209F77C8CF37AD8BF550E51FF075` | USD | `_ORB` |
| Finex | live 91811209 / demo 61823011 | `C84535A6B43B3F94C032314C1C9A9F5B` | USD | (tanpa) |
| MIFX (Monex) | demo 1003997005 | `9CF14355DB10DCA27FBE7DA11B54CB92` | USD | `.m` |
| **Exness** | demo 413925678 (server Exness-MT5Trial6) | `53785E099C927DB68A545C249CDBCE06` | **IDR** | **`m` kecil** (XAUUSDm) |

**Pelajaran 12 Okt:** akun Exness sempat login DI TERMINAL OTB → EA menulis
equity/quotes/positions Exness ke folder OTB → tab OTB MDBKA tampil data
Rupiah sebagai dolar. Aturan: **satu broker = satu instalasi MT5 sendiri**
(installer broker → *Settings* → folder instalasi baru). Login ulang lewat
File → Login TIDAK membuat folder baru. Cek dengan File → Open Data Folder.

Tiap terminal wajib: EA `MDBKAMultiLive` + `ExportPositions` (MQL5\Experts,
dipasang di chart, Algo Trading hijau) dan Service `AutoExportMDBKAService`,
`MDBKACalendarService`, `MDBKAHistoryService` (MQL5\Services). Jangan pasang
`MDBKAEquityLogger` bersama `MDBKAMultiLive` (adu tulis file yang sama).

### 11.2 `.env` (tidak di-commit)

```
QUOTES_LOG_PATH_EXNESS=…\53785E…\MQL5\Files\quotes.csv
POSITIONS_LOG_PATH_EXNESS=…\53785E…\MQL5\Files\positions.csv
MT5_LOG_PATH_EXNESS=…\53785E…\MQL5\Files\equity.csv
MT5_ACCOUNT_CURRENCY_EXNESS=IDR      # WAJIB; kosong = equity TIDAK dilayani
ACCOUNT_LABELS=…,413925678:Exness demo
```

### 11.3 Aturan khusus Exness di kode

* **Akun IDR:** `equity.csv` tidak mencatat mata uang. Server membungkus
  dengan `IdrEquitySource` (`server/services/convertedEquity.ts`) → saldo,
  equity, profit, margin ÷ kurs ECB (`data/fx/ecb-usdidr.json`). Kurs tak
  ada → 404 jujur. Saldo header (`accountBalanceView`) & History
  (`historyView`) memakai angka Rupiah ASLI (tidak dikali kurs lagi).
* **Nama simbol:** `XAUUSDm` (m kecil). `baseRiskSymbol` membuang m kecil;
  `riskGroupOf` juga mengenali bentuk huruf besar `XAUUSDM` (hanya bila nama
  tanpa M dikenal — `#IBM` tetap saham). `getExnessSpec` tidak peka huruf.
* **Spesifikasi:** `src/lib/exnessSpecs.ts` — baru **XAUUSDm** (kontrak 100,
  tick 0.001, komisi 0 terbukti 33.487 deal, lot 0.01). EURUSDm/USDJPYm belum
  (komisi belum terbukti); kripto ditahan (tanpa golongan, Trade Disabled).
* **Swap Exness = 0** (`swapModeForBroker` → MATI): 74 posisi XAUUSDm menginap
  semuanya swap 0,00 walau Specification SwapMode 1 / long −523,3.
* **Jam server UTC+0.** Bukti Mode Aman (proof) mulai 0/20 — trade lama
  saudara Fahmi dibuka tanpa sinyal MDBKA, tidak ikut dihitung.
* **History besar** (±36.700 deal): tabel & ringkasan Golongan memuat
  1.000 deal terakhir (`HISTORY_MAX_ROWS`); total halaman History tetap semua.
* Backtest: `npm run backtest -- --broker exness --equity 560 --simbol XAUUSDm`
  (spread `MDBKA_Margin_Exness.csv`, script margin kenal "Exness").

### 11.4 Hasil uji strategi PDF (12 Okt)

* Scalping MIFX (MA9×MA120 + Stochastic 80/20 + engulfing): H1 belum cukup
  bukti (20 trade); **M15 TIDAK LAYAK** (90 trade, rugi di latih & ujian).
* ABC emas H4: MIFX belum cukup bukti (20 trade, selisih tipis +2,7 poin);
  Exness modal $560 = MODAL KURANG (13 sinyal ditahan lot minimum).
* Strategi tersedia: `skor` (default), `candle`, `scalping`, `abc`;
  timeframe `H1|H4|M15`. Tidak ada yang layak uang sungguhan.

### 11.5 Kebiasaan kerja yang disepakati Fahmi

* Analisa akar masalah dulu; satu langkah kecil; tanpa auto-commit.
* Penjelasan tiap langkah: analogi, contoh data asli, kegunaan, batasan,
  perubahan layar, lalu teknis singkat.
* Perintah dipisah per baris: `npm test; npm run build` lalu
  `git add -A; git commit -m "…"; git push` (jangan sisipkan kata "lalu").
* Test lama hanya ditambah; bila TERPAKSA diubah, beri komentar alasan.
  File `scripts/run-tests.ts` ber-CRLF; beberapa .tsx ber-BOM + CRLF.
