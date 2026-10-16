import sys, pandas as pd
from zoneinfo import ZoneInfo
d = pd.read_csv(sys.argv[1])
st = pd.to_datetime(d.signalTime, format="%Y.%m.%d %H:%M")
# Finex server = jam New York + 7 -> UTC
ny = (st - pd.Timedelta(hours=7)).dt.tz_localize(ZoneInfo("America/New_York"), ambiguous="NaT", nonexistent="shift_forward")
d["utc"] = ny.dt.tz_convert("UTC").dt.tz_localize(None)
d = d.dropna(subset=["utc"]).sort_values("utc")
h = d.utc.dt.hour
d["sesi"] = pd.cut(h, [-1, 6, 11, 15, 20, 23], labels=["Asia 00-07", "Eropa 07-12", "Tumpang 12-16", "AS 16-21", "Sepi 21-24"])
cut = d.utc.quantile(0.6)
d["bagian"] = (d.utc >= cut).map({False: "LATIH", True: "UJIAN"})
print("rentang", d.utc.min(), "-", d.utc.max(), "| batas latih/ujian", cut)
g = d.groupby(["bagian", "sesi"], observed=True).agg(n=("r", "size"), rataR=("r", "mean"), totR=("r", "sum"), usd=("netUsd", "sum"))
print(g.round(3))
for b, x in d.groupby("bagian"):
    s = x[~x.sesi.isin(["Asia 00-07", "Sepi 21-24"])]
    print(f"{b}: semua n={len(x)} R={x.r.mean():+.3f} usd={x.netUsd.sum():+.0f} | tanpa Asia+Sepi n={len(s)} R={s.r.mean():+.3f} usd={s.netUsd.sum():+.0f}")
