# Rancangan — Kantor Cabang MDBKA

**Tanggal:** 16 Okt 2026 · **Status:** USULAN, menunggu persetujuan Fahmi. Belum ada kode yang diubah.
**Makna Kantor Pusat:** *Merangkak Dari Bawah Ke Atas* — mulai dari modal dan lot terkecil, untung kecil tapi konsisten, naik satu tahap hanya setelah terbukti.

## 1. Aturan bersama semua cabang
1. **Cabang hanya memberi REKOMENDASI.** Yang memutuskan hanya Kantor Pusat (Fahmi). Cabang tidak boleh mengubah aturan, mengubah `decisionEngine.ts`, atau mengirim order.
2. **Pegawai cabang adalah program berbasis aturan** (tanpa AI): skrip, EA MT5, modul aplikasi. Satu jabatan, satu tugas, satu sistem.
3. **Isi rekomendasi wajib seragam** (Formulir R):
   `No · Cabang · Tanggal · Fakta (angka + sumber file) · Batas data · Usulan · Risiko bila disetujui · Keputusan yang diminta (Setuju/Tolak/Tunda)`.
   Angka yang tidak diketahui ditulis "…", bukan ditebak.
4. **Arsip:** setiap rekomendasi dan keputusan Pusat disimpan di `data/cabang/<kode>/` (berkas JSON). Keputusan tidak boleh ditimpa.
5. **Halaman:** setiap cabang punya halaman sendiri, `/?halaman=cabang&kode=KC-n`, mengikuti pola halaman yang sudah ada di `main.tsx` (App.tsx tidak disentuh).
6. **Uang ditampilkan dalam Rupiah** dengan kurs ECB, sumber kurs selalu disebut.

## 2. Struktur Kantor Pusat
| Jabatan | Pemegang | Wewenang |
|---|---|---|
| Pimpinan Pusat | Fahmi | Memutuskan rekomendasi; menyetujui angka yang dibekukan; menjalankan test/build/commit |
| Konsultan Perancang (di luar aplikasi) | Claude | Merancang, menulis prompt tahap, mengaudit hasil; tanpa wewenang memutuskan |
| Pelaksana Pembangunan (di luar aplikasi) | OpenCode | Membangun kode dari prompt tahap yang disetujui |
| Meja Rekomendasi | modul baru `cabangInbox` | Mengumpulkan Formulir R semua cabang ke satu daftar di halaman Pusat |

## 3. Alur antar-cabang
```
KC-1 Pilih Pijakan ──► KC-2 Jembatan MT5 ──► KC-3 Sekolah Merangkak ──► KC-4 Ruang Ujian ──► Pusat (lampu 1-2-3)
   (broker mana)        (data & fungsi)        (latih + try-out)            (ujian & demo)
KC-5 Pembukuan & Pajak ── berjalan sendiri, setiap bulan ──────────────────────────────────► Pusat
```

## 4. KC-1 "Pilih Pijakan" — memilih broker latih dan uji
**Hasil untuk Pusat:** rekomendasi *broker latih* (data sejarah) dan *broker uji* (demo/live), dengan alasan dan angka.
| Jabatan | Pemegang (keahlian) | Tugas · tanggung jawab · wewenang |
|---|---|---|
| Kepala Cabang | `brokerScorecard` (baru) — menghitung skor dari kriteria tetap | Menyusun Formulir R; wewenang hanya mengusulkan |
| Petugas Legalitas | daftar periksa manual Fahmi (cek bappebti.go.id / JFX) | Menandai broker terdaftar/tidak; tanpa status terverifikasi = tidak boleh live |
| Petugas Biaya | `specCompare` + file Margin (spread) + komisi preset | Biaya pulang-pergi per golongan dalam Rp |
| Petugas Data | pemeriksa file `_LONG.csv` (baru) | Panjang sejarah per golongan, lubang data, jam server |

**Kriteria tetap (sesuai makna MDBKA):**
1. Legal untuk live (wajib untuk broker uji live).
2. Bisa merangkak: lot minimum 0,01 dan setoran kecil.
3. Biaya kecil per trade (spread + komisi).
4. Sejarah data panjang, cukup untuk latih + try-out + ujian.
5. Demo dan live berkondisi sama (spread, komisi, jam server).
6. Ekspor MT5 MDBKA berjalan (EA/skrip terbukti).

**Fakta yang sudah ada (bahan awal):** komisi Finex $1/lot, OTB $33/lot, Exness $0; spread XAUUSD median Finex $0,17, Exness $0,24; data H1 Forex Finex baru mulai Des 2025 (tidak cukup untuk latih); Exness punya M5 1 tahun. Status legal broker selain Finex: "…" (diperiksa Petugas Legalitas).

**SOP KC-1:** (1) kumpulkan file Margin/Specs tiap broker → (2) hitung 6 kriteria → (3) broker gagal kriteria 1 hanya boleh jadi broker latih → (4) kirim Formulir R → (5) ulangi tiap bulan atau saat broker berubah biaya.

## 5. KC-2 "Jembatan MT5" — data dan fungsi dari MT5
**Hasil untuk Pusat:** (a) laporan kesehatan data harian; (b) rekomendasi fungsi MT5 baru yang dibutuhkan cabang lain.
| Jabatan | Pemegang (keahlian) | Tugas · tanggung jawab · wewenang |
|---|---|---|
| Kepala Cabang | `bridgeHealth` (baru) | Menyusun laporan dan Formulir R |
| Petugas Harga Live | EA `MDBKAMultiLive` | Kutipan live; bila berhenti, gerbang F2 menahan semua (kasus 16 Okt: MultiLive dilepas → lab 0 trade) |
| Petugas Arsip Candle | skrip `ExportLongH1MDBKA` (H4/H1/M15/M5/M1) + `AutoExportMDBKAService` | Candle sejarah dan candle baru |
| Petugas Spesifikasi | `ExportMarginMDBKA`, SymbolSpecs | Spread, margin, ukuran kontrak |
| Petugas Swap & History | `MDBKASwapLogger`, `mt5Journal` | Swap per jam, riwayat transaksi |
| Petugas Katalog Fungsi | daftar manual (baru) | Mencatat fungsi MQL5 yang tersedia vs dibutuhkan (mis. kalender berita historis, Python `MetaTrader5` — usulan API-1) |

**SOP KC-2:** (1) tiap jam cek umur file quotes/candle → (2) basi > batas = tandai MERAH di halaman + Formulir R otomatis → (3) permintaan fungsi dari cabang lain dicatat di Katalog → (4) usulan EA/skrip baru diajukan ke Pusat (perubahan EA butuh izin).

## 6. KC-3 "Sekolah Merangkak" — pelatihan (rumah tim Penambang Fakta)
**Hasil untuk Pusat:** buku **Pola Calon** — pola yang lolos latih dan try-out, lengkap dengan angka yang dibekukan.
| Jabatan | Pemegang (keahlian) | Tugas · tanggung jawab · wewenang |
|---|---|---|
| Kepala Sekolah | `patternBook` (baru) | Menjaga buku Pola Calon; tidak boleh menyentuh data ujian |
| Penambang Fakta | skrip penambang (baru) | Membedah data latih: kondisi (badai, jam, hari, spread, level, golongan) → peluang & rata-rata R |
| Penyaring Kebetulan | aturan statistik tetap (baru) | Pola harus muncul di setiap bab latih; makin banyak pola dicoba, makin ketat syaratnya |
| Pengawas Try-out | skrip try-out (baru) | Menguji pola di potongan latih yang disisihkan |
| Pustakawan | `tradeAudit` + arsip Lolosyiob | Fakta kegagalan lama sebagai daftar "jangan diulang" |

**SOP KC-3:** (1) terima data dari broker latih KC-1 lewat KC-2 → (2) bagi data: latih 60% · try-out 20% · ujian 20% (segel, hanya KC-4) → (3) tambang → saring → try-out → (4) gagal → Jalur Perbaikan (6a); lolos → bekukan angka → (5) Formulir R ke Pusat → (6) bila disetujui, serahkan ke KC-4.

### 6a. Jalur Perbaikan — bila data dan fakta belum bagus (diminta Fahmi 16 Okt 2026)
Pola yang gagal **tidak langsung dibuang**. KC-3 wajib mendiagnosis dulu, lalu memilih **satu** jalan per percobaan.
| Diagnosis (dari angka, bukan perasaan) | Jalan yang dipilih |
|---|---|
| Bahan berasal dari sumber yang sama (mis. MA/RSI/MACD semuanya dari close) | **A. Tambah bahan bakar** dari sumber lain (lihat daftar di bawah) |
| Bahan bagus, tetapi pertanyaannya keliru (mis. menebak arah padahal yang terbukti adalah besar gerak) | **B. Logika lebih tepat**: ganti pertanyaan (arah → besar gerak, waktu, cara keluar) |
| Pola hanya bagus di satu golongan atau satu broker | **C. Ganti tempat**: uji di golongan/broker lain dengan angka yang sama |
| Biaya memakan > 50% hasil | **D. Ganti ukuran**: horizon lebih panjang atau simbol berbiaya kecil |
| Sudah 7 percobaan tanpa perbaikan | **E. Arsip**: masuk daftar "jangan diulang" Pustakawan |

**Daftar bahan bakar (Buku Bahan Bakar, dirawat KC-3 bersama KC-2):**
| Bahan | Sumber | Mandiri dari harga close? | Status |
|---|---|---|---|
| Peringatan Badai (besar gerak) | candle M15 | sebagian (dari rentang) | TERBUKTI meramal besar gerak (CU-1) |
| Jam & hari, sesi | jam server → UTC | ya | diuji AP-2: belum memberi keunggulan arah |
| Spread & biaya per jam | file quotes/Margin | ya | belum diuji sebagai bahan |
| Tick volume | kolom tick_volume candle | ya | belum diuji |
| Kalender berita historis | MT5 Calendar (perlu fungsi baru KC-2) | ya | belum ada data sejarah |
| Kekuatan mata uang (gabungan banyak pasangan) | semua pasangan Forex | sebagian | belum diuji |
| Timeframe besar (D1/W1) | dirakit dari H1 | sebagian | diuji P-1/F-1: belum cukup |
| Data broker lain (Exness M5/M1 setahun) | KC-1/KC-2 | ya (sumber berbeda) | tersedia, belum ditambang |

**Aturan jalur perbaikan:**
1. Satu percobaan = satu perubahan (satu bahan baru *atau* satu logika baru), angka dibekukan sebelum diuji.
2. Setiap percobaan dicatat: diagnosis → jalan yang dipilih → hasil, agar kegagalan juga menjadi fakta.
3. Bahan baru yang belum ada datanya → KC-3 mengirim Formulir R **"Permintaan Bahan Bakar"** ke Pusat; bila disetujui, KC-2 yang menyediakannya.
4. Data ujian tetap bersegel; perbaikan hanya memakai data latih + try-out.

## 7. KC-4 "Ruang Ujian" — pengujian
**Hasil untuk Pusat:** vonis LULUS/GAGAL per pola per golongan, dan status lampu 1-2-3.
| Jabatan | Pemegang (keahlian) | Tugas · tanggung jawab · wewenang |
|---|---|---|
| Kepala Ruang Ujian | `greenLamps` | Menyusun vonis; satu pola hanya diuji sekali (gagal = gugur) |
| Penguji Data Lama | `backtest` + `backtestReport` (K1–K7, latih/ujian) | Lampu 1 |
| Pengawas Demo | rangkaian demo Finex (lampu 2) | Mencatat trade demo setara live |
| Pengawas Live Minimum | rangkaian live lot minimum (lampu 3) | Hanya setelah lampu 1 & 2 hijau |
| Auditor Trade | `tradeAudit` (+ usulan AUDIT-1) | Sebab rugi; tolak pola yang >50% rugi "melawan sejak masuk" atau >50% keluar karena waktu |

**Target Pusat (Fahmi, 16 Okt 2026):** minimal 1 simbol menghasilkan **Rp5.000–Rp6.000 per jam** bersih; saat target tercapai Fahmi menutup posisi manual di MT5.
- KC-4 mengukur "Rp bersih per jam terbuka" per simbol dan menguji aturan keluar "tutup di +Rp5.000" sebagai aturan keluar tersendiri (bukan hanya TP harga).
- Gambaran lot 0,01 (kurs Rp17.921): EURUSD Rp5.000 ≈ 2,8 pip; XAUUSD Rp5.000 ≈ gerak $0,28, padahal biaya spread+komisi ≈ $0,18 (≈64% target).
- Dengan modal ±Rp500.000, Rp5.000/jam = 1% modal per jam; belum ada strategi uji yang mencapai rata-rata positif.

**SOP KC-4:** (1) terima Pola Calon yang disetujui Pusat → (2) uji di data ujian bersegel → (3) lulus K1–K7 → Buku Aturan UJI_DEMO (lampu 2) → (4) Formulir R vonis → (5) gagal = arsip, tidak diuji ulang dengan angka lain.

## 8. KC-5 "Pembukuan & Pajak" — konsultan akuntansi
**Hasil untuk Pusat:** pengingat setoran pinjaman, buku besar pribadi (kas, utang, hasil trading), dan bahan SPT Tahunan Orang Pribadi.
| Jabatan | Pemegang (keahlian) | Tugas · tanggung jawab · wewenang |
|---|---|---|
| Kepala Cabang | `ledger` (baru) | Menyusun laporan bulanan dan Formulir R |
| Petugas Cicilan | pengingat setoran (baru) | Setoran Bank Jago Rp68.506/bulan (dikonfirmasi Fahmi 16 Okt 2026); tanda LUNAS/BELUM per bulan |
| Juru Buku | jurnal berpasangan (baru) | Setoran cicilan: Debit Utang Bank Jago (pokok) + Debit Beban Bunga / Kredit Kas; pokok & bunga diisi dari rincian Bank Jago, bukan ditebak |
| Petugas Hasil Trading | Jurnal Pajak / History MT5 (rencana 06–07 Okt) | Laba-rugi trading Finex live dalam Rp (kurs ECB tanggal transaksi) |
| Petugas SPT | penyusun lampiran (baru) | Bahan Lampiran 1 Bagian B "Utang pada Akhir Tahun Pajak" (Coretax): jenis utang, NIK/NPWP kreditur, nama kreditur, negara, tahun peminjaman, saldo akhir tahun termasuk bunga |

**SOP KC-5:** (1) tiap bulan: catat setoran (tanggal, jumlah, pokok, bunga, bukti) → (2) saldo utang diperbarui → (3) H-3 sebelum jatuh tempo: pengingat di halaman → (4) akhir tahun: cetak bahan Lampiran SPT + ringkasan hasil trading → (5) Formulir R ke Pusat.
**Batas:** KC-5 bukan konsultan pajak resmi; apakah bunga pinjaman pribadi mengurangi pajak tidak diputuskan cabang (rujuk DJP/konsultan pajak).
**Data pinjaman (dari Fahmi, 16 Okt 2026):** pokok Rp500.000 · cair 14 Okt 2026 · tenor 9 bulan · bayar tiap tanggal 14, Nov 2026 – Jul 2027 · bunga flat 2,59%/bulan (efektif 52,91%/tahun) · total bayar Rp616.553 · tujuan: trading.
- Hitungan flat: bunga Rp12.950/bulan × 9 = Rp116.550; cicilan ≈ Rp68.506/bulan (Rp616.553 ÷ 9). Selisih Rp3 = pembulatan bank.
- Dikonfirmasi Fahmi 16 Okt 2026: setoran yang benar Rp68.506/bulan (angka Rp250.000 sebelumnya keliru).
- Pembagian pokok/bunga per bulan memakai jadwal angsuran resmi Bank Jago bila ada (efektif 52,91% menandakan bunga lebih besar di awal); tanpa jadwal → "…", bukan pembagian rata.
- Karena dipakai untuk trading: KC-5 mencatat setoran ke Finex sebagai "Kas di broker" (aset), terpisah dari utang.

## 9. Urutan pembangunan (merangkak, satu tahap satu langkah)
1. Tahap C0: Formulir R + arsip `data/cabang/` + halaman daftar cabang (kosong).
2. Tahap C5: KC-5, karena kewajiban bulanan nyata dan datanya sederhana.
3. Tahap C2: KC-2, kesehatan data (mencegah kasus "0 trade" terulang).
4. Tahap C1: KC-1, skor broker.
5. Tahap C3 lalu C4: Sekolah Merangkak dan Ruang Ujian (tim Penambang Fakta).

## Sumber
- Lampiran utang SPT OP Coretax: https://news.ddtc.co.id/literasi/tips-trik/1816908/cara-isi-lampiran-utang-dalam-spt-tahunan-wp-orang-pribadi-via-coretax
- Panduan SPT OP Coretax (DJP): https://pajak.go.id/sites/default/files/2026-02/Panduan SPT OP Coretax Form V25022026.pdf
- Finex anggota JFX: https://investortrust.id/market/116219/finex-jadi-pialang-teratas-jfx-pada-enam-bulan-pertama-2026
