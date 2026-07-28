import { isoWeekKey } from '@/lib/utils/dates';
import { dayCalories } from '@/lib/calculations';
import type { DailyLogRow } from '@/lib/data/types';

interface WeekPoint {
  weekStart: string;
  avgBodyweight: number | null;
  avgCalories: number | null;
  avgSteps: number | null;
  loggedDays: number;
}

function buildWeeklyTrend(logs: DailyLogRow[]): WeekPoint[] {
  const byWeek = new Map<string, DailyLogRow[]>();
  for (const log of logs) {
    const week = isoWeekKey(log.log_date);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(log);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, weekLogs]) => {
      const bw = weekLogs.filter((l) => l.bodyweight != null).map((l) => l.bodyweight as number);
      const withMacros = weekLogs.filter((l) => l.protein != null || l.carbs != null || l.fat != null);
      const steps = weekLogs.filter((l) => l.steps != null).map((l) => l.steps as number);
      return {
        weekStart,
        avgBodyweight: bw.length ? bw.reduce((a, b) => a + b, 0) / bw.length : null,
        avgCalories: withMacros.length
          ? withMacros.reduce((sum, l) => sum + dayCalories(l.protein ?? 0, l.carbs ?? 0, l.fat ?? 0), 0) /
            withMacros.length
          : null,
        avgSteps: steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : null,
        loggedDays: weekLogs.length,
      };
    });
}

export function OverviewTab({ historyLogs }: { historyLogs: DailyLogRow[] }) {
  const weeks = buildWeeklyTrend(historyLogs);

  if (weeks.length === 0) {
    return <p className="text-sm text-zinc-500">No logged days yet — trends will appear once you log some.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/10">
            <th className="p-3 font-medium">Week of</th>
            <th className="p-3 font-medium">Avg bodyweight</th>
            <th className="p-3 font-medium">Avg calories</th>
            <th className="p-3 font-medium">Avg steps</th>
            <th className="p-3 font-medium">Logged days</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart} className="border-b border-black/5 last:border-0 dark:border-white/5">
              <td className="p-3">
                {new Date(w.weekStart + 'T00:00:00Z').toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', timeZone: 'UTC',
                })}
              </td>
              <td className="p-3">{w.avgBodyweight ? `${w.avgBodyweight.toFixed(1)} kg` : '—'}</td>
              <td className="p-3">{w.avgCalories ? `${Math.round(w.avgCalories)} kcal` : '—'}</td>
              <td className="p-3">{w.avgSteps ? Math.round(w.avgSteps) : '—'}</td>
              <td className="p-3">{w.loggedDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
