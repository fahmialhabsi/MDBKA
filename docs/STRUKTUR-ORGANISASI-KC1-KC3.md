# Struktur Organisasi, SOP dan Alur Kerja KC-1 s/d KC-3

**Dibuat dari `src/lib/branchOffice.ts` (16 Okt 2026, diperbarui setelah KC-2 dan KC-3 Kepala Sekolah dibangun).** Petugas KC-1 dan KC-2 AKTIF; KC-3 Kepala Sekolah AKTIF (Pembagian Data), Penambang Fakta dan Penyaring Kebetulan/Pengawas Try-out masih DITUNDA. Halaman: `/?halaman=cabang&kode=KC-n`.

## KC-1 Pilih Pijakan

**Misi:** Menetapkan SATU broker (Finex, OTB, MIFX, atau Exness) yang PALING DEKAT dengan prinsip MDBKA, untuk pelatihan (KC-3) sekaligus pengujian (KC-4) memakai AKUN DEMO.

**Hasil untuk Pusat:** Jawaban "broker yang paling dekat dengan prinsip MDBKA": satu broker terpilih + nilai kedekatan tiap prinsip + alasan dan angka.

### Struktur dan syarat jabatan

| Jabatan | Syarat jabatan | Calon pemegang | Memenuhi? |
|---|---|---|---|
| Kepala Cabang (Penilai Akhir) | Menghitung dengan aturan tetap (bahan sama → hasil sama); tidak memihak broker mana pun; bisa membaca 4 Kartu Broker dan menulis Formulir R. | Program kepalaCabang (src/lib/kc1Assessment.ts) — AKTIF | ✅ Tersedia |
| Petugas Prinsip Merangkak | Bisa membaca lot minimum dan kelipatan lot tiap simbol dari MT5, serta setoran minimum akun dari sumber resmi broker. | petugasMerangkak membaca MDBKA_Specs_<login demo>.csv — AKTIF; setoran minimum dari config/kc1-fakta-broker.json (dicatat Konsultan) | 🟡 Sebagian |
| Petugas Prinsip Dari Bawah | Bisa menghitung biaya pulang-pergi lot minimum (spread + komisi) per golongan dalam Rupiah dengan kurs ECB. | petugasDariBawah: MDBKA_Margin_<broker>.csv + preset komisi + kurs ECB — AKTIF | ✅ Tersedia |
| Petugas Prinsip Ke Atas | Bisa membuktikan status terdaftar broker dengan tautan resmi dan tanggal pemeriksaan, serta apakah broker yang sama punya akun live dengan aturan sama. | petugasKeAtas membaca config/kc1-fakta-broker.json (bukti legal dicatat Konsultan, ditetapkan Pusat) — AKTIF | 🟡 Sebagian |
| Petugas Prinsip Terbukti | Bisa membandingkan spesifikasi akun demo dan live, dan menilai apakah sejarah data cukup untuk latih 60% · try-out 20% · ujian 20%. | petugasTerbukti: banding spesifikasi demo vs live + panjang file *_LONG.csv (sementara dibaca langsung, sampai KC-2 aktif) — AKTIF | 🟡 Sebagian |

### Tugas, tanggung jawab, batas wewenang

| Jabatan | Tugas | Tanggung jawab | Batas wewenang |
|---|---|---|---|
| Kepala Cabang (Penilai Akhir) | Mengumpulkan nilai 4 prinsip dari para petugas untuk Finex, OTB, MIFX dan Exness, menggugurkan broker yang gagal syarat wajib, lalu menyusun satu Formulir R "Broker Terpilih". | Rekomendasi menjawab "broker paling dekat prinsip MDBKA" dengan angka bersumber; angka tak diketahui ditulis "…". | Boleh mengusulkan satu broker. Tidak boleh mengubah nilai dari petugas, mengganti broker aplikasi, membuka akun, atau memindah dana. Tidak pernah mengirim order dan tidak memutuskan apa pun — hanya mengusulkan. |
| Petugas Prinsip Merangkak | Memeriksa apakah broker bisa dimulai sekecil mungkin: lot minimum 0,01 dan setoran awal kecil. | Menyebut simbol/golongan yang lot minimumnya lebih besar dari 0,01. | Hanya menilai prinsip Merangkak. Lot minimum di atas 0,01 untuk semua golongan = gugur wajib. |
| Petugas Prinsip Dari Bawah | Menghitung berapa persen modal kecil (±Rp500.000) yang habis untuk biaya satu trade di tiap golongan. | Menuliskan tanggal file Margin dan kurs yang dipakai. | Hanya menghitung. Tidak boleh mengubah preset biaya broker. |
| Petugas Prinsip Ke Atas | Memeriksa apakah broker bisa dipakai naik dari demo ke live tanpa pindah broker: legal di Indonesia dan punya akun live. | Status diperiksa ulang paling lambat tiap 6 bulan; tanpa bukti = "belum terverifikasi". | Broker "belum terverifikasi" atau tidak legal = gugur wajib. Tidak menilai prinsip lain. |
| Petugas Prinsip Terbukti | Memeriksa bahwa hasil latihan di akun demo berlaku juga di live: akun demo ada, spesifikasi demo = live, data sejarah cukup. | Menyebut perbedaan demo vs live dan golongan yang datanya kurang. | Tanpa akun demo = gugur wajib. Tidak meminta ekspor data sendiri; permintaan data lewat KC-2. |

### SOP

1. Kepala Cabang membuka penilaian untuk 4 broker: Finex, OTB, MIFX, Exness (akun demo).
2. Petugas Merangkak menilai lot minimum dan setoran awal tiap broker.
3. Petugas Dari Bawah menghitung biaya satu trade per golongan dalam Rupiah dan persennya terhadap modal ±Rp500.000.
4. Petugas Ke Atas memeriksa legalitas dan ketersediaan akun live (tautan bukti + tanggal).
5. Petugas Terbukti memeriksa akun demo, kesamaan spesifikasi demo vs live, dan panjang data sejarah (dari KC-2).
6. Kepala Cabang menggugurkan broker yang gagal syarat wajib (tanpa demo, lot > 0,01, tidak legal, data kurang).
7. Dari yang tersisa, pilih yang paling dekat dengan keempat prinsip; bila seri, biaya terkecil yang menang.
8. Susun Formulir R "Broker Terpilih": satu broker + nilai tiap prinsip + alasan + batas data.
9. Pusat menetapkan Setuju/Tolak/Tunda; bila Setuju, map PILIHAN_BROKER dikirim ke KC-2 dan KC-3.
10. Ulangi tiap bulan, atau saat biaya/legalitas broker berubah.

### Alur kerja

```
Kepala Cabang membuka penilaian 4 broker
   ↓
4 petugas prinsip menilai (Merangkak · Dari Bawah · Ke Atas · Terbukti) — bekerja bersamaan
   ↓
4 Kartu Broker terisi
   ↓
Saring wajib → broker gugur dicatat alasannya
   ↓
Pilih yang paling dekat prinsip (seri → biaya terkecil)
   ↓
Formulir R "Broker Terpilih"
   ↓
Keputusan Pusat
   ↓
Map PILIHAN_BROKER ke KC-2 dan KC-3
```

### Aturan nilai KC-1 (dibekukan di `src/lib/kc1Assessment.ts`)

- **Gugur wajib:** tanpa akun demo · tidak ada golongan dengan lot minimum 0,01 · tidak terdaftar Bappebti / belum terverifikasi · tidak ada golongan dengan data ≥ 365 hari.
- **Merangkak (0–100):** 70 × (golongan dengan lot 0,01 ÷ 6 golongan) + 30 bila setoran minimum ≤ Rp500.000 (tidak diketahui = 0).
- **Dari Bawah (0–100):** per golongan, biaya termurah antar-broker = 100; golongan yang tidak dimiliki = 0; rata-rata 6 golongan.
- **Ke Atas (0–100):** legal + akun live tercatat = 100 · legal, akun live belum tercatat = 50 · tidak legal = 0.
- **Terbukti (0–100):** akun demo 40 + demo = live 30 (tidak bisa dibandingkan = 0) + 30 × (golongan data ≥ 365 hari ÷ 6).
- **Nilai akhir** = rata-rata 4 prinsip. Dipilih nilai tertinggi yang tidak gugur; seri → biaya median terkecil.
- Golongan dinilai: Forex, Forex JPY, Logam, Minyak, Indeks, Saham AS. Modal acuan Rp500.000.

## KC-2 Jembatan MT5

**Misi:** Menyediakan data dari MT5 yang lengkap dan sehat untuk broker terpilih, serta mencari fungsi MT5 yang dibutuhkan.

**Hasil untuk Pusat:** Map DAFTAR_DATA (isi dan kesehatan file) dan KATALOG_FUNGSI (fungsi MT5 tersedia vs dibutuhkan).

| Jabatan | Pemegang | Tugas | Tanggung jawab | Batas wewenang |
|---|---|---|---|---|
| Kepala Cabang | Program runKc2 (src/lib/kc2Bridge.ts) — AKTIF | Menyusun Daftar Data broker terpilih dan Formulir R bila data macet atau perlu fungsi baru. | Data yang dipakai cabang lain jelas rentangnya, jumlah candle dan lubangnya. | Boleh mengusulkan EA/skrip baru. Tidak boleh mengubah EA, skrip, atau .env tanpa izin Pusat. Tidak pernah mengirim order dan tidak memutuskan apa pun — hanya mengusulkan. |
| Petugas Harga Live | EA MDBKAMultiLive (di terminal MT5) | Menulis harga bid/ask live semua simbol Market Watch. | Tetap terpasang di terminal; bila berhenti, gerbang data menahan semua sinyal. | Hanya membaca dari MT5. Tidak pernah mengirim order. |
| Petugas Arsip Candle | Skrip ExportLongH1MDBKA (H4/H1/M15/M5/M1) + AutoExportMDBKAService | Mengekspor candle sejarah dan candle baru ke Common Files. | File lengkap tanpa lubang yang tidak dijelaskan; jam server dicatat. | Hanya membaca dari MT5. |
| Petugas Spesifikasi | Skrip ExportMarginMDBKA + file SymbolSpecs | Mengekspor spread, margin dan ukuran kontrak tiap simbol. | File diperbarui sebelum KC-1 menghitung biaya. | Hanya membaca dari MT5. |
| Petugas Swap & History | EA MDBKASwapLogger + pembaca mt5Journal | Mencatat swap per jam dan riwayat transaksi/terminal. | Catatan tidak diubah setelah ditulis. | Hanya membaca dari MT5. |
| Petugas Katalog Fungsi | Katalog tetap KATALOG_FUNGSI (src/lib/kc2Bridge.ts) — AKTIF; membaca map CATATAN_PERBAIKAN dari KC-3 bila ada | Mencatat fungsi MT5 yang tersedia dan yang dibutuhkan (mis. kalender berita historis, paket Python MetaTrader5). | Setiap permintaan bahan dari KC-3 dijawab: tersedia / perlu dibuat / tidak mungkin. | Hanya mengusulkan; pembuatan EA/skrip baru menunggu keputusan Pusat. |

### SOP

1. Terima map PILIHAN_BROKER dari KC-1.
2. Periksa file data broker terpilih: rentang dari–sampai, jumlah candle, lubang, jam server.
3. Tulis map DAFTAR_DATA dan kirim ke KC-1 (Petugas Data) dan KC-3.
4. Terima permintaan bahan dari KC-3 (map CATATAN_PERBAIKAN).
5. Cek KATALOG_FUNGSI: tersedia → sediakan; belum ada → susun Formulir R usulan EA/skrip baru dengan satu pilihan jadi.
6. Pusat menetapkan; bila disetujui, Pelaksana Pembangunan membuat EA/skrip.
7. Data macet lebih dari 10 menit → Formulir R berisi langkah perbaikan.

### Alur kerja

```
PILIHAN_BROKER dari KC-1
   ↓
Pemeriksaan file data MT5
   ↓
Map DAFTAR_DATA ke KC-1 dan KC-3
   ↓
Permintaan bahan dari KC-3
   ↓
KATALOG_FUNGSI / Formulir R usulan fungsi baru
   ↓
Keputusan Pusat
```

## KC-3 Sekolah Merangkak

**Misi:** Melatih: menggali pola dari data latih lalu try-out, tanpa menyentuh data ujian.

**Hasil untuk Pusat:** Map POLA_CALON (angka dibekukan) dan CATATAN_PERBAIKAN (Jalur Perbaikan bila pola gagal).

| Jabatan | Pemegang | Tugas | Tanggung jawab | Batas wewenang |
|---|---|---|---|---|
| Kepala Sekolah | kepalaSekolah() (src/lib/kc3Kepala.ts) — AKTIF | Membuat Pembagian Data 60/20/20, menjaga segel ujian, menyusun Formulir R "Pola Calon". | Setiap pola yang diajukan sudah lolos latih dan try-out dengan angka yang dibekukan. | Tidak boleh membaca data ujian, mengubah angka setelah dibekukan, atau memasukkan pola ke Buku Aturan. Tidak pernah mengirim order dan tidak memutuskan apa pun — hanya mengusulkan. |
| Penambang Fakta | Skrip penambang (belum dibangun) | Membedah data latih per kondisi dari Buku Bahan Bakar (badai, jam, spread, tick volume, level, golongan): peluang dan rata-rata R. | Semua kondisi yang dicoba dicatat, termasuk yang gagal. | Hanya membaca bagian LATIH. |
| Penyaring Kebetulan | Aturan statistik tetap (belum dibangun) | Membuang pola yang hanya bagus di sebagian data latih; makin banyak pola dicoba, makin ketat syaratnya. | Alasan setiap pola gugur ditulis. | Boleh menggugurkan pola. Tidak boleh melonggarkan syarat. |
| Pengawas Try-out | Skrip try-out (belum dibangun) | Menguji pola yang lolos saringan, sekali, di bagian TRY-OUT. | Hasil try-out dicatat apa adanya; gagal = masuk Jalur Perbaikan. | Hanya membaca bagian TRY-OUT; satu pola satu kali. |
| Pustakawan | tradeAudit + arsip Lolosyiob/riset | Menjaga daftar "jangan diulang" dan memeriksa pola baru bukan ulangan pola yang sudah gagal. | Arsip kegagalan lengkap dengan tanggal dan angka. | Boleh menolak pola yang sama dengan pola gagal. |

### SOP

1. Terima map PILIHAN_BROKER (KC-1) dan DAFTAR_DATA (KC-2).
2. Kepala Sekolah membekukan Pembagian Data: latih 60% · try-out 20% · ujian 20% (segel).
3. Penambang Fakta membedah bagian LATIH memakai bahan dari Buku Bahan Bakar.
4. Pustakawan memeriksa: bukan ulangan pola yang sudah gagal.
5. Penyaring Kebetulan menggugurkan pola yang tidak konsisten.
6. Angka pola yang tersisa dibekukan.
7. Pengawas Try-out menguji sekali di bagian TRY-OUT.
8. Lolos → Formulir R "Pola Calon" → keputusan Pusat → ke KC-4.
9. Gagal → Jalur Perbaikan: diagnosis, satu jalan (A–E), paling banyak 7 percobaan, lalu arsip.

### Alur kerja

```
PILIHAN_BROKER + DAFTAR_DATA masuk
   ↓
Pembagian Data (segel ujian)
   ↓
Tambang di LATIH
   ↓
Cek arsip + saring kebetulan
   ↓
Bekukan angka
   ↓
Try-out
   ↓
POLA_CALON ke Pusat lalu KC-4, atau CATATAN_PERBAIKAN
```
