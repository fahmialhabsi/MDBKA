"""Lolosyiob — Kerja Cepat v3 "Prakiraan Cuaca + MA26" (logika BMKG sama dengan v2), 15 Okt 2026.

Pakai: python3 prakiraan_cuaca_ma26_bt.py <folder MDBKA_<PAIR>_M5_LONG.csv>

Bahan tambahan (1): MA26 = SMA 26 close M5 (MA bawaan MT5, metode Simple), dihitung dari candle yang sama.
Logika v2 TIDAK diubah; MA26 menambah syarat (dibekukan sebelum uji):
  CERAH_NAIK  : syarat v2 + close > MA26 + MA26 naik dalam 1 jam (MA26_t > MA26_(t-12))
  CERAH_TURUN : syarat v2 + close < MA26 + MA26 turun dalam 1 jam
  Yang gagal syarat MA26 menjadi BERAWAN. BADAI, sesi, uji trade, latih/ujian, kriteria K1-K7: sama dengan v2.
Tambahan "melihat pola": tabel 4 pola MA26 (posisi harga x arah MA26) vs arah 30 menit berikutnya.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prakiraan_cuaca_bt as v2  # noqa: E402

MA_N = 26


def kategori_ma(d):
    x = v2.kategori(d)
    ma = d.close.rolling(MA_N).mean()
    naik = (d.close > ma) & (ma > ma.shift(v2.LOOK))
    turun = (d.close < ma) & (ma < ma.shift(v2.LOOK))
    x["pola"] = np.select([naik, turun, d.close > ma, d.close < ma],
                          ["di atas & MA naik", "di bawah & MA turun", "di atas & MA turun/datar", "di bawah & MA naik/datar"], "tepat di MA")
    x.loc[(x.kat == "CERAH_NAIK") & ~naik, "kat"] = "BERAWAN"
    x.loc[(x.kat == "CERAH_TURUN") & ~turun, "kat"] = "BERAWAN"
    x.loc[ma.shift(v2.LOOK).isna(), "kat"] = "DATA_KURANG"
    return x


def pola_tabel(cats):
    rows = []
    for x in cats.values():
        x = x[x.sesi & x.ok & (x.kat != "DATA_KURANG")]
        rows.append(pd.DataFrame({"per": np.where(x.t < v2.LATIH_AKHIR, "LATIH", "UJIAN"), "pola": x.pola,
                                  "naik_untung": (x.c6 - (x.c + x.sp)) > 0, "turun_untung": (x.c - (x.c6 + x.sp6)) > 0,
                                  "gerak_pip": (x.c6 - x.c) / np.where(x.c > 50, 0.01, 0.0001)}))
    a = pd.concat(rows)
    return a.groupby(["per", "pola"]).agg(n=("pola", "size"), naik_untung=("naik_untung", "mean"),
                                         turun_untung=("turun_untung", "mean"), gerak_rata_pip=("gerak_pip", "mean"))


if __name__ == "__main__":
    data = v2.load(sys.argv[1])
    cats = {s: kategori_ma(d) for s, d in data.items()}
    pd.set_option("display.width", 250)
    print("===== Pola MA26 vs 30 menit berikutnya (klimatologi per pola) =====")
    print(pola_tabel(cats).round(3).to_string())
    sk = v2.skill(cats)
    for per in ("LATIH", "UJIAN"):
        z = sk[sk.periode == per]
        wn = (z.tepat_cerah_naik * z.n_cerah_naik).sum() / z.n_cerah_naik.sum()
        wt = (z.tepat_cerah_turun * z.n_cerah_turun).sum() / z.n_cerah_turun.sum()
        bn = (z.dasar_naik * z.n_semua).sum() / z.n_semua.sum()
        bt = (z.dasar_turun * z.n_semua).sum() / z.n_semua.sum()
        print(f"{per}: CERAH_NAIK n={z.n_cerah_naik.sum()} tepat {wn:.1%} vs dasar {bn:.1%} | "
              f"CERAH_TURUN n={z.n_cerah_turun.sum()} tepat {wt:.1%} vs dasar {bt:.1%}")
    tr, tolak = v2.trades(data, cats)
    t0 = max(c.t.iloc[0] for c in cats.values()) + pd.Timedelta(days=2)
    tr = tr[tr.tutup >= t0]
    lat, uji = tr[tr.tutup < v2.LATIH_AKHIR], tr[tr.tutup >= v2.LATIH_AKHIR]
    print("\nDitolak:", tolak)
    v2.ringkas(lat, "LATIH")
    v2.ringkas(uji, "UJIAN")
    t1 = uji.tutup.max() + pd.Timedelta("1min")
    edges = [v2.LATIH_AKHIR + (t1 - v2.LATIH_AKHIR) * i / 7 for i in range(8)]
    per_blok, ok = [], 0
    for i in range(7):
        x = uji[(uji.tutup >= edges[i]) & (uji.tutup < edges[i + 1])]
        s = float(x.R.sum())
        per_blok.append(s)
        ok += len(x) > 0 and s > 0
        print(f"Uji {i + 1} {edges[i]:%d %b}–{edges[i + 1]:%d %b %Y}: n={len(x):3d} menang={int((x.R > 0).sum()):3d} R={s:+7.2f} "
              f"Rp={x.hasil_idr.sum():+11,.0f} -> {'BERHASIL' if len(x) and s > 0 else 'TIDAK'}")
    pf = uji.R[uji.R > 0].sum() / -uji.R[uji.R < 0].sum()
    k = {"K1 n>=20": len(uji) >= 20, "K2 rata R>0": uji.R.mean() > 0, "K3 PF>=1,2": pf >= 1.2, "K4 >=5/7": ok >= 5,
         "K5 terburuk>=-1,1R": uji.R.min() >= -1.1, "K6 tanpa blok terbaik>0": sum(per_blok) - max(per_blok) > 0,
         "K7 latih rata R>0": len(lat) > 0 and lat.R.mean() > 0}
    for kk, v in k.items():
        print(f"  {kk}: {'YA' if v else 'TIDAK'}")
    print("VONIS:", "BERHASIL" if all(k.values()) else "TIDAK BERHASIL")
    print("Per arah (ujian):", uji.groupby("arah").R.agg(["count", "sum"]).round(2).to_dict("index"))
    tr.to_csv("cuaca_ma26_trades.csv", index=False)
