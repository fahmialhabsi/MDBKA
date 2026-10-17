import { useMemo } from "react";
import { parseCsvCandles } from "../../lib/csvCandleParser";
import type { ScanPlan } from "../../lib/symbolScanner";
import { formatPrice } from "../../lib/tickSize";

const W = 800;
const H = 300;
const PAD_R = 92;
const MAX_CANDLES = 90;

/** Chart candle H1 sederhana (CSV MT5 yang sama dengan pemindai) + garis Entry/SL/TP rencana bila ada. */
export function MiniCandleChart({ csv, symbol, plan }: { readonly csv: string; readonly symbol: string; readonly plan: ScanPlan | null }) {
  const candles = useMemo(() => parseCsvCandles(csv).candles.slice(-MAX_CANDLES), [csv]);
  if (candles.length < 2) return <p className="p-6 text-center text-sm text-slate-500">Candle {symbol} belum cukup untuk digambar.</p>;

  const levels = plan === null ? [] : [
    { label: "ENTRY", value: plan.entry, color: "#7dd3fc" },
    { label: "SL", value: plan.stopLoss, color: "#fb7185" },
    { label: "TP", value: plan.takeProfit, color: "#34d399" },
  ];
  const lows = [...candles.map((c) => c.low), ...levels.map((l) => l.value)];
  const highs = [...candles.map((c) => c.high), ...levels.map((l) => l.value)];
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const y = (p: number): number => 10 + ((max - p) / span) * (H - 20);
  const step = (W - PAD_R - 10) / candles.length;
  const body = Math.max(1.5, step * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Chart H1 ${symbol}`} data-testid="meja-chart">
      {candles.map((c, i) => {
        const x = 10 + i * step + step / 2;
        const up = c.close >= c.open;
        const color = up ? "#34d399" : "#fb7185";
        return (
          <g key={`${c.time}-${i}`}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
            <rect x={x - body / 2} y={y(Math.max(c.open, c.close))} width={body} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={color} />
          </g>
        );
      })}
      {levels.map((l) => (
        <g key={l.label}>
          <line x1={10} x2={W - PAD_R} y1={y(l.value)} y2={y(l.value)} stroke={l.color} strokeDasharray="6 4" strokeWidth={1.2} />
          <rect x={W - PAD_R + 4} y={y(l.value) - 10} width={PAD_R - 8} height={20} rx={4} fill={l.color} />
          <text x={W - PAD_R / 2} y={y(l.value) + 4} textAnchor="middle" fontSize={11} fill="#0f172a">
            {l.label} {formatPrice(l.value, symbol)}
          </text>
        </g>
      ))}
    </svg>
  );
}
