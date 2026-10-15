"""Riset scalping Finex Forex (15 Okt 2026): arsip tick MDBKA -> bar M1 per pasangan Forex.

Pakai: python3 scalp_finex_agg.py data/history/finex/ticks-YYYY-MM-DD.jsonl keluaran.csv
Kolom keluaran: simbol,menit_utc,o,h,l,c (mid),spread_rata,spread_maks,jumlah_kuotasi,bid_akhir,ask_akhir
Catatan: arsip berisi kuotasi tiap +-2 detik (quotes.csv), bukan setiap tick.
"""
import json
import sys

CCY = {"EUR", "USD", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "SGD", "HKD", "NOK", "SEK", "ZAR", "MXN", "TRY", "PLN", "CNH"}


def main(src: str, out: str) -> None:
    bars = {}
    with open(src, encoding="utf-8") as f:
        for line in f:
            if '"symbol":"' not in line:
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            s = r.get("symbol", "")
            if len(s) != 6 or s[:3] not in CCY or s[3:] not in CCY:
                continue
            b, a, t = r.get("bid"), r.get("ask"), r.get("ts_utc", "")
            if not isinstance(b, (int, float)) or not isinstance(a, (int, float)) or a < b or b <= 0:
                continue
            k = (s, t[:16])
            mid, sp = (a + b) / 2, a - b
            v = bars.get(k)
            if v is None:
                bars[k] = [mid, mid, mid, mid, sp, 1, sp, a, b]
            else:
                v[1] = max(v[1], mid)
                v[2] = min(v[2], mid)
                v[3] = mid
                v[4] += sp
                v[5] += 1
                v[6] = max(v[6], sp)
                v[7], v[8] = a, b
    with open(out, "w", encoding="utf-8") as g:
        for (s, m), v in sorted(bars.items()):
            g.write(f"{s},{m},{v[0]},{v[1]},{v[2]},{v[3]},{v[4] / v[5]},{v[6]},{v[5]},{v[8]},{v[7]}\n")
    print(src, len(bars), "bar M1")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
