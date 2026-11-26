import { gridCsv, scoresCsv, type MemberInfo, type RawScore } from '@/lib/bigDogExport';
import { toCsv } from '@/lib/csv';

// The Peak Week score downloads on the coach's Classes → Reports (they were on Business → Rewards until BO9). The same two files as
// before: one row per score, or one row per member, named peak-week-<layout>-<YYYY-MM-DD>.csv, with just a "Member" header when there
// are no scores yet.
export type ScoresLayout = 'scores' | 'grid';

export function peakWeekScoresFile(
  layout: ScoresLayout,
  raw: RawScore[],
  members: Record<string, MemberInfo>,
  stamp: string
): { name: string; text: string } {
  const name = `peak-week-${layout}-${stamp}.csv`;
  if (raw.length === 0) return { name, text: toCsv(['Member'], []) };
  const map = new Map(Object.entries(members));
  return { name, text: layout === 'scores' ? scoresCsv(raw, map) : gridCsv(raw, map) };
}
