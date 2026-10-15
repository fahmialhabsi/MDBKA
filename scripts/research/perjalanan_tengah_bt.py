"""Lolosyiob — Kerja Cepat v4 "Perjalanan ke Tengah" (cerita Fahmi 15 Okt 2026).

Peta cerita -> harga (dibekukan sebelum uji):
  Tengah  = MA26 (SMA 26 close M5)          Selatan = harga di BAWAH Tengah -> BELI menuju Tengah
  Utara   = harga di ATAS Tengah (cermin: JUAL menuju Tengah)
  Waktu tempuh 30 menit = 6 candle M5; hujan tiba di Tengah 45 menit -> batas waktu keras 40 menit (8 candle)
Syarat berangkat (semua wajib):
  S1 Jarak bisa ditempuh: 0,5 x T30 <= jarak ke Tengah <= 1,0 x T30
     T30 = median rentang 30 menit (6 candle) dari 288 candle sebelumnya (tanpa melihat ke depan)
  S2 Jalan tidak badai: bukan BADAI (v2: rentang 1 jam <= 2x biasa, spread <= 2x biasa)
  S3 Sudah melangkah: candle terakhir ditutup ke arah Tengah (BELI: close > open)
  S4 Tengah tidak lari menjauh: MA26 tidak bergerak menjauh dalam 30 menit terakhir
     (BELI: MA26_t >= MA26_(t-6) - 0,1 x T30)
  S5 Biaya: biaya pulang-pergi <= 10% jarak SL
Uji trade: masuk di close (ask utk BELI); TP = Tengah (MA26 saat masuk); SL = jarak yang sama di sisi lain (1R);
  keluar di batas 40 menit bila belum TP/SL; SL & TP di candle sama -> SL. Sesi 07-16 UTC, 5 pasangan, korelasi.
  LATIH 28 Sep 2025 - 30 Apr 2026, UJIAN 1 Mei - 15 Okt 2026 (7 blok). Kriteria K1-K7 sama dengan v2.
Ukuran tambahan: persen sampai Tengah (TP) dan menit tempuh.
Catatan: "hujan dari berita" (penjaga berita MDBKA) tidak bisa diuji setahun karena kalender historis tidak ada.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prakiraan_cuaca_bt as v2  # noqa: E402

MA_N, TRIP, HUJAN = 26, 6, 8


def siapkan(d):
    x = v2.kategori(d)
    ma = d.close.rolling(MA_N).mean()
    r30 = d.high.rolling(TRIP).max() - d.low.rolling(TRIP).min()
    t30 = r30.rolling(v2.MED_N, min_periods=50).median().shift(1)
    jarak = ma - d.close  # >0: di Selatan (bawah)
    beli = (jarak >= 0.5 * t30) & (jarak <= 1.0 * t30) & (d.close > d.open) & (ma >= ma.shift(TRIP) - 0.1 * t30)
    jual = (-jarak >= 0.5 * t30) & (-jarak <= 1.0 * t30) & (d.close < d.open) & (ma <= ma.shift(TRIP) + 0.1 * t30)
    ok8 = (d.t.shift(-HUJAN) - d.t) == pd.Timedelta(minutes=5 * HUJAN)
    x["arah"] = np.where(beli, "BELI", np.where(jual, "JUAL", ""))
    x["ma"] = ma
    x["layak"] = x.sesi & ok8 & (x.kat != "BADAI") & (x.kat != "DATA_KURANG") & (x.arah != "") & t30.notna()
    return x


def jalan(data, cats):
    jpy = data["USDJPY"].set_index("t").close
    sinyal = sorted((cats[s].tutup[i], s, i) for s in cats for i in cats[s].index[cats[s].layak])
    out, tolak, terbuka = [], {}, []
    for tutup, s, i in sinyal:
        terbuka = [z for z in terbuka if z[1] > tutup]
        if any(set([z[0][:3], z[0][3:]]) & set([s[:3], s[3:]]) for z in terbuka):
            tolak["korelasi/posisi terbuka"] = tolak.get("korelasi/posisi terbuka", 0) + 1
            continue
        d, x = data[s], cats[s]
        beli = x.arah[i] == "BELI"
        sp = float(d.sp[i])
        entry = float(d.close[i] + sp) if beli else float(d.close[i])
        tp = float(x.ma[i]) if beli else float(x.ma[i]) + sp  # TP di Tengah (BELI keluar di bid; JUAL beli kembali di ask)
        dist = (tp - entry) if beli else (entry - tp)
        uj = float(jpy.asof(d.t[i])) if s.endswith("JPY") else None
        com = 1.0 / 100000 if s.endswith("USD") else uj / 100000
        if not dist > 0 or (sp + com) > v2.MAX_COST * dist:
            tolak["S5 biaya 10% / jarak habis oleh spread"] = tolak.get("S5 biaya 10% / jarak habis oleh spread", 0) + 1
            continue
        sl = entry - dist if beli else entry + dist
        keluar, cara, k = None, "HUJAN(40m)", HUJAN
        for j in range(1, HUJAN + 1):
            m = d.iloc[i + j]
            if beli:
                if m.low <= sl:
                    keluar, cara = min(sl, m.open), "SL"
                elif m.high >= tp:
                    keluar, cara = tp, "TENGAH"
            else:
                if m.high + m.sp >= sl:
                    keluar, cara = max(sl, m.open + m.sp), "SL"
                elif m.low + m.sp <= tp:
                    keluar, cara = tp, "TENGAH"
            if keluar is not None:
                k = j
                break
        if keluar is None:
            m = d.iloc[i + HUJAN]
            keluar = float(m.close if beli else m.close + m.sp)
        r = ((keluar - entry) if beli else (entry - keluar)) / dist - com / dist
        pip = 0.01 if s.endswith("JPY") else 0.0001
        pv = 0.10 if s.endswith("USD") else 0.10 * 100 / uj
        ridr = dist / pip * pv * v2.KURS_IDR
        out.append({"tutup": tutup, "sym": s, "arah": "BELI" if beli else "JUAL", "jarak_pip": dist / pip, "cara": cara,
                    "menit": 5 * k, "R": r, "hasil_idr": r * ridr, "risk_idr": ridr})
        terbuka.append((s, tutup + pd.Timedelta(minutes=5 * k)))
    return pd.DataFrame(out), tolak


def lap(tr, judul):
    win, loss = tr.R[tr.R > 0].sum(), -tr.R[tr.R < 0].sum()
    tg = tr[tr.cara == "TENGAH"]
    print(f"{judul}: n={len(tr)} sampai Tengah={100 * len(tg) / len(tr):.1f}% (menit median {tg.menit.median():.0f}, "
          f"<=30 menit {100 * (tg.menit <= 30).mean():.0f}% dari yg sampai) | SL {100 * (tr.cara == 'SL').mean():.1f}% | "
          f"kena hujan {100 * (tr.cara == 'HUJAN(40m)').mean():.1f}% | rata R={tr.R.mean():+.3f} PF={win / loss:.2f} "
          f"total R={tr.R.sum():+.2f} Rp(0,01 lot)={tr.hasil_idr.sum():+,.0f} | jarak median {tr.jarak_pip.median():.1f} pip")


if __name__ == "__main__":
    data = v2.load(sys.argv[1])
    cats = {s: siapkan(d) for s, d in data.items()}
    tr, tolak = jalan(data, cats)
    t0 = max(c.t.iloc[0] for c in cats.values()) + pd.Timedelta(days=2)
    tr = tr[tr.tutup >= t0]
    lat, uji = tr[tr.tutup < v2.LATIH_AKHIR], tr[tr.tutup >= v2.LATIH_AKHIR]
    print("Ditolak:", tolak)
    lap(lat, "LATIH")
    lap(uji, "UJIAN")
    print("Menit tempuh (ujian, yang sampai Tengah):", uji[uji.cara == "TENGAH"].menit.value_counts().sort_index().to_dict())
    t1 = uji.tutup.max() + pd.Timedelta("1min")
    edges = [v2.LATIH_AKHIR + (t1 - v2.LATIH_AKHIR) * i / 7 for i in range(8)]
    per_blok, ok = [], 0
    for i in range(7):
        x = uji[(uji.tutup >= edges[i]) & (uji.tutup < edges[i + 1])]
        s = float(x.R.sum())
        per_blok.append(s)
        ok += len(x) > 0 and s > 0
        print(f"Uji {i + 1} {edges[i]:%d %b}–{edges[i + 1]:%d %b %Y}: n={len(x):3d} sampai={int((x.cara == 'TENGAH').sum()):3d} "
              f"R={s:+7.2f} Rp={x.hasil_idr.sum():+11,.0f} -> {'BERHASIL' if len(x) and s > 0 else 'TIDAK'}")
    pf = uji.R[uji.R > 0].sum() / -uji.R[uji.R < 0].sum()
    k = {"K1 n>=20": len(uji) >= 20, "K2 rata R>0": uji.R.mean() > 0, "K3 PF>=1,2": pf >= 1.2, "K4 >=5/7": ok >= 5,
         "K5 terburuk>=-1,1R": uji.R.min() >= -1.1, "K6 tanpa blok terbaik>0": sum(per_blok) - max(per_blok) > 0,
         "K7 latih rata R>0": lat.R.mean() > 0}
    for kk, v in k.items():
        print(f"  {kk}: {'YA' if v else 'TIDAK'}")
    print("VONIS:", "BERHASIL" if all(k.values()) else "TIDAK BERHASIL")
    print("Per pasangan (ujian):", uji.groupby("sym").R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("Per arah (ujian):", uji.groupby("arah").R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("Per jam UTC (ujian):", uji.groupby(uji.tutup.dt.hour).R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("Terburuk:", round(uji.R.min(), 3), "risiko Rp median:", f"{uji.risk_idr.median():,.0f}")
    tr.to_csv("tengah_trades.csv", index=False)
