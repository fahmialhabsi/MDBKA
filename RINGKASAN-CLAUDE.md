# RINGKASAN SINGKAT MDBKA UNTUK CLAUDE AI

## Apa itu proyek MDBKA?

MDBKA ("Merangkak Dari Bawah Ke Atas") adalah aplikasi analisa trading
edukasi berbasis screenshot (React 19 + Vite + TypeScript + Tailwind).
Alur: screenshot terminal MT5 → OCR (tesseract.js) / CSV candle →
koreksi manual → parameter broker/risiko → ANALISA SEKARANG → keputusan
BELI/JUAL/TUNGGU + lot/risiko. Tidak menempatkan order. Broker utama:
**Finex** (default, jalur stabil). Broker kedua: **OrbiTraderBerjangka
(OTB)** — baru terdaftar sebagai konteks/tampilan, preset angkanya
belum aktif.

## Status saat ini

* Branch: `feature/orbitraderberjangka-isolated` — working tree BERSIH,
  komit terakhir `6bd7b20`.
* Kualitas: **209/209 test lolos, `npm run build` sukses,
  `npm run lint` bersih.**
* Lokasi repo: `E:\MDBKA` (tidak ada secret; lihat `.env.example`).

## File / repository utama

```text
src/App.tsx                              # state terpusat + semua handler
src/types/broker.ts                      # BrokerId, BrokerProfile, BrokerContext
src/lib/brokerRegistry.ts                # registry broker (Finex default, frozen)
src/lib/instrumentConfig.ts              # SATU-SATUNYA sumber preset Finex (JANGAN diubah)
src/lib/marketReset.ts                   # merge/preset/S-R + guard simbol-skala-broker
src/calculations/decisionEngine.ts       # rumus keputusan (JANGAN DIUBAH)
src/calculations/inputValidator.ts       # validasi + warning
src/components/analysis/BrokerSelector.tsx  # dropdown broker (Tahap 3)
src/components/analysis/SwingLevelsForm.tsx # deteksi S/R dari CSV
scripts/run-tests.ts                     # custom test runner (BUKAN vitest/jest)
```

Perintah verifikasi tiap tahap: `npm run build`, `npm test`, `npm run lint`.
Aturan inti: Finex tidak boleh berubah hasilnya; dilarang angka fiktif OTB;
test lama hanya boleh di-append, tidak dihapus; jangan commit otomatis.

## Milestone / deliverable

**Sudah selesai:**
* Baseline Finex stabil (test 1–167).
* Tahap 2 — fondasi tipe + registry broker terisolasi, Finex default,
  OTB terdaftar tanpa angka (test 168–176).
* Tahap 3 — dropdown broker Finex/OTB, konteks + tampilan saja
  (test 177–190).
* Perbaikan 3.1 — guard `undefined%` equity (test 191–197).
* Audit + hardening propagasi S/R CSV→market + diagnostik
  `sr-propagation` (test 198–209).

**Belum selesai (tahap berikutnya: SPESIFIKASI OTB):**
* Membutuhkan DATA RIIL dari pemilik: digits, contract size, tick
  size/value, spread, min lot, lot step per simbol OTB (dari menu
  Specification MetaTrader OTB). Tanpa data ini, JANGAN mengarang angka.
* 4A: tambah preset OTB terverifikasi saja; simbol tanpa data tetap kosong.
* 4B: wiring preset berdasar `activeBrokerId` (Finex byte-identik).
* 4C: UI — hapus warning "belum diverifikasi" hanya untuk simbol OTB
  yang datanya lengkap.
