import type { JSX } from "react";
import { useNow } from "../../hooks/useNow";
import {
  profitToIdr,
  usdIdrRate,
  type ExchangeRates,
} from "../../services/fxRateService";

/**
 * #514 - kurs USD→Rp (ECB) + "Hasil (Total Profit × Kurs)" di header.
 * Profit = profit floating akun dari Live Equity (MT5). Kurs indikatif,
 * bukan kurs pajak (KMK) atau kurs broker; tanpa kurs → "belum tersedia".
 */
export function KursProfitBar({
  profitUsd,
  fxRates,
}: {
  /** Profit floating akun (USD) dari MT5; null bila belum ada data. */
  readonly profitUsd: number | null;
  readonly fxRates: ExchangeRates | null;
}): JSX.Element {
  const nowMs = useNow();
  const kurs = usdIdrRate(fxRates);
  const hasil = profitUsd === null ? null : profitToIdr(profitUsd, kurs);
  return (
    <div
      data-testid="kurs-profit-bar"
      className="hidden h-full min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 md:block"
    >
      <p>
        Kurs USD→Rp:{" "}
        <span className="font-semibold text-slate-200">
          {kurs === null
            ? "belum tersedia"
            : `Rp${kurs.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`}
        </span>
        {" · "}
        {new Date(nowMs).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "medium",
        })}
      </p>
      <p className="mt-0.5">
        Hasil (Total Profit × Kurs):{" "}
        <span
          data-testid="kurs-profit-idr"
          className={[
            "text-sm font-bold",
            hasil === null
              ? "text-slate-500"
              : hasil >= 0
                ? "text-emerald-300"
                : "text-red-300",
          ].join(" ")}
        >
          {hasil === null
            ? "-"
            : `${hasil >= 0 ? "+" : "-"}Rp${Math.abs(hasil).toLocaleString("id-ID")}`}
        </span>
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {`Kurs acuan ECB${fxRates?.ecbDate !== undefined ? ` tgl ${fxRates.ecbDate}` : ""}`}
        , diperbarui sekali per hari kerja; indikatif, bukan kurs pajak (KMK)
        atau kurs broker.
      </p>
    </div>
  );
}
