import Link from 'next/link';
import { Avatar } from '@/app/_components/Avatar';
import { StatusBadge } from '@/app/_components/StatusBadge';
import type { ClientHealthStatus } from '@/lib/data/coach';

// At roster scale the flagged set can hold dozens of clients; dumping them all inline buries
// the widget. Show a handful, worst-first, and defer the rest to the sortable client table
// below (matches the design's flat "bucketed list" -- no accordion, straight to Client Detail).
const PREVIEW_LIMIT = 8;

export function ProgramHealth({ statuses }: { statuses: ClientHealthStatus[] }) {
  const flagged = statuses
    .filter((s) => s.status === 'red' || s.status === 'amber')
    .sort((a, b) => (a.status === b.status ? b.daysSinceActive - a.daysSinceActive : a.status === 'red' ? -1 : 1));
  const unmonitoredCount = statuses.filter((s) => s.status === 'unmonitored').length;

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-black dark:text-zinc-50">Program health</h3>
        <span className="text-sm text-zinc-400">{flagged.length}</span>
      </div>
      <div className="mt-2 space-y-2">
        {flagged.length === 0 && <p className="text-sm text-zinc-500">Everyone&apos;s on track.</p>}
        {flagged.slice(0, PREVIEW_LIMIT).map((c) => (
          <Link
            key={c.clientId}
            href={`/coach/clients/${c.clientId}`}
            className="flex items-center gap-3 rounded-xl border border-black/[.05] p-3 hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
          >
            <Avatar name={c.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-black dark:text-zinc-50">{c.name}</p>
              <p className="truncate text-sm text-zinc-500">
                {c.lastActiveDate ? `No log in ${c.daysSinceActive} days` : 'Never logged'}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </Link>
        ))}
        {flagged.length > PREVIEW_LIMIT && (
          <p className="text-xs text-zinc-400">+{flagged.length - PREVIEW_LIMIT} more — see the full list below.</p>
        )}
      </div>
      {unmonitoredCount > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          {unmonitoredCount} client{unmonitoredCount === 1 ? '' : 's'} not monitored (reminders off).
        </p>
      )}
    </div>
  );
}
