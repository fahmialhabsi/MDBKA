"""Riset scalping Finex Forex (15 Okt 2026): statistik spread/biaya + uji S1-S3 pada bar M1 nyata.

Pakai: python3 scalp_finex_bt.py gabungan-m1.csv   (gabungan keluaran scalp_finex_agg.py)
Aturan & angka DIKUNCI sebelum melihat hasil; latih < 12 Okt 2026, ujian >= 12 Okt 2026.
Butuh pandas + numpy. Hasil: docs/HANDOFF-SCALPING-FINEX-FOREX.md bagian 3 dan 6.
"""
import sys

import numpy as np
import pandas as pd

cols = ["sym", "t", "o", "h", "l", "c", "spAvg", "spMax", "n", "bid", "ask"]
df = pd.read_csv(sys.argv[1], names=cols)
df = df[~df.sym.isin(["USDEUR", "USDGBP", "USDHKD"])]
df["t"] = pd.to_datetime(df.t)
df["pip"] = np.where(df.sym.str.endswith("JPY"), 0.01, 0.0001)
df = df[(df.t.dt.dayofweek < 5) & (df.h > df.l)]
df["spPip"] = df.spAvg / df.pip
df["rangePip"] = (df.h - df.l) / df.pip
df["hour"] = df.t.dt.hour
PAIRS = ["USDJPY", "EURJPY", "GBPUSD", "GBPJPY", "EURUSD"]
KOM = {True: 0.16, False: 0.10}  # $1/lot dalam pip
SPLIT = pd.Timestamp("2026-10-12")


def m5bars(d):
    d=d.set_index("t")
    r=d.resample("5min").agg({"o":"first","h":"max","l":"min","c":"last","spAvg":"mean"}).dropna()
    return r
def ema(s,n): return s.ewm(span=n,adjust=False).mean()
def atr(b,n=14):
    tr=pd.concat([b.h-b.l,(b.h-b.c.shift()).abs(),(b.l-b.c.shift()).abs()],axis=1).max(axis=1)
    return tr.ewm(alpha=1/n,adjust=False).mean()
def simulate(m1, entries, pip, kom):
    """entries: list of (time, dir, sl_dist, tp_dist, max_min, tp_price_override). Entry at next M1 open with spread."""
    out=[]; busy=None
    idx=m1.index
    for (t,d,sld,tpd,maxm,tpov) in entries:
        if busy is not None and t<busy: continue
        pos=idx.searchsorted(t)
        if pos>=len(idx): continue
        e=m1.iloc[pos]; sp=e.spAvg
        entry=e.o+ (sp/2 if d==1 else -sp/2)
        sl=entry-d*sld; tp=(tpov if tpov is not None else entry+d*tpd)
        res=None; end=None
        for j in range(pos,min(pos+maxm,len(idx))):
            b=m1.iloc[j]; hs=b.spAvg/2
            # harga keluar: BELI di bid (mid-hs), JUAL di ask (mid+hs)
            lo=b.l-hs if d==1 else b.l+hs; hi=b.h-hs if d==1 else b.h+hs
            hitSL = (lo<=sl) if d==1 else (hi>=sl)
            hitTP = (hi>=tp) if d==1 else (lo<=tp)
            if hitSL: res=sl; end=idx[j]; break
            if hitTP: res=tp; end=idx[j]; break
        if res is None:
            j=min(pos+maxm,len(idx))-1; b=m1.iloc[j]; res=b.c-(b.spAvg/2 if d==1 else -b.spAvg/2); end=idx[j]
        pips=d*(res-entry)/pip - kom
        risk=sld/pip
        cost=(sp/pip+kom)
        out.append(dict(t=t,dir=d,pips=pips,R=pips/risk,risk=risk,costShare=cost/risk))
        busy=end
    return out
def s1(m1,b,pip):  # EMA9/21 cross M5 searah EMA50, sesi 07-16 UTC
    e9,e21,e50=ema(b.c,9),ema(b.c,21),ema(b.c,50); a=atr(b)
    up=(e9>e21)&(e9.shift()<=e21.shift())&(b.c>e50); dn=(e9<e21)&(e9.shift()>=e21.shift())&(b.c<e50)
    en=[]
    for t in b.index[50:]:
        if not (7<=t.hour<16): continue
        if up[t]: en.append((t+pd.Timedelta("5min"),1,a[t],1.5*a[t],30,None))
        if dn[t]: en.append((t+pd.Timedelta("5min"),-1,a[t],1.5*a[t],30,None))
    return en
def s2(m1,b,pip):  # BB(20,2) mean reversion M5 sesi Asia 00-07 UTC, TP = tengah, SL 1 ATR
    mid=b.c.rolling(20).mean(); sd=b.c.rolling(20).std(ddof=0); a=atr(b)
    en=[]
    for t in b.index[20:]:
        if not (0<=t.hour<7): continue
        if b.c[t]<mid[t]-2*sd[t]: en.append((t+pd.Timedelta("5min"),1,a[t],None,60,mid[t]))
        if b.c[t]>mid[t]+2*sd[t]: en.append((t+pd.Timedelta("5min"),-1,a[t],None,60,mid[t]))
    return [(t,d,s,(abs(tp-0) if tpd is None else tpd),m,tp) for (t,d,s,tpd,m,tp) in en]
def s3(m1,b,pip):  # London breakout: range Asia 00-07, close M5 menembus 07-10 UTC, SL = tengah range, TP 1R
    en=[]
    for day,g in b.groupby(b.index.date):
        asia=g[(g.index.hour<7)]
        if len(asia)<60: continue
        hi,lo=asia.h.max(),asia.l.min(); midr=(hi+lo)/2
        for t in g[(g.index.hour>=7)&(g.index.hour<10)].index:
            c=g.c[t]
            if c>hi: en.append((t+pd.Timedelta("5min"),1,c-midr,c-midr,300,None)); break
            if c<lo: en.append((t+pd.Timedelta("5min"),-1,midr-c,midr-c,300,None)); break
    return en
rows=[]
for name,fn in [("S1 EMA9/21 M5 + EMA50, Eropa/AS",s1),("S2 Bollinger balik-tengah M5, Asia",s2),("S3 London breakout M5",s3)]:
    for sym in PAIRS:
        m1=df[df.sym==sym].set_index("t").sort_index()
        pip=0.01 if sym.endswith("JPY") else 0.0001
        b=m5bars(df[df.sym==sym])
        tr=simulate(m1,fn(m1,b,pip),pip,KOM[sym.endswith("JPY")])
        for x in tr: x.update(strat=name,sym=sym,fase="latih" if x["t"]<SPLIT else "ujian"); rows.append(x)
r=pd.DataFrame(rows)
def summ(g): return pd.Series(dict(n=len(g),menang=f"{(g.pips>0).mean()*100:.0f}%",bersih_pip=round(g.pips.sum(),1),rata_R=round(g.R.mean(),2),porsi_biaya_med=f"{g.costShare.median()*100:.0f}%",lolos_gerbang10=f"{(g.costShare<=0.10).mean()*100:.0f}%"))
print(r.groupby(["strat","fase"]).apply(summ).to_string())
print()
print(r.groupby(["strat","sym"]).apply(summ).to_string())
print(df.groupby("sym").spPip.median().round(2).sort_values().to_string())
r.to_csv("scalp_finex_trades.csv", index=False)
