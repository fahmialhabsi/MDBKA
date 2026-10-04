import { useState, type JSX } from "react";
import { FINEX_SPECS_32 } from "../../lib/instrumentSpecs32";
import {
  checkRewardRisk,
  rewardRiskRatio,
  validateHoldingInput,
  type HoldingDirection,
} from "../../lib/exitMonitor";
import type { BrokerId } from "../../types/broker";

export interface NewHolding {
  readonly symbol: string;
  readonly brokerId: BrokerId;
  readonly direction: HoldingDirection;
  readonly lot: number;
  readonly entryPrice: number;
  readonly sl: number;
  readonly tp: number;
  readonly entryTime: string;
  readonly accountEquity?: number;
}

/**
 * Tahap F1 — form entry posisi manual (display + input; tanpa order).
 * Simbol dari spec32 Finex (16); live mengalir bila EA menulis tick-nya.
 */
export function HoldingsForm({
  brokerId,
  onAdd,
}: {
  readonly brokerId: BrokerId;
  readonly onAdd: (holding: NewHolding) => void;
}): JSX.Element {
  const [symbol, setSymbol] = useState("USDCHF");
  const [direction, setDirection] = useState<HoldingDirection>("BELI");
  const [lot, setLot] = useState("0.01");
  const [entryPrice, setEntryPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [equity, setEquity] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const submit = (): void => {
    const equityValue = equity.trim() === "" ? undefined : Number(equity);
    const input = {
      symbol: symbol.trim(),
      direction,
      lot: Number(lot),
      entryPrice: Number(entryPrice),
      sl: Number(sl),
      tp: Number(tp),
      accountEquity: equityValue,
    };
    const problems = validateHoldingInput(input);
    setErrors(problems);
    if (problems.length > 0) return;
    onAdd({
      ...input,
      brokerId,
      entryTime: new Date().toISOString(),
    });
    setEntryPrice("");
    setSl("");
    setTp("");
  };

  const liveRatio = rewardRiskRatio(Number(entryPrice), Number(sl), Number(tp));
  const rrHint =
    entryPrice.trim() !== "" && sl.trim() !== "" && tp.trim() !== ""
      ? checkRewardRisk(Number(entryPrice), Number(sl), Number(tp))
      : null;

  const field =
    "mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-slate-300">
          Simbol
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className={field}
          >
            {FINEX_SPECS_32.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Arah
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as HoldingDirection)}
            className={field}
          >
            <option value="BELI">BELI</option>
            <option value="JUAL">JUAL</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Lot
          <input
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            inputMode="decimal"
            className={field}
          />
        </label>
        <label className="text-sm text-slate-300">
          Entry
          <input
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            inputMode="decimal"
            placeholder="harga terisi"
            className={field}
          />
        </label>
        <label className="text-sm text-slate-300">
          SL
          <input
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            inputMode="decimal"
            className={field}
          />
        </label>
        <label className="text-sm text-slate-300">
          TP
          <input
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            inputMode="decimal"
            className={field}
          />
        </label>
        <label className="text-sm text-slate-300">
          Equity USD (opsional, guard 10%)
          <input
            value={equity}
            onChange={(e) => setEquity(e.target.value)}
            inputMode="decimal"
            placeholder="mis. 500"
            className={field}
          />
        </label>
      </div>
      {liveRatio !== null && (
        <p className="text-xs text-slate-400">
          R:R 1:{liveRatio.toFixed(2)}
          {rrHint !== null ? (
            <span className="text-amber-200"> — {rrHint}</span>
          ) : (
            <span className="text-emerald-300"> — layak (≥1:2)</span>
          )}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        className="rounded-xl bg-emerald-400/15 px-4 py-2.5 font-semibold text-emerald-200 hover:bg-emerald-400/25"
      >
        Tambah posisi (manual, tanpa order)
      </button>
      {errors.length > 0 && (
        <ul className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {errors.map((message) => (
            <li key={message}>• {message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
