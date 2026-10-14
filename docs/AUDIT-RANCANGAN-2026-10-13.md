# Audit Rancangan MDBKA — 13 Okt 2026

13 Okt 2026 · Fahmi Alhabsi

> **Yang diaudit:** `docs/RANCANGAN-2026-10-13-alur-trader-profesional.md` dan `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md`, dicocokkan dengan `docs/AUDIT-2026-10-13-analisa-dan-pembatasan-risiko.md` dan kode MDBKA (HEAD `6c69588`).
> **Sifat:** audit dokumen dan kode secara read-only. Tidak ada kode yang diubah.

## 0. Kesimpulan

**Rancangan sudah menutup hampir semua celah yang ditemukan di audit MDBKA, tetapi belum siap dikerjakan begitu saja.** Ada 4 pertentangan berat yang, bila dibiarkan, akan merusak hasil atau membuka risiko di akun uang sungguhan. Sembilan ketidakkonsistenan kecil sudah langsung diperbaiki di dokumen.

- **Dampak positif yang realistis:** keputusan lebih konsisten antar layar, data yang salah atau basi tidak lolos diam-diam, setiap aturan punya bukti terukur sebelum naik ke Live, dan kerugian per rangkaian dibatasi 1R.
- **Batas yang jujur:** rancangan ini memperbaiki **cara mengukur dan cara melindungi**, bukan menjamin untung. Data MDBKA sampai hari ini menunjukkan keunggulan ≈ 0 sebelum Mode Aman. Manfaat utamanya adalah aturan yang buruk ketahuan lebih cepat dan lebih murah.
- **Yang paling dibutuhkan:** satu urutan induk (bagian 4). Rancangan kini berisi 53 langkah di tiga dokumen, dan beberapa langkah hanya aman bila langkah lain selesai lebih dulu.

## 1. Cakupan terhadap celah MDBKA

| Celah (sumber) | Ditutup oleh | Status |
| --- | --- | --- |
| File posisi, equity, kuotasi tanpa login/jenis akun (audit, risiko 1) | Fondasi A1, langkah F3 | Tertutup, **wajib selesai sebelum Finex demo dilonggarkan** (temuan T2) |
| Bukti n ≥ 20 tercemar trade yang dilonggarkan (audit, risiko 2) | Fondasi C3, J2 | Sebagian; F5 dan jeda Live belum memisahkan entri (temuan T4) |
| Gerbang biaya tidak bisa dilonggarkan tanpa menyentuh rumus (audit, risiko 3) | — | **Masih menunggu keputusan Fahmi** |
| Akun tanpa label dianggap demo (audit, risiko 4) | Fondasi A1 | **Masih menunggu keputusan Fahmi** (temuan T3) |
| Kebiasaan mengejar rugi (audit, risiko 5) | Audit: teks "Di Live ini ditahan" | Ada di rencana audit, belum di tabel langkah rancangan |
| Hasil demo dibaca sebagai bukti Live (audit, risiko 6) | Fondasi C1, C4, C6 | Tertutup |
| Perilaku Live berubah tanpa sengaja (audit, risiko 7) | Test pengaman, satu langkah per giliran, A8 shadow | Tertutup |
| "3 lampu hijau" belum terdefinisi (audit, risiko 8) | Fondasi C5 | Tertutup, disetujui 13 Okt 2026 |
| Penjaga fail-open tanpa suara | Fondasi A3 | Tertutup |
| Hasil analisa berbeda dari pemindai | Fondasi A7–A9 | Tertutup sebagai shadow; tampilan menunggu A9 |
| Data hanya H1 200 candle | Alur 3.1, fondasi A2, A6 | Tertutup (butuh perubahan EA) |
| Tidak ada multi-timeframe, pola, pemicu | Alur 3.2–3.7 | Tertutup |
| Tidak ada pemantau posisi berjalan | Alur 7 | Tertutup, tetapi bertentangan dengan strategi H4 (temuan T1) |
| Tidak ada pembelajaran terstruktur dari hasil | Alur 7.7 C, 7.8 kartu pola | Tertutup, tetapi sidik jari terlalu rinci (temuan T7) |
| Risiko gabungan per akun | Fondasi E | Tertutup, urutan perlu dibalik (temuan T5) |
| Konteks fundamental | Fondasi B | Tertutup (P1) |
| Data berlisensi | Fondasi D | Tercatat sebagai pekerjaan tertunda |

## 2. Temuan

| # | Temuan | Tingkat | Lokasi | Tindakan |
| --- | --- | --- | --- | --- |
| T1 | Jendela 3 jam "tutup semua posisi untuk semua golongan" (7.6, 7.7) bertentangan dengan strategi pertama, yaitu emas H4 (keputusan 1 dan 5). Setup H4 butuh lebih dari 3 jam, dan alasan memilih emas justru karena tidak terkena time-stop 3 jam. Akibatnya trade dipotong sebelum TP, sehingga RR 2 tidak pernah tercapai dan rapor menjadi salah | Tinggi | Alur 7.3 poin 5, 7.6, 7.7 vs bagian 6 | **Perlu keputusan** (K-1) |
| T2 | Fitur demo berlaku di "semua akun demo" (7.4), termasuk Finex demo. Terminal Finex bisa login ke akun Live kapan saja, dan file datanya tidak memuat login. Tanpa A1, pelonggaran demo bisa ikut aktif saat MT5 login ke akun Live | Tinggi | Alur 7.4, keputusan 7 | **Perlu keputusan** (K-2) |
| T3 | Pilihan "akun tanpa label = demo" ditambah pelonggaran demo berarti akun Live yang lupa diberi label kehilangan penjaganya | Tinggi | Audit risiko 4, fondasi A1 | **Perlu keputusan** (K-3) |
| T4 | Penahan bukti F5 dan jeda di Live masih menghitung trade demo + Live digabung. Setelah demo dilonggarkan (lebih banyak trade, masuk lagi), rugi di demo bisa menjeda Live, dan trade demo yang dilonggarkan ikut mengubah bukti untuk Live | Tinggi | Audit, alur P5a, fondasi C3 | **Perlu keputusan** (K-4) + langkah baru: F5 dan jeda Live hanya menghitung entri setara Live |
| T5 | Masuk lagi di simbol yang sama (T2) menambah eksposur, tetapi panel risiko gabungan (E1) baru dikerjakan sesudahnya | Sedang | Alur 7.5, fondasi E | Usulan: E1 sebelum T2 (peta urutan) |
| T6 | Belum ada definisi "R" untuk rangkaian yang berisi beberapa posisi, padahal label kartu (Kasbi Bakar, dst.) bergantung pada R | Sedang | Alur 7.7 B, 7.8 | **Perlu keputusan** (K-5); usulan: R rangkaian = total untung/rugi bersih (termasuk komisi dan swap) ÷ risiko uang open 1 |
| T7 | Sidik jari kartu punya 8 dimensi, sehingga ada ratusan kombinasi. Riwayat nyata MDBKA sebelum Mode Aman hanya 34 trade (OTB 15, Finex live 19), jadi ≥ 20 kartu per sidik jari bisa butuh sangat lama dan penahan K6 hampir tidak pernah aktif | Sedang | Alur 7.8 | **Perlu keputusan** (K-6); usulan: sidik jari bertingkat, mulai kasar (golongan + arah + arah D1) lalu makin rinci saat data cukup |
| T8 | Modal akun Live belum diperiksa terhadap lampu 3. Dengan risiko 1% dan lot minimum, modal kecil membuat hampir semua sinyal DITAHAN_RISIKO, seperti Exness $560 yang berstatus MODAL KURANG | Sedang | Fondasi C5 | Usulan sudah ditulis di C5 (menunggu persetujuan): lampu 1 memakai pemeriksaan modal `backtestReport.ts` dengan equity akun Live |
| T9 | Hitung ulang biaya Live (C4) butuh spread akun Live, padahal arsip tick Finex mencampur demo dan Live karena belum ada login | Sedang | Fondasi C4 | Diperbaiki: ketergantungan pada A1 ditulis di C4 |
| T10 | Bukti shadow A8 hanya muncul saat Hasil analisa dibuka, jadi sampelnya sedikit. Padahal pencatat entry server sudah menilai sesi saat entry | Rendah | Fondasi A8 | Diperbaiki: entri `DITAHAN_SESI` yang sudah ada dipakai sebagai bukti utama |
| T11 | Tim 2 di menit 20–30 hanya punya kuotasi dan candle H1 yang belum tutup sampai candle M15 live tersedia | Rendah | Alur 7.6 | Catatan: versi awal Tim 2 terbatas pada saran titik impas dan struktur H1 tertutup |
| T12 | Sembilan ketidakkonsistenan kecil antar bagian | Rendah | Kedua rancangan | **Diperbaiki** (bagian 3) |
| T13 | Tidak ada urutan induk lintas dokumen | Sedang | Kedua rancangan | **Diperbaiki:** peta urutan induk (bagian 4) |

## 3. Sudah diperbaiki langsung di dokumen

1. Pemicu ditulis M15 (alur 3.6), padahal keputusan 1 adalah H1 → diselaraskan ke H1.
2. RR minimum TP ditulis 1,5 (alur 3.7), padahal keputusan 4 adalah 2 → diselaraskan ke 2.
3. Batas SL dalam ATR tanpa timeframe (alur 3.7) → ditulis ATR H4, sesuai keputusan 4.
4. Batas jumlah posisi per simbol: 7.4 menulis 2, 7.6 menulis 3 → keduanya merujuk ke keputusan K-7.
5. Pertanyaan "maksimal 30 menit" (alur 7.6) masih tertulis terbuka → ditandai sudah diputuskan (cara 1, 7.7).
6. Bagian 6 alur masih menyebut "3 lampu hijau" belum diputuskan → diperbarui (disetujui).
7. Ringkasan alur masih menyebut "backtest lalu n ≥ 20" sebagai syarat Live → diperbarui ke 3 lampu hijau.
8. Pertanyaan "broker lain shadow?" (fondasi A8) → dicatat sebagai keputusan Fahmi.
9. Ringkasan dan daftar langkah fondasi belum memuat A7–A9, E, F, G, S, P-F, G-x → dilengkapi.

## 4. Peta urutan induk

Setiap fase baru dimulai bila fase sebelumnya yang menjadi syaratnya selesai. Di dalam fase tetap satu langkah kecil per giliran, dicek dengan `npm test`, `tsc -b`, dan lint, tanpa auto-commit.

| Fase | Langkah | Syarat | Mengubah perilaku? |
| --- | --- | --- | --- |
| 0 — Tanpa perubahan perilaku | A7-1; S1–S4 (shadow) + evaluasi entri `DITAHAN_SESI` yang sudah ada; G-1, G-2; P5a (tampilan); F1; F4 | — | Tidak |
| 0b — Backtest (boleh berjalan sejajar sejak fase 0) | P1–P5 strategi `topdown`, emas H4 MIFX | Keputusan K-1 | Tidak |
| 1 — Identitas dan kualitas data | F3 (EA menulis login dan jenis akun) → F2 (gerbang kualitas data) | — | Bisa menahan sinyal (lebih aman) |
| 2 — Mode demo (dari audit) | Saklar mode → jeda demo tidak mengunci (OTB, MIFX, Exness lebih dulu; Finex demo setelah F3) → J2 (tandai entri setara Live) → F5 dan jeda Live hanya menghitung entri setara Live | Fase 1 untuk Finex; K-2, K-3, K-4 | Ya, demo saja |
| 3 — Risiko gabungan, lalu masuk lagi | E1, E2 → T2 (masuk lagi simbol sama, demo) | Fase 2 | Ya, demo saja |
| 4 — Data timeframe dan Tim 2 | F5 (candle D1/W1/M15 live) → T1, T3, siklus Tim 2, T4 | Fase 1 | Tampilan dan saran |
| 5 — Kartu pola | G-3 sampai G-6, rangkaian, K1–K5 | Fase 2, K-5, K-6 | Tampilan |
| 6 — Jalur Live | J1, J3–J6, F (pemantauan), E3, K6, B (konteks per golongan) | Lampu hijau tercapai | Ya, langkah dan test tersendiri |
| Tertunda | D1–D4 | Lihat fondasi D | — |

## 5. Keputusan yang dibutuhkan dari Fahmi

| # | Keputusan | Pilihan | Usulan Claude |
| --- | --- | --- | --- |
| K-1 | Arti jendela 3 jam untuk golongan tanpa time-stop (emas, minyak, indeks) | (a) 3 jam = masa pantau intensif Tim 2; sesudahnya posisi tetap berjalan dengan SL/TP-nya. Forex tetap time-stop 3 jam. (b) 3 jam = tutup paksa untuk semua golongan, dan strategi rangkaian diganti ke setup H1 | (a): sesuai keputusan 5 dan tidak memotong setup H4 |
| K-2 | Kapan Finex demo ikut dilonggarkan | (a) Setelah F3 (login terverifikasi). (b) Langsung | (a): mencegah pelonggaran aktif di akun Live |
| K-3 | Akun tanpa label | (a) Dianggap Live. (b) Tetap dianggap demo (pilihan audit) | (a) |
| K-4 | Bukti F5 dan jeda di Live | (a) Hanya menghitung entri setara Live. (b) Tetap gabungan demo + Live | (a): demo yang dilonggarkan tidak boleh memengaruhi Live |
| K-5 | Definisi R rangkaian | (a) Total bersih ÷ risiko uang open 1. (b) Rata-rata R tiap posisi | (a): sejalan dengan "rugi terbesar rangkaian = 1R" |
| K-6 | Sidik jari kartu | (a) Bertingkat, mulai kasar. (b) Tetap 8 dimensi | (a) |
| K-7 | Batas jumlah posisi per simbol | 2 atau 3 | 2 dulu; dinaikkan hanya bila bukti kelompok "TAMBAH" baik |
| K-8 | Lampu 1 memakai equity akun Live dan tidak boleh MODAL KURANG | Setuju / tidak | Setuju |
| K-9 | Masih terbuka dari audit: mode A/B, gerbang biaya di demo | — | Mode A dengan penguncian login; gerbang biaya dikeluarkan dari pelonggaran |

## 6. Keputusan dan rekomendasi (13 Okt 2026, lanjutan)

| # | Status | Isi |
| --- | --- | --- |
| K-1 | **Disetujui Fahmi** | Emas, minyak, indeks: jam ke-3 hanya akhir masa pantau intensif, posisi tetap berjalan dengan SL/TP. Forex/Forex JPY tetap time-stop 3 jam. Sudah ditulis di rancangan alur 7.3, 7.6, 7.7 |
| K-2 | **Disetujui Fahmi** | Finex demo menunggu F3; OTB, MIFX, Exness boleh lebih dulu. Sudah ditulis di rancangan alur 7.4 dan fondasi A1 |
| K-3 | **Disetujui Fahmi** (setelah diaudit) | Enam login ditemukan, satu tidak berlabel: 72159716 (OTB), berisi satu setoran "Demo Deposit Awal" 5.000 USD. Tidak ada akun Live yang tidak berlabel (rincian: rancangan tim, bagian 2). **Rekomendasi:** (1) tambahkan `72159716:OTB demo 2` ke `ACCOUNT_LABELS` di `.env`; (2) aturan akun tanpa label = Live, sebagai jaring pengaman bila kelak ada akun baru yang lupa diberi label |
| K-4 | **Disetujui Fahmi** | Bukti F5 dan jeda Live hanya menghitung entri setara Live |
| K-5 | **Disetujui Fahmi** | R rangkaian = total untung/rugi bersih (termasuk komisi dan swap) ÷ risiko uang open 1. Contoh: open 1 berisiko Rp20 rb; open 1 ditutup impas, open 2 untung Rp30 rb → rangkaian +1,5R (Kasbi Bakar; contoh dikoreksi Fahmi 15 Okt 2026, sesuai tabel label ≥ +1R) |
| K-6 | **Disetujui Fahmi** | Sidik jari 3 tingkat. Tingkat 1: golongan + arah + arah D1. Tingkat 2: + rezim volatilitas + sesi. Tingkat 3: + pola + rentang skor. Yang dipakai adalah tingkat terdalam yang sudah punya ≥ 20 kartu |
| K-7 | **Disetujui Fahmi** | Maksimal 2 posisi per simbol dulu; naik ke 3 hanya bila bukti kelompok "TAMBAH" baik dan risiko gabungan (E1) tetap dalam batas |
| K-8 | **Disetujui Fahmi** | Lampu 1 wajib dijalankan dengan equity akun Live dan tidak boleh berstatus MODAL KURANG (`backtestReport.ts`). Tanpa ini, lampu 3 bisa macet karena hampir semua sinyal tertahan lot minimum |
| K-9 | **Disetujui Fahmi** | **Mode A dengan penguncian login:** tombol Demo/Live, default Live; tombol Demo hanya aktif untuk login yang terbukti demo (sebelum F3: OTB, MIFX, Exness). **Gerbang biaya tetap aktif di demo** (tidak ikut dilonggarkan), karena melonggarkannya butuh mengubah rumus `decisionEngine.ts` dan biaya adalah sebab rugi yang sudah terbukti |

**Koreksi data (13 Okt 2026):** dua trade 12 Okt di screenshot (AUDJPY dan XAUUSD) berasal dari akun **Finex demo 61823011**, terverifikasi dari `MDBKA_History_61823011.csv`, bukan akun Live. Rancangan alur 7 dan contoh JSONL di fondasi G5 sudah dikoreksi.

## 7. Tambahan ke peta urutan induk

Rancangan baru `docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md` menambah langkah TA, TT, TI, dan G-7:

| Fase | Langkah tambahan |
| --- | --- |
| 0 | TA-1, TA-2 (tampilan), TT-1, TT-2, TI-1, G-7 |
| 1 | TT-3 (log Experts/Journal, bersama F2/F3) |
| 4 | TT-4, TI-2 |
| 5 | TI-3 |
| 6 | TA-3, TI-4 |

Total langkah di semua rancangan sekarang 53 + 12 = 65.

## 8. Persetujuan lanjutan (13 Okt 2026, 09:57 WIT)

- Rekomendasi K-3 sampai K-9 **disetujui semua** oleh Fahmi.
- Enam koreksi hasil bedah ulang rancangan tim (`docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md` bagian 0) **disetujui**.
- Tujuan jangka panjang sebagai tangga yang dinaiki hanya dengan bukti, termasuk peninjauan batas golongan Rupiah di setiap tangga (rancangan tim, bagian 8), **disetujui**.
- Tugas, tanggung jawab, dan kewenangan semua tim, beserta SOP dan alur kerjanya, diatur di `docs/SOP-2026-10-13-tim-mdbka.md`.

## 9. Keputusan 13 Okt 2026 (10:27–10:41 WIT)

| Keputusan | Status |
| --- | --- |
| T-PELUANG dengan tiga tahap menggantikan usulan "langsung membuka pintu BELI/JUAL" | Disetujui |
| Tahap 2 T-PELUANG boleh merevisi K-9 | Disetujui |
| Trade bayangan, demo laboratorium (pembagian penjaga keras/lunak), panel laju bukti | Disetujui |
| Satu tim baru (T-BAYANGAN); demo laboratorium oleh T-AKUN-DEMO; laju bukti oleh T-EVALUASI; kartu bayangan/uji oleh T-KARTU | Disetujui |
| T-TITIK-LEMAH diperluas menjadi Tim Pembelajaran Rugi (T-BELAJAR-RUGI) dengan pelacakan rekomendasi | Disetujui |
| Trade uji dibuka manual oleh Fahmi (Opsi A); MDBKA tetap tidak mengirim order | Disetujui |

**Tambahan ke peta urutan induk:** fase 0: PL-1, TB-1, TB-2 (Finex, OTB), LAB-1, PR-1. Fase 2: LAB-2, LAB-3, LB-1. Fase 5: PR-2. Fase 6: PR-3, PL-3. Mesin bukti ditempatkan di fase awal supaya bukti mulai terkumpul sebelum fitur lain selesai.
