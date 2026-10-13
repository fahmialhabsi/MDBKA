# Peta Tahap OpenCode — MDBKA

Setiap tahap = satu kali jalan OpenCode = satu kali audit Claude = satu commit oleh Fahmi.

- **Spesifikasi detail** (`TAHAP-XX.md`) ditulis Claude **tepat sebelum** tahap itu dijalankan, karena kode berubah setelah setiap tahap. Tabel di bawah adalah cakupan dan urutannya.
- **Tahap bertanda 🔒** butuh persetujuan atau tindakan manual Fahmi (EA MT5, `.env`, perubahan perilaku Live) sebelum spesifikasinya dibuat.
- Kode langkah merujuk ke rancangan di `docs/` (lihat `00-ATURAN-UMUM.md` bagian 1).

| Tahap | Fase | Isi (kode langkah) | Mengubah perilaku? | Syarat |
| --- | --- | --- | --- | --- |
| 01 | 0 | L0 perbaikan lint lama; LAB-1 klasifikasi penjaga keras/lunak; TB-1 modul trade bayangan murni; PR-1 tipe dan jalur rekomendasi | Tidak | — |
| 02 | 0 | G-1 tipe + penulis/pembaca JSONL (`keputusan`, `bayangan`, `rekomendasi`, `laporan_tim`) di server; G-6 bukti backup mencakup folder baru; G-2 `config/buku-aturan.json` awal + pembaca | Tidak | 01 |
| 03 | 0 | S1 fungsi shadow Hasil analisa; S2 endpoint `POST /api/keputusan/shadow`; S3 App memanggil shadow tanpa render | Tidak (tampilan sama persis) | 02; 🔒 izin menyentuh `App.tsx` khusus S3 |
| 04 | 0 | A7-4 snapshot keputusan + pembangun bersama; A7-6 test kembar jalur pemindai/detail/entry | Tidak | 02 |
| 05 | 0 | TB-2 pelari trade bayangan di server (Finex, OTB) memakai arsip tick | Tidak | 01, 02 |
| 06 | 0 | PL-1 hasil "seandainya diambil" sinyal tertahan biaya di backtest; P5a bukti per golongan di panel Evaluasi (tampilan) | Tampilan saja | 01 |
| 07 | 0 | F1 offset zona MIFX/Exness + arsip tick semua broker; F4 versi spesifikasi bertanggal | Tidak | 🔒 Fahmi mengisi `MT5_TZ_OFFSET_MIFX/EXNESS` di `.env` |
| 08 | 0 | TT-1 laporan per jam Trade & Exposure; TT-2 Calendar; G-7 `laporan_tim` | Tidak | 02 |
| 09 | 0b | P1 level harian; P2 rakit D1 + arah D1; P3 pola breakout-retest | Tidak (modul murni) | — |
| 10 | 0b | P4 strategi `topdown` (backtest saja); P5 rapor backtest per golongan | Tidak | 09 |
| 11 | 1 | 🔒 F3 EA menulis login + `ACCOUNT_TRADE_MODE`; server mencocokkan; TA-1 label akun | Bisa menahan sinyal (lebih aman) | Fahmi memasang EA |
| 12 | 1 | F2 gerbang kualitas data; TT-3 pembaca log Experts/Journal + kejadian penting | Bisa menahan sinyal (lebih aman) | 11 |
| 13 | 2 | Saklar mode A (default Live); jeda tidak mengunci di demo; J2 tanda setara Live; K-4 bukti F5 & jeda Live hanya setara Live | Ya, demo saja | 11, 12 |
| 14 | 2 | LAB-2 daftar trade uji (Opsi A); LAB-3 pengenalan `MDBKA-UJI`; LB-1 panel laju bukti | Tampilan, demo saja | 13 |
| 15 | 3 | E1/E2 risiko gabungan; lalu T2 masuk lagi simbol sama (maks 2, demo) | Ya, demo saja | 13 |
| 16 | 4 | 🔒 F5 candle D1/W1/M15 live (EA); T1 saran geser SL; siklus Tim 2; T3/T4; TT-4; TI-1/TI-2 indikator gelombang 1 | Saran/tampilan | Fahmi memasang EA |
| 17 | 5 | Rangkaian + kartu pola (K1–K5, G-3–G-5, R rangkaian, label, sidik jari bertingkat); PR-2 catatan waspada; TI-3 | Tampilan | 15, 16 |
| 18 | 6 | 🔒 Jalur Live: J1, J3–J6, pemantauan perubahan (F), E3, K6, PR-3, PL-3, TA-3, TI-4, konteks per golongan (B) | Ya, Live | Lampu hijau + persetujuan Fahmi |

**Tidak dikerjakan sampai ada keputusan baru:** A7-2/A7-3 pada tampilan dan A7-5 (menunggu klausul A9), serta pekerjaan tertunda D1–D8.

## Prompt yang ditempel ke OpenCode (setiap tahap)

```text
Baca docs/OPENCODE/00-ATURAN-UMUM.md lalu docs/OPENCODE/TAHAP-XX.md.
Kerjakan HANYA tahap XX, langkah demi langkah sesuai spesifikasi. Jangan commit.
Tulis laporan ke docs/OPENCODE/LAPORAN-TAHAP-XX.md sesuai format di aturan umum.
```

## Yang dikirim Fahmi ke Claude setelah setiap tahap

1. Hasil `npm test; npm run build`
2. Hasil `npm run lint`
3. Hasil `git status --short`

Claude membaca kode dan laporan langsung dari folder `E:\MDBKA`, mengaudit terhadap spesifikasi, lalu memberi perintah commit atau daftar perbaikan.
