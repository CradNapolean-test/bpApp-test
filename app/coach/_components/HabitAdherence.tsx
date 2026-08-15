import Link from 'next/link';
import { Avatar } from '@/app/_components/Avatar';
import type { ClientHabitAdherence } from '@/lib/data/coach';

// Roster-wide "who's on track with habits today" -- mirrors ProgramHealth.tsx's exact shape
// (bucketed preview list, worst-first, "+N more" overflow) for the same reason that widget
// looks the way it does: consistent at-a-glance scanning across every roster widget, not a
// one-off design.
const PREVIEW_LIMIT = 8;

export function HabitAdherence({ adherence }: { adherence: ClientHabitAdherence[] }) {
  if (adherence.length === 0) return null;

  const behind = adherence
    .filter((c) => c.completedToday < c.totalHabits)
    .sort((a, b) => a.completedToday / a.totalHabits - b.completedToday / b.totalHabits);

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-black dark:text-zinc-50">Habit adherence today</h3>
        <span className="text-sm text-zinc-400">{behind.length}</span>
      </div>
      <div className="mt-2 space-y-2">
        {behind.length === 0 && <p className="text-sm text-zinc-500">Everyone&apos;s completed today&apos;s habits.</p>}
        {behind.slice(0, PREVIEW_LIMIT).map((c) => (
          <Link
            key={c.clientId}
            href={`/coach/clients/${c.clientId}`}
            className="flex items-center gap-3 rounded-xl border border-black/[.05] p-3 hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
          >
            <Avatar name={c.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-black dark:text-zinc-50">{c.name}</p>
            </div>
            <span className="shrink-0 text-sm font-medium text-zinc-500">
              {c.completedToday}/{c.totalHabits}
            </span>
          </Link>
        ))}
        {behind.length > PREVIEW_LIMIT && (
          <p className="text-xs text-zinc-400">+{behind.length - PREVIEW_LIMIT} more.</p>
        )}
      </div>
    </div>
  );
}
