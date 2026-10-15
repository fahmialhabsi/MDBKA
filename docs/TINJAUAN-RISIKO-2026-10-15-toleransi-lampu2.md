# Tinjauan Tim Risiko — Toleransi 0,1R pada Lampu 2 (15 Okt 2026)

**Dasar:** SOP-MDBKA-10 (Evaluasi, Buku Aturan, 3 Lampu Hijau) dan SOP-MDBKA-09 (Risiko Gabungan).
**Alur yang diikuti:** T-EVALUASI mengusulkan → tim terkait meninjau dengan data → Fahmi memutuskan → T-BUKU mencatat.
**Status:** **DISETUJUI Fahmi, 15 Okt 2026 pukul 10:35 WIT** (keputusan K-10).

## 1. Usulan yang ditinjau

Syarat lampu 2 "rugi terbesar per rangkaian ≤ 1R" diberi toleransi **0,1R**. Rangkaian dianggap melanggar hanya bila R < −1,1. Konstanta: `LAMP2_LOSS_TOLERANCE_R` di `src/lib/greenLamps.ts`.

## 2. Pembagian tugas menurut SOP

| Tim | Wewenang (SOP) | Bagian tinjauan |
| --- | --- | --- |
| T-EVALUASI | Menyusun rapor dan menilai 3 lampu; tidak boleh menaikkan status tanpa Fahmi | Pengusul, dan pemakai syarat lampu 2 |
| T-BIAYA | Mencatat spread, komisi, swap, selisih harga | Menjelaskan dari mana kelebihan di atas 1R berasal |
| T-PENJAGA / T-ANALISA | Gerbang risiko 1% dan batas golongan Rupiah | Memeriksa apakah rugi nyata tetap di bawah batas golongan |
| T-RISIKO | Rugi gabungan dan skenario stres; **tidak boleh mengubah batas risiko** | Menilai dampak ke risiko gabungan |
| T-GERBANG | Kualitas data | Memeriksa satuan uang tiap akun |
| T-BUKU | Mencatat keputusan setelah persetujuan Fahmi | Pencatatan (bagian 5) |

## 3. Data yang dipakai

- History MT5 seluruh akun beserta catatan entry MDBKA.
- Saringan: trade rugi yang kena SL atau rugi ≥ 0,9R, dan punya SL tercatat.
- Hasil: 18 trade. Rinciannya 10 dari Finex demo 61823011, 3 dari MIFX demo 1003997005, dan 5 dari Exness (lihat temuan 4.4).
- R dihitung sebagai hasil bersih ÷ risiko uang SL. Risiko uang SL = jarak SL × uang per satuan harga, **tanpa** biaya.

## 4. Temuan

### 4.1 T-BIAYA — dari mana kelebihan di atas 1R berasal

| Akun | Simbol | R | Rugi kotor vs risiko SL | Komisi + swap |
| --- | --- | --- | --- | --- |
| MIFX demo | GBPUSD.m | −1,075 | $1,61 vs $1,59 (+$0,02) | $0,10 |
| MIFX demo | NQ.m | −1,023 | $19,35 vs $19,02 (+$0,33) | $0,10 |
| MIFX demo | SP.m | −1,020 | $7,38 vs $7,33 (+$0,05) | $0,10 |
| Finex demo | DE30 | −1,014 | $17,79 vs $17,55 (+$0,24) | $0,01 |
| Finex demo | AUDJPY | −1,011 | $0,94 vs $0,94 | $0,01 |
| Finex demo | XAUUSD | −1,001 | $12,81 vs $12,81 | $0,01 |

- Kelebihan berasal dari dua hal: **komisi** ($0,01 di Finex, $0,10 di MIFX untuk 0,01 lot) dan **slippage saat SL tereksekusi** (sampai $0,33 pada NQ.m).
- **Terburuk −1,075R. Tidak ada satu pun yang lebih buruk dari −1,1R**, jadi toleransi 0,1R mencakup semua data nyata.
- Rumus risiko di `decisionEngine.ts` (tidak diubah) sudah memasukkan spread, slippage dan komisi ke dalam risiko. Artinya, menurut ukuran mesin keputusan, rugi −1,0x R ini memang masih dalam rencana. R di kartu terlihat lebih buruk hanya karena penyebutnya tanpa biaya.

### 4.2 T-PENJAGA / T-ANALISA — batas golongan Rupiah (kurs Rp17.880)

| Simbol | Rugi nyata | Batas golongan | Terpakai |
| --- | --- | --- | --- |
| XTIUSD (Finex demo) | Rp143.219 | Rp150.000 (Minyak) | 95% |
| GBPUSD.m (MIFX demo) | Rp30.575 | Rp35.000 (Forex) | 87% |
| US100 (Finex demo) | Rp428.941 | Rp500.000 (Indeks) | 86% |
| NQ.m (MIFX demo) | Rp347.766 | Rp500.000 (Indeks) | 70% |

- Semua rugi Finex dan MIFX **masih di bawah batas golongan**.
- **Peringatan:** bila risiko yang direncanakan tepat di batas golongan, slippage +7,5% bisa membuat rugi nyata melewati batas. Contohnya, rencana Rp35.000 untuk Forex bisa menjadi ±Rp37.600.
- Sesuai SOP, tim tidak mengubah batas. Ini dicatat sebagai **rekomendasi R-1**, menunggu keputusan Fahmi (bagian 6).

### 4.3 T-RISIKO — risiko gabungan

- Panel risiko gabungan (E1/E2) menghitung "rugi bila semua SL kena" dari jarak SL, tanpa slippage.
- Data di 4.1 menunjukkan rugi nyata bisa sampai ±1,075× angka itu.
- Skenario stres SOP-09 langkah 3 belum dibangun. Data ini menjadi bahan pertamanya: **rugi gabungan × 1,075 sebagai skenario slippage nyata terburuk** (rekomendasi R-2).
- Batas risiko tidak diubah.

### 4.4 T-GERBANG — temuan data: satuan uang Exness salah dibaca

- Akun Exness demo 413925678 memakai **AccountCurrency = IDR** (kolom `AccountCurrency` di `MDBKA_History_413925678.csv`).
- Evaluasi MDBKA membaca semua hasil sebagai **USD**. Akibatnya angka uang Exness di panel Evaluasi tampil sebagai dolar, dan konversi ke Rupiah salah sekitar ±17.880 kali lipat. Contoh: rugi Rp564.420 tampil sebagai "$564.419".
- **Yang tidak terpengaruh:** R, win rate, dan lampu 2. Lampu 2 memakai R, yaitu perbandingan dalam mata uang yang sama, dan Exness juga belum punya rangkaian setara Live.
- **Rekomendasi R-3 (perbaikan data):** evaluasi membaca `AccountCurrency` per akun dan menampilkan uang dalam mata uang aslinya. Ini perbaikan tampilan; aturan tidak berubah.

## 5. Keputusan dan pencatatan (T-BUKU)

| Kode | Keputusan | Status |
| --- | --- | --- |
| K-10 | Lampu 2: "rugi terbesar per rangkaian ≤ 1R" dengan toleransi **0,1R** (melanggar bila R < −1,1), karena R kartu tidak memasukkan biaya dan slippage SL. Dasar: 15 trade SL Finex/MIFX, terburuk −1,075R | **Disetujui Fahmi, 15 Okt 2026** |

Tercatat di:
- `docs/AUDIT-RANCANGAN-2026-10-13.md` bagian 10;
- `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md` C5;
- komentar `LAMP2_LOSS_TOLERANCE_R` di `src/lib/greenLamps.ts`.

**Peninjauan ulang:** bila ada rangkaian nyata yang lebih buruk dari −1,1R, T-EVALUASI menandai lampu 2 golongan itu MERAH (otomatis) dan mengajukan tinjauan ulang K-10 ke Fahmi.

## 6. Rekomendasi yang menunggu keputusan Fahmi

| Kode | Rekomendasi | Penerima | Mengubah aturan? |
| --- | --- | --- | --- |
| R-1 | Rencana risiko per posisi dibatasi ≤ batas golongan ÷ 1,1 supaya slippage tidak melewati batas Rupiah | T-ANALISA, lalu Fahmi dan T-BUKU | Ya (perlu persetujuan; rumus `decisionEngine.ts` tidak disentuh, hanya batas masukan) |
| R-2 | Skenario stres risiko gabungan × 1,075 di panel (SOP-09 langkah 3) | T-RISIKO | Tidak (tampilan) |
| R-3 | Evaluasi membaca mata uang akun (Exness IDR) | T-GERBANG | Tidak (perbaikan data/tampilan) |
