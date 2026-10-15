/**
 * PR-2 (Tahap 17, 15 Okt 2026) — catatan waspada per simbol + sidik jari
 * (rancangan tim bagian 12, jalur CEPAT). MURNI. Setelah rangkaian rugi
 * (Pupare Rebus), simbol itu diberi catatan di layar selama 14 hari:
 * sebab rugi (Tim 4, arah D1) + rekomendasi + riwayat sidik jarinya.
 * HANYA PERINGATAN — tidak menahan sinyal dan tidak mengubah aturan.
 */
import { serverTimeMs } from "./lossStreakGuard";
import { CAUSE_ROUTES, type LossCause } from "./lossLesson";
import type { FingerprintNote, PatternCardView } from "./patternCards";

export const CAUTION_DAYS = 14;

const CAUSE_TEXT: Readonly<Partial<Record<LossCause, string>>> = {
  MELAWAN_SEJAK_MASUK: "melawan sejak masuk",
  BERBALIK_SETELAH_0_5R: "sempat ≥0,5R lalu berbalik",
  MELAWAN_ARAH_D1: "melawan arah D1",
};

export interface CautionNote {
  readonly symbol: string;
  readonly cardName: string;
  readonly startTime: string;
  readonly r: number | null;
  readonly causes: readonly LossCause[];
  readonly text: string;
}

/** Sebab yang pasti dari kartu: Tim 4 (MFE) + melawan arah D1. */
export function cardCauses(v: PatternCardView): LossCause[] {
  const out: LossCause[] = [];
  const c = v.insight.lossCause;
  if (c === "MELAWAN_SEJAK_MASUK" || c === "BERBALIK_SETELAH_0_5R") out.push(c);
  if ((v.card.side === "BUY" && v.d1 === "TURUN") || (v.card.side === "SELL" && v.d1 === "NAIK")) out.push("MELAWAN_ARAH_D1");
  return out;
}

/** Catatan waspada terbaru per simbol (rangkaian rugi ≤ 14 hari dari `nowMs`, jam server diperlakukan UTC). */
export function cautionNotes(views: readonly PatternCardView[], notes: readonly FingerprintNote[], nowMs: number): CautionNote[] {
  const latest = new Map<string, PatternCardView>();
  for (const v of views) {
    if (v.card.label !== "Pupare Rebus" || v.card.cardName === null) continue;
    const t = serverTimeMs(v.card.startTime);
    if (t === null || nowMs - t > CAUTION_DAYS * 86_400_000) continue;
    const prev = latest.get(v.card.symbol);
    if (prev === undefined || v.card.startTime > prev.card.startTime) latest.set(v.card.symbol, v);
  }
  return [...latest.values()].map((v) => {
    const causes = cardCauses(v);
    const note = notes.find((n) => n.fingerprint === v.fingerprint);
    const why = causes.length === 0 ? "sebab belum pasti" : causes.map((c) => `${CAUSE_TEXT[c] ?? c} → ${CAUSE_ROUTES[c].rekomendasi}`).join("; ");
    const r = v.card.r === null ? "" : `, ${v.card.r.toFixed(2).replace(".", ",")}R`;
    return {
      symbol: v.card.symbol,
      cardName: v.card.cardName ?? "",
      startTime: v.card.startTime,
      r: v.card.r,
      causes,
      text:
        `Waspada: ${v.card.cardName} (${v.card.startTime.slice(0, 10)}${r}) — ${why}.` +
        (note === undefined ? "" : ` Sidik jari ${v.fingerprint.replace(/\|/g, "·")}: ${note.text}.`) +
        " Hanya peringatan, tidak menahan.",
    };
  });
}
