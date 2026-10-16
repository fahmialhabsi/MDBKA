# AP-2 — Uji saringan jam sepi pada strategi utama "skor" (Finex)

**Tanggal:** 16 Okt 2026 · **Status:** riset saja, aturan tidak berubah.

## Pertanyaan
Apakah membuang sinyal di sesi Asia (00–07 UTC) dan jam sepi (21–24 UTC) memperbaiki hasil strategi utama?

## Bahan
- 37 file `MDBKA_<simbol>_H1_LONG.csv` Finex, spread dari `MDBKA_Margin_Finex.csv`, kurs ECB 16 Okt 2026 (Rp17.921,1/USD).
- `runBacktest` (strategi bawaan), modal $758, 18.279 trade (20 Jun 2025 – 14 Okt 2026).
- Jam sinyal server Finex (New York + 7) diubah ke UTC. Latih 60% awal, ujian 40% akhir (batas 18 Jun 2026).
- Skrip: `scripts/research/sesi_skor_ap2.py`.

## Hasil (rata-rata R per trade)
| Sesi UTC | Latih n | Latih R | Ujian n | Ujian R |
|---|---|---|---|---|
| Asia 00–07 | 3.139 | −0,056 | 2.084 | −0,027 |
| Eropa 07–12 | 2.348 | −0,067 | 1.653 | −0,060 |
| Tumpang 12–16 | 2.196 | −0,029 | 1.477 | −0,088 |
| AS 16–21 | 2.072 | −0,069 | 1.390 | −0,135 |
| Sepi 21–24 | 1.208 | −0,091 | 712 | −0,074 |
| **Semua** | 10.963 | −0,059 | 7.316 | −0,072 |
| **Tanpa Asia+Sepi** | 6.616 | −0,055 | 4.520 | **−0,092** |

## Vonis: TIDAK BERHASIL
- Tidak ada satu sesi pun yang positif, di latih maupun ujian.
- Di ujian, membuang Asia+Sepi justru memperburuk rata-rata R (−0,072 → −0,092); Asia malah sesi "paling tidak rugi".
- Akar masalah bukan jam; sinyal strategi utama sendiri belum punya keunggulan pada data ini. Saringan sesi tidak dipasang.
