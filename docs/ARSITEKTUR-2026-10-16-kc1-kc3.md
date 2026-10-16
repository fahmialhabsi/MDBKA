# Arsitektur KC-1 s/d KC-3 (A-1)

**Tanggal:** 16 Okt 2026 · **Status:** kerangka dibangun; **semua petugas DITUNDA** (keputusan Fahmi 16 Okt 2026 12:38 WIT).
**Kode:** `src/lib/branchArchitecture.ts` (murni) · halaman `/?halaman=cabang&kode=KC-n` menampilkan alur dan status petugas.

## 1. Gambaran
```
KC-1 Pilih Pijakan                KC-2 Jembatan MT5                 KC-3 Sekolah Merangkak
 KARTU_BROKER ─► PILIHAN_BROKER ─► DAFTAR_DATA ───────────────────► PEMBAGIAN_DATA ─► POLA_CALON ─► (KC-4)
        ▲                │                                                │                  │
        └── DAFTAR_DATA ◄┘          KATALOG_FUNGSI ◄── CATATAN_PERBAIKAN ◄┴──────────────────┘
```
Analogi: tiga kantor di satu gedung, berhubungan lewat **map berlabel** (jenis hasil). Setiap map punya pemilik tetap; kantor lain hanya boleh membaca, tidak boleh menulis map milik kantor lain.

## 2. Kontrak hasil (map)
| Map | Pemilik | Isi | Dibaca oleh |
|---|---|---|---|
| KARTU_BROKER | KC-1 | 6 kriteria satu broker, tiap angka + sumber (null = belum diketahui) | KC-1 Kepala |
| PILIHAN_BROKER | KC-1 | satu broker untuk latih + uji + alasan | KC-2, KC-3 |
| DAFTAR_DATA | KC-2 | file per simbol/timeframe: dari–sampai, jumlah candle, lubang | KC-1 Petugas Data, KC-3 |
| KATALOG_FUNGSI | KC-2 | fungsi MT5 tersedia vs dibutuhkan | KC-3 Penambang (daftar bahan bakar) |
| PEMBAGIAN_DATA | KC-3 | batas latih 60% · try-out 20% · ujian 20% (segel) | KC-3 Penambang, KC-4 (belum dirancang) |
| POLA_CALON | KC-3 | kondisi, bahan, angka beku, hasil latih & try-out | KC-3 Penyaring, KC-4 (belum dirancang) |
| CATATAN_PERBAIKAN | KC-3 | diagnosis + jalan A–E + hasil | KC-2 (permintaan bahan) |

## 3. Aturan kerangka (diuji otomatis)
1. Petugas hanya menulis map milik cabangnya sendiri (`contractErrors` harus kosong).
2. Alur antar-cabang dihitung dari kontrak, bukan ditulis tangan (`branchFlows`).
3. **Segel ujian:** KC-1..KC-3 tidak boleh membaca bagian UJIAN; hanya KC-4 (`bolehBaca`).
4. Pembagian data tetap 60/20/20 menurut waktu (`splitPeriods`, `bagianOf`).
5. Jalur Perbaikan: percobaan ke-7 tanpa perbaikan wajib E_ARSIP (`jalanBoleh`).
6. Semua petugas berstatus DITUNDA sampai Pusat mengaktifkan satu per satu.

## 4. Penyimpanan (dipakai saat petugas aktif)
`data/cabang/<KC-n>/hasil/<MAP>-<tanggal UTC>.json` — terpisah dari Formulir R; ditulis sekali, tidak ditimpa.

## 5. Yang belum dibangun (sengaja)
Logika setiap petugas, penyimpanan hasil, dan pengiriman Formulir R otomatis — menunggu Pusat mengaktifkan petugas.
