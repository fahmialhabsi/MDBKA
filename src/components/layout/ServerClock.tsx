import { Clock } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import {
  formatClock12,
  serverUtcOffsetHours,
  WIT_UTC_OFFSET,
} from "../../lib/serverClock";
import type { BrokerId } from "../../types/broker";

interface Props {
  readonly brokerId: BrokerId;
  /** Jam server quote live terakhir (untuk deteksi zona), boleh null. */
  readonly quoteServerTime: string | null;
}

const BROKER_LABEL: Record<BrokerId, string> = {
  finex: "Finex",
  orbitraderberjangka: "OTB",
};

/** Jam server MT5 broker aktif + jam WIT, berdetak tiap detik (12 jam). */
export function ServerClock({ brokerId, quoteServerTime }: Props) {
  const now = useNow(1000);
  const offset = serverUtcOffsetHours(brokerId, quoteServerTime, now);
  const diff = WIT_UTC_OFFSET - offset;
  return (
    <div
      data-testid="server-clock"
      className="flex h-full min-w-0 flex-col justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5"
    >
      <p className="flex items-center gap-2 text-slate-300">
        <Clock size={14} className="text-emerald-400" />
        Jam server MT5 {BROKER_LABEL[brokerId] ?? brokerId}:{" "}
        <b className="font-mono text-white">{formatClock12(now, offset)}</b>
      </p>
      <p className="text-slate-400">
        Jam WIT (laptop):{" "}
        <b className="font-mono text-emerald-300">{formatClock12(now, WIT_UTC_OFFSET)}</b>
        <span className="text-xs text-slate-500"> · WIT = server + {diff} jam</span>
      </p>
    </div>
  );
}
