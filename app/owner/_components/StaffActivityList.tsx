'use client';

import { useState } from 'react';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { getOwnerStaffActivity } from '@/lib/data/owner';
import { settle } from '@/lib/ownerReport';
import { hasNextPage, hasPreviousPage, previousOffset, rangeLabel } from '@/lib/ownerRoster';
import { describeStaffActivity, type StaffActivityPage } from '@/lib/staffActivity';
import { formatDateTime } from '@/lib/utils/dates';
import { READ_NEEDS_0176 } from '@/lib/followThrough';

// SE23: who did what to the team, and when, newest first: coaches added and removed, members moved, gym admin switched on or off, a login
// switched back on. Read through owner_staff_activity (migration 0176), for the gym picked above. Nobody can change or remove a row.

const card = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';

export function StaffActivityList({ gymId }: { gymId: string | null }) {
  const [page, setPage] = useState<{ gym: string | null; offset: number }>({ gym: gymId, offset: 0 });
  // A different gym starts again from the newest.
  const offset = page.gym === gymId ? page.offset : 0;
  const { data: answer, loading, reload } = useOnDemand(() => settle(() => getOwnerStaffActivity(gymId, offset)), `staff|${gymId ?? 'all'}|${offset}`);
  const result = answer?.ok ? answer.data : null;
  const showGym = gymId === null;

  return (
    <section className={card}>
      <div className="mb-3">
        <h3 className="text-base font-extrabold text-black dark:text-zinc-50">Staff activity</h3>
        <p className="text-xs text-zinc-500">
          Coaches added and removed, members moved to another coach, gym admin switched on or off, and logins switched back on. Newest first. Only
          you can see this list, and nobody can change it.
        </p>
      </div>

      {answer == null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !answer.ok ? (
        <div role="alert">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{answer.error}</p>
          {answer.error !== READ_NEEDS_0176 && (
            <button type="button" onClick={reload} className="mt-3 inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground">
              Try again
            </button>
          )}
        </div>
      ) : result && result.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing recorded yet.</p>
      ) : result ? (
        <StaffActivityRows result={result} showGym={showGym} loading={loading} onOffset={(next) => setPage({ gym: gymId, offset: next })} />
      ) : null}
    </section>
  );
}

// One page of the record, with Newer / Older.
export function StaffActivityRows({
  result,
  showGym,
  loading,
  onOffset,
}: {
  result: StaffActivityPage;
  showGym: boolean;
  loading: boolean;
  onOffset: (offset: number) => void;
}) {
  return (
    <>
      <ul className="divide-y divide-black/[.06] dark:divide-white/10">
        {result.rows.map((r) => (
          <li key={r.key} className="py-2.5">
            <p className="break-words text-sm font-semibold text-black dark:text-zinc-50">{describeStaffActivity(r)}</p>
            <p className="text-xs text-zinc-500">
              {showGym && r.gymName ? `${r.gymName} · ` : ''}
              {formatDateTime(r.at)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span aria-live="polite">{rangeLabel(result.total, result.limit, result.offset)}</span>
        <span className="flex gap-2">
          <button
            type="button"
            disabled={!hasPreviousPage(result.offset) || loading}
            onClick={() => onOffset(previousOffset(result.limit, result.offset))}
            className="inline-flex h-9 items-center rounded-xl border-[1.5px] border-black/20 px-3 font-bold disabled:opacity-40 dark:border-white/25"
          >
            Newer
          </button>
          <button
            type="button"
            disabled={!hasNextPage(result.total, result.limit, result.offset) || loading}
            onClick={() => onOffset(result.offset + result.limit)}
            className="inline-flex h-9 items-center rounded-xl border-[1.5px] border-black/20 px-3 font-bold disabled:opacity-40 dark:border-white/25"
          >
            Older
          </button>
        </span>
      </div>
    </>
  );
}
