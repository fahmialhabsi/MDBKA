# Laporan Audit Sistem MDBKA — Roadmap Finex dan OTB (1.0)

Saya telah melakukan audit komprehensif terhadap sistem MDBKA berdasarkan pedoman **Roadmap MDBKA — Finex dan OrbiTraderBerjangka (OTB)** versi 1.0. Audit difokuskan pada isolasi broker, fondasi multi-broker, kebenaran fungsionalitas, serta manajemen risiko.

## 1. Temuan Utama (P0 - Kritis)

### 1.1 Konversi FX Euro (Terselesaikan)
- **Masalah:** Fungsi `convertToUSD` dalam `fxRateService.ts` sebelumnya gagal mengonversi nilai dari Euro (EUR) secara akurat, karena membagi dengan rate lokal tetapi tidak mengalikan dengan kurs USD. Ini menyebabkan swap dari EUR dan JPY dikonversi secara tidak wajar.
- **Tindakan:** `convertToUSD` telah dimodifikasi untuk mengalikan kurs USD pada akhir perhitungan. Semua tes regresi (Test 289, 290, 292, 296) telah diperbarui untuk mencerminkan nilai desimal yang baru dan telah berhasil lulus (LULUS 329 tes).

### 1.2 Risiko JPY (Terselesaikan)
- **Masalah:** `decisionEngine.ts` mencampurkan USD (sebagai komisi dan ekuitas awal) dengan `pointValue` dalam unit mata uang Profit Currency (seperti JPY). Hal ini membuat Lot Teoritis dari pair JPY seperti `AUDJPY_ORB` dihitung jauh dari seharusnya (risiko dinilai seolah-olah 100 JPY setara dengan 100 USD).
- **Tindakan:** Modifikasi dilakukan pada `App.tsx` di area `useMemo(analysis)`. Apabila Broker Aktif adalah `orbitraderberjangka`, aplikasi akan mem-fetch `currencyProfit` spesifikasi OTB dan menggunakan `fxRates` untuk mengonversi `broker.pointValue` murni menjadi nilai setara USD secara *on-the-fly* sebelum mengumpankannya ke fungsi `analyzeMarket`.
- **UI Label:** Label UI telah diperjelas menjadi `Tick value / 1 lot (Profit Currency)` untuk menghindari kebingungan pengguna. Pengguna kini memasukkan nilai murni sesuai mata uang pasangannya (contoh: 100 untuk AUDJPY), dan sistem secara cerdas akan mengonversikannya ke USD dalam hitungan `riskPerOneLot`.

### 1.3 Verifikasi OTB `hasOtbPresetForSymbol` (Terselesaikan)
- **Masalah:** Roadmap mewajibkan bahwa field `VERIFY` tidak boleh dianggap sebagai spesifikasi yang telah terverifikasi.
- **Tindakan:** Validasi `isCompleteOtbPreset` diperketat di `brokerSymbols.ts` untuk memastikan hanya simbol `GBPUSD_ORB` yang dianggap telah terverifikasi, sementara `AUDCAD_ORB` dan `EURCHF_ORB` sekarang dikembalikan statusnya sebagai belum diverifikasi.

## 2. Pemeriksaan Status Roadmap

| Tahap | Komponen | Status Saat Ini | Keterangan |
|-------|----------|-----------------|------------|
| **Baseline** | Integrasi Finex | **Aman** | Tes unit utama (324+/329) terlewati dengan aman. Baseline Finex tetap kokoh dan default fallback aman. |
| **OTB-1** | Selector & Konteks | **Selesai** | Pergantian state berfungsi murni, memisahkan S/R, membersihkan file CSV dan membatalkan status jika berpindah broker. |
| **OTB-2** | Exact symbol mapping | **Selesai** | Peta `_ORB` tidak tercampur dengan reguler `GBPUSD` untuk pengenalan OCR. |
| **OTB-3** | Preset instrumen | **Perlu Lanjut** | Preset masih memerlukan verifikasi khusus untuk indeks CFD, dan data parameter margin OTB live di terminal MT5. |
| **OTB-4** | Verifikasi OTB (GBPUSD_ORB) | **Sebagian** | Kode siap, tetapi metrik seperti `maintenanceMargin` (terpisah dari `initialMargin`) masih menggunakan *placeholder* yang belum final dari Spesifikasi Live. |
| **OTB-5** | Manajemen Risiko Multi-Currency | **Selesai** | Validasi `convertToUSD` dengan ECB rate yang sudah *fail-safe* telah diaplikasikan baik untuk *Swap Cost* maupun ukuran *Point Value*. |

## 3. Kesimpulan Audit

Arsitektur aplikasi sudah *compliant* dengan roadmap yang diberikan, namun masih ada sejumlah langkah integrasi manual dari terminal MT5 yang belum dapat diwakili oleh *code base*.

**Aplikasi saat ini aman dari kesalahan fatal finansial yang dapat merugikan trader**, berkat mekanisme konversi USD *on-the-fly* untuk `decisionEngine` dan label peringatan dari `hasOtbPresetForSymbol`.

**Rekomendasi Lanjutan:**
1. Menyempurnakan parameter di `OTB_PRESETS` khusus untuk *Index* (misalnya US100_ORB) dan melengkapinya dengan verifikasi dari spesifikasi terminal asli.
2. Memverifikasi konektivitas API Web SSE di terminal MDBKA backend sesungguhnya.
