/**
 * LB-1 (13 Okt 2026) — panel laju bukti (rancangan tim 11.3). MURNI.
 * Per golongan: jumlah trade bayangan (selesai), trade uji (demo lab), dan
 * entry setara Live, laju 28 hari terakhir per minggu, serta perkiraan
 * berapa minggu lagi mencapai 20 (null = laju 0, tidak bisa diperkirakan).
 */
export type EvidenceKind = "BAYANGAN" | "UJI" | "SETARA_LIVE";

export interface EvidenceEvent {
  readonly group: string;
  readonly kind: EvidenceKind;
  /** ms UTC kejadian. */
  readonly atMs: number;
}

export interface EvidenceCell {
  readonly total: number;
  readonly perWeek: number;
  readonly weeksTo20: number | null;
}

export interface EvidenceRow {
  readonly group: string;
  readonly cells: Readonly<Record<EvidenceKind, EvidenceCell>>;
}

const WEEK_MS = 7 * 86_400_000;
export const PACE_WINDOW_WEEKS = 4;
export const PACE_TARGET = 20;

export function evidencePace(events: readonly EvidenceEvent[], nowMs: number): EvidenceRow[] {
  const groups = [...new Set(events.map((e) => e.group))].sort();
  const kinds: EvidenceKind[] = ["BAYANGAN", "UJI", "SETARA_LIVE"];
  return groups.map((group) => {
    const cell = (kind: EvidenceKind): EvidenceCell => {
      const list = events.filter((e) => e.group === group && e.kind === kind && e.atMs <= nowMs);
      const recent = list.filter((e) => nowMs - e.atMs < PACE_WINDOW_WEEKS * WEEK_MS).length;
      const perWeek = Math.round((recent / PACE_WINDOW_WEEKS) * 10) / 10;
      const remaining = Math.max(0, PACE_TARGET - list.length);
      return {
        total: list.length,
        perWeek,
        weeksTo20: remaining === 0 ? 0 : perWeek > 0 ? Math.ceil(remaining / perWeek) : null,
      };
    };
    return { group, cells: { BAYANGAN: cell("BAYANGAN"), UJI: cell("UJI"), SETARA_LIVE: cell("SETARA_LIVE") } as Record<EvidenceKind, EvidenceCell> };
  }).filter((r) => kinds.some((k) => r.cells[k].total > 0));
}
