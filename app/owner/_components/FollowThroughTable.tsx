'use client';

import { useState } from 'react';
import { Avatar } from '@/app/_components/Avatar';
import { prettyName } from '@/lib/gymNames';
import { durationLabel, isLongWait, reviewedLabel, waitedLabel, type CoachFollowThrough } from '@/lib/followThrough';
import type { FollowThroughLoad } from '@/lib/data/coachFollowThrough';

// What each coach at a gym did (RO19): check-ins reviewed against due, members waiting for a reply and the oldest wait, and the usual
// reply time. Counts and times only. A table from a small tablet up; on a phone each coach is a row with the same facts.

const waitTone = (c: CoachFollowThrough, now: Date) =>
  c.waiting === 0 ? '' : isLongWait(c.oldestWaitingSince, now) ? 'font-semibold text-danger' : 'font-semibold text-warning';

export function FollowThroughTable({ load }: { load: FollowThroughLoad | undefined }) {
  const [now] = useState(() => new Date());
  if (!load) return <p className="text-sm text-zinc-500">Not loaded.</p>;
  if (!load.ok) return <p className="text-sm text-zinc-500" role="status">{load.error}</p>;
  const coaches = load.data.coaches;
  if (coaches.length === 0) return <p className="text-sm text-zinc-500">No coaches in this gym yet.</p>;

  return (
    <>
      <ul className="divide-y divide-black/[.05] text-sm sm:hidden dark:divide-white/10">
        {coaches.map((c) => (
          <li key={c.coachId} className="flex items-start gap-2.5 py-2.5">
            <Avatar name={prettyName(c.name)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-black dark:text-zinc-50">{prettyName(c.name)}</p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">Check-ins reviewed {reviewedLabel(c)}</p>
              <p className={`text-xs ${waitTone(c, now) || 'text-zinc-600 dark:text-zinc-300'}`}>
                {c.waiting === 0 ? 'Nobody waiting for a reply' : `${c.waiting} waiting for a reply${c.oldestWaitingSince ? `, oldest ${waitedLabel(c.oldestWaitingSince, now)}` : ''}`}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                {c.medianReplySeconds === null ? 'No replies in the last 30 days' : `Usually replies in ${durationLabel(c.medianReplySeconds)} (${c.replies} repl${c.replies === 1 ? 'y' : 'ies'})`}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[26rem] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-1.5 pr-2 font-bold">Coach</th>
              <th className="px-2 py-1.5 text-right font-bold">Check-ins reviewed</th>
              <th className="px-2 py-1.5 text-right font-bold">Waiting for a reply</th>
              <th className="px-2 py-1.5 text-right font-bold">Oldest waiting</th>
              <th className="py-1.5 pl-2 text-right font-bold">Usual reply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
            {coaches.map((c) => (
              <tr key={c.coachId}>
                <td className="py-2.5 pr-2">
                  <p className="max-w-[10rem] truncate font-bold text-black dark:text-zinc-50">{prettyName(c.name)}</p>
                </td>
                <td className="px-2 py-2.5 text-right">{reviewedLabel(c)}</td>
                <td className={`px-2 py-2.5 text-right ${waitTone(c, now)}`}>{c.waiting}</td>
                <td className={`px-2 py-2.5 text-right ${waitTone(c, now)}`}>{c.oldestWaitingSince ? waitedLabel(c.oldestWaitingSince, now) : '–'}</td>
                <td className="py-2.5 pl-2 text-right" title={c.replies > 0 ? `Median of ${c.replies} repl${c.replies === 1 ? 'y' : 'ies'}` : undefined}>
                  {c.medianReplySeconds === null ? '–' : durationLabel(c.medianReplySeconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        Check-ins: weeks a member logged anything in, last {load.data.weeks} complete weeks, and how many the coach marked reviewed. Waiting:
        conversations where the member wrote last (not marked &ldquo;No reply needed&rdquo;). Usual reply: the median wait over the last 30 days.
      </p>
    </>
  );
}
