# Lolosyiob — Uji Ulang di Data MT5 Exness (15 Okt 2026)

**Permintaan Fahmi:** "coba metode lolosyiob tersebut anda buktikan dengan data MT5 Exness".

**Data:** akun 413925678 (akun pembelajaran, K-11; candle harga boleh dipakai uji).
- M5 75.000 candle untuk EURUSDm, GBPUSDm, USDJPYm, EURJPYm, GBPJPYm dan XAUUSDm (±Okt 2025 – 15 Okt 2026).
- M1 370.000 candle untuk XAUUSDm (29 Sep 2025 – 15 Okt 2026).
- Diekspor Fahmi 15 Okt 2026 pukul 16:31–16:33 WIT.

**Penyesuaian karena broker berbeda** (bukan penyetelan; angka beku semua versi tidak diubah):

| Hal | Finex | Exness | Bukti |
| --- | --- | --- | --- |
| Jam server | New York + 7 | **UTC** | Buka mingguan Minggu 21:05/22:05 UTC |
| Komisi | $1/lot | **$0** | 34.259 deal XAUUSDm di History tanpa komisi |
| Point XAU | 0,01 | **0,001** | Spesifikasi Digits 3 |
| Spread median | EURUSD 0,7 pip; XAU $0,17 | EURUSD 0,8 pip; XAU $0,24 | Kolom spread M5 |

Variabel lingkungan: `MDBKA_TZ=UTC`, `MDBKA_COMM_PER_LOT=0`, `MDBKA_XAU_POINT=0.001`. Skrip-skrip di `scripts/research/` tetap sama.

## Hasil — semua versi, data ujian

Rupiah untuk lot 0,01, kurs Rp17.880.

| Versi | Trade ujian | Rata-rata R | PF | Blok positif | Rupiah ujian | Finex (pembanding) | Vonis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 Kerja Cepat (setahun, 7 blok) | 564 | −0,097 | 0,75 | 2/7 | −Rp1.196.585 | −0,086R | Tidak berhasil |
| v2 Prakiraan Cuaca | 1.938 | −0,077 | 0,64 | 1/7 | −Rp3.474.277 | −0,063R | Tidak berhasil |
| v3 Cuaca + MA26 | 1.524 | −0,071 | 0,66 | 1/7 | −Rp2.563.684 | −0,063R | Tidak berhasil |
| v4 Perjalanan ke Tengah | 27 | −0,053 | 0,88 | 2/7 | −Rp54.227 | −0,159R | Tidak berhasil |
| v5 Pullback XAUUSD | 255 | −0,087 | 0,82 | 2/7 | −Rp1.632.594 | −0,050R | Tidak berhasil |
| v6 Scalping murni XAUUSD M1 | 470 (menang 62,1%) | −0,063 | 0,83 | 1/7 | −Rp1.916.153 | −0,083R | Tidak berhasil |

Data latih Exness juga negatif untuk semua versi.

**Kesimpulan:**
- Hasil Exness **sama arahnya** dengan Finex: semua versi rugi tipis dan konsisten.
- Biaya Exness lebih ringan (tanpa komisi), tetapi tidak mengubah apa pun. Jadi masalahnya bukan biaya broker, melainkan **pemicu masuk yang tidak punya keunggulan**.
- **Metode Lolosyiob tidak terbukti di dua broker.**

## Peringatan Badai (CU-1) — uji ulang di Exness

Aturannya sama dengan versi live: M15, rentang 1 jam > 2× median. Ukurannya adalah peluang rentang 30 menit berikutnya > 1,5× biasa.

| | BADAI | Normal |
| --- | --- | --- |
| Latih | 59,3% | 17,4% |
| Ujian | 60,2% | 17,9% |

**Peringatan Badai terbukti juga di Exness** (Finex: 58–61% vs 18%). Temuan ini berlaku umum, bukan khas satu broker.
