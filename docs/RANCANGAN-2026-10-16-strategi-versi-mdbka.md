# Rancangan — Strategi versi MDBKA: Mancing, Petani Kebun, Pencari Fakta

**Tanggal:** 16 Okt 2026 · **Status:** USULAN — angka di bawah menunggu persetujuan Fahmi sebelum diuji (dibekukan, tidak diubah setelah melihat hasil).
**Dasar:** audit trade (T-AUDIT) strategi "skor" di Finex, modal $758, 81 simbol, 2023-06-14 s/d 2026-10-15.

## 1. Fakta audit (tanpa tafsiran)
| Fakta | Angka |
|---|---|
| Trade | 18.792 · menang 42% · titik impas butuh 46,1% |
| Cara keluar | batas waktu 3 jam 10.817 (58%, rata-rata +0,065R) · SL 5.531 (29%, −1,02R) · TP 2.433 (13%, +1,54R) |
| Sebab rugi | **melawan sejak masuk 62%** · berbalik setelah +0,5R 21% · tanpa sebab pasti 17% · biaya 0% |
| Rugi yang sempat untung | median hanya +0,21R; sempat ≥ +1R cuma 522 dari 10.901 |
| Arah masuk | 94% trade BELI saat RSI 55–70 / JUAL saat RSI 30–45 (mengejar harga yang sudah lari) |
| Hasil | ujian −Rp36,2 juta; semua golongan TIDAK_LAYAK atau BELUM_CUKUP |
| Peringatan audit | W-simbol:#GOOGL, W-simbol:JP225, W-sl_atr_h4:≥2, W-tembus_ke_uji_h4:5-6 |
| Celah data | kolom arah D1 di berkas perkara kosong untuk strategi skor (strategi tidak memakai D1) |

Kesimpulan masalah: **masuk terlambat** (mengejar) dan **ditutup terlalu cepat** (3 jam), bukan biaya.

## 2. Prinsip bersama
- Strategi tidak menjanjikan hasil pasti. Yang diukur: **peluang** dan **rata-rata R** dari data.
- Semua angka dibekukan sebelum uji. Uji latih (sebelum 14 Okt 2025) → ujian (sesudahnya), 7 blok.
- Lolos bila K1 n≥20 · K2 rata-rata R>0 · K3 PF≥1,2 · K4 ≥5/7 blok positif · K5 terburuk ≥−1,1R · K6 positif tanpa blok terbaik · K7 latih positif.
- Data: Finex `MDBKA_<simbol>_H1_LONG.csv` (81 simbol), spread margin Finex, komisi $1/lot, kurs ECB. MDBKA tidak mengirim order.
- Bila lolos: masuk Buku Aturan sebagai UJI_DEMO (lampu 2), wajib merujuk ID peringatan audit.

## 3. Strategi Mancing (M-1) — menunggu di tempat yang tepat
Analogi: alat lengkap, cuaca baik, perahu layak, lalu pasang umpan di spot dan sabar. Ikan tidak pasti makan; yang diukur berapa sering makan.
| Bagian cerita | Aturan harga (dibekukan) |
|---|---|
| Peralatan | data lengkap dan biaya ≤ 10% risiko (gerbang yang sudah ada) |
| Cuaca | bukan badai: rentang candle H1 terakhir ≤ 2× median rentang 96 candle sebelumnya |
| Perahu layak | risiko lot minimum ≤ batas risiko akun (penjaga yang sudah ada) |
| Spot | high kemarin (umpan JUAL) atau low kemarin (umpan BELI), sesi 07–20 UTC |
| Kedalaman 30 m | umpan dipasang 0,1 × ATR H1 sebelum level (di dalam rentang kemarin) |
| Umpan dimakan | harga menyentuh titik umpan → masuk |
| SL | 0,5 × ATR H1 di luar level |
| TP | 1,0R (ikan diangkat, tidak serakah) |
| Sabar ±2 menit | 3 candle H1 setelah masuk; belum TP/SL → keluar di harga pasar |
| Umpan basi | tidak tersentuh sampai 20 UTC → batal |

## 4. Strategi Petani Kebun (P-1) — tanam sesuai musim, panen tidak terburu-buru
Analogi: tanam di musim hujan, tanam saat tanah sudah digemburkan, rawat, panen saat buah matang (bukan 3 jam).
| Bagian cerita | Aturan harga (dibekukan) |
|---|---|
| Musim | D1: close kemarin > SMA20 D1 dan SMA20 naik dibanding 5 hari lalu → hanya BELI (cermin untuk JUAL) |
| Tanah digemburkan | H1 turun menyentuh MA50 H1 (low ≤ MA50) |
| Tanam | candle H1 berikutnya tutup kembali di atas MA50 → masuk di close |
| Pagar | SL 1,5 × ATR H1 di bawah low pullback |
| Merawat | +1R tercapai → SL digeser ke titik masuk |
| Panen | TP 3R, atau keluar bila close D1 di bawah SMA20 D1 (musim berganti), maksimal 10 hari |
| Catatan | **tidak memakai batas 3 jam** — butuh izin karena aturan live sekarang 3 jam |

## 5. Strategi Pencari Fakta (F-1) — laporan harus dikuatkan saksi
Analogi: laporan masuk (sinyal skor) belum boleh jadi vonis; harus ada saksi dari waktu berikutnya dan dari tempat lain.
| Bagian cerita | Aturan harga (dibekukan) |
|---|---|
| Laporan awal | sinyal strategi skor yang sudah ada (tidak diubah) |
| Saksi 1 (waktu) | dalam ≤ 2 candle H1, ada close melewati high (BELI) / low (JUAL) candle sinyal; tidak ada → laporan gugur |
| Saksi 2 (tempat lain) | arah D1: close kemarin > SMA20 D1 untuk BELI, < untuk JUAL |
| Barang bukti | biaya ≤ 10% risiko (gerbang yang sudah ada) |
| Vonis/masuk | di close candle saksi 1; SL/TP dan batas 3 jam sama dengan strategi skor |
| Sasaran | menurunkan sebab rugi "melawan sejak masuk" (62%) |

## 6. Langkah sesudah disetujui
1. Uji ketiganya sebagai riset (`scripts/research/`), tanpa mengubah `decisionEngine.ts`.
2. Laporkan K1–K7 per strategi dan per golongan.
3. Yang lolos saja diusulkan masuk aplikasi (izin terpisah).
