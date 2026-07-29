import type { HabitLogRow } from '@/lib/data/types';

export function adherencePercent(logs: HabitLogRow[]): number {
  if (logs.length === 0) return 0;
  const completed = logs.filter((l) => l.completed).length;
  return Math.round((completed / logs.length) * 100);
}
