'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { prettyName } from '@/lib/gymNames';
import type { BusinessOverview } from '@/lib/data/coachDashboard';
import { durationLabel, isLongWait, reviewedLabel, waitedLabel, type CoachFollowThrough } from '@/lib/followThrough';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import { CoachSection, CoachStatStrip, coachRow } from '../../_components/CoachUi';

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// One member on a follow-up list: who, why, and what to do about it.
function MemberRow({ href, name, line, action, actionCls = 'text-accent' }: { href: string; name: string; line?: string; action: string; actionCls?: string }) {
  return (
    <Link href={href} className={`${coachRow} flex min-h-[60px] items-center gap-3 py-2 hover:bg-black/[.02] dark:hover:bg-white/[.03]`}>
      <Avatar name={name} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-black dark:text-zinc-50">{name}</span>
        {line && <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{line}</span>}
      </span>
      <span className={`shrink-0 text-sm font-bold ${actionCls}`}>{action}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
    </Link>
  );
}

// What the coach did (RO19, CW5): "Check-ins reviewed 7 of 9 · 2 waiting for a reply (oldest 3 days) · usually replies in 2 h".
function FollowThroughLine({ f, now }: { f: CoachFollowThrough; now: Date }) {
  const long = isLongWait(f.oldestWaitingSince, now);
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
      <span>Check-ins reviewed {reviewedLabel(f)}</span>
      <span aria-hidden>·</span>
      <span className={f.waiting > 0 ? (long ? 'font-semibold text-red-700 dark:text-red-400' : 'font-semibold text-amber-700 dark:text-amber-400') : undefined}>
        {f.waiting === 0
          ? 'Nobody waiting for a reply'
          : `${f.waiting} waiting for a reply${f.oldestWaitingSince ? ` (oldest ${waitedLabel(f.oldestWaitingSince, now)})` : ''}`}
      </span>
      <span aria-hidden>·</span>
      <span>{f.medianReplySeconds === null ? 'No replies in 30 days' : `Usually replies in ${durationLabel(f.medianReplySeconds)}`}</span>
    </p>
  );
}

// The owner/manager's picture of the gym (the November 2026 mock-ups): the headline figures, members by plan, how each coach's members
// are doing this week, and the members whose plan needs something.
export function OverviewPane({ data }: { data: BusinessOverview }) {
  const maxPlan = Math.max(1, ...data.plans.map((p) => p.count));
  const noPlanCount = Math.max(0, data.members - data.onPlan);
  const attendedDelta = data.attendedThisMonth - data.attendedLastMonth;
  // The plan and team bars fill when the overview opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.2);
  const follow = data.followThrough.ok ? new Map(data.followThrough.data.coaches.map((c) => [c.coachId, c])) : null;
  const [now] = useState(() => new Date());

  return (
    <div ref={screen} className="space-y-6">
      <CoachStatStrip
        label="The gym at a glance"
        stats={[
          { label: 'Members', value: data.members },
          { label: 'On a plan', value: data.onPlan, sub: noPlanCount > 0 ? `${noPlanCount} have no plan` : 'Everyone has a plan' },
          { label: 'Joined this month', value: data.newThisMonth, sub: data.noPlan.length > 0 ? `${data.noPlan.length} waiting for their plan` : undefined },
          {
            label: 'Sessions attended',
            value: data.attendedThisMonth,
            tone: attendedDelta > 0 ? 'teal' : undefined,
            sub: `${data.attendedLastMonth} last month`,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <CoachSection title="Members by plan">
            {data.plans.length === 0 && <p className={`${coachRow} py-4 text-sm text-zinc-500`}>Nobody is on a plan yet.</p>}
            {data.plans.map((p) => (
              <div key={p.name} className={`${coachRow} flex flex-wrap items-center gap-x-4 gap-y-2 py-3`}>
                <span className="min-w-0 flex-1 basis-40 text-[15px] font-bold text-black dark:text-zinc-50">{p.name}</span>
                <span className="h-2 flex-[2] basis-48 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${p.count} of ${data.members} members`}>
                  <span data-grow="bar" className="block h-full rounded-full bg-accent" style={{ width: `${(p.count / maxPlan) * 100}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-bold text-black dark:text-zinc-50">
                  {p.count} member{p.count === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </CoachSection>

          <CoachSection title="Team this week">
            {data.team.length > 0 && (
              <p className={`${coachRow} py-2.5 text-[13px] text-zinc-500 dark:text-zinc-400`} role={data.followThrough.ok ? undefined : 'status'}>
                {data.followThrough.ok
                  ? 'Check-ins reviewed: weeks a member logged anything in, over the last 4 complete weeks. Waiting: conversations where the member wrote last. Reply time: the usual (median) wait over the last 30 days.'
                  : `What each coach did could not be shown. ${data.followThrough.error}`}
              </p>
            )}
            {data.team.length === 0 && <p className={`${coachRow} py-4 text-sm text-zinc-500`}>No coaches at this gym yet.</p>}
            {data.team.map((t) => (
              <Link
                key={t.coachId}
                href={`/coach?scope=coach&coach=${t.coachId}`}
                className={`${coachRow} flex min-h-[64px] items-center gap-3 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.03]`}
              >
                <Avatar name={prettyName(t.name)} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-black dark:text-zinc-50">{prettyName(t.name)}</p>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    {t.members} member{t.members === 1 ? '' : 's'} · {t.eligible > 0 ? `${t.checkedIn} of ${t.eligible} checked in` : 'no check-ins due yet'}
                  </p>
                  <div className="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div data-grow="bar" className="h-full rounded-full bg-accent" style={{ width: `${t.eligible > 0 ? (t.checkedIn / t.eligible) * 100 : 0}%` }} />
                  </div>
                  {follow?.get(t.coachId) && <FollowThroughLine f={follow.get(t.coachId)!} now={now} />}
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  {t.quiet > 0 && (
                    <span className="block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-extrabold text-red-800 dark:bg-red-500/15 dark:text-red-300">{t.quiet} quiet</span>
                  )}
                  {t.toReview > 0 && (
                    <span className="block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                      {t.toReview} to review
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            ))}
          </CoachSection>
        </div>

        <div className="min-w-0 space-y-6">
          {data.noPlan.length > 0 && (
            <CoachSection title="Needs setting up" count={data.noPlan.length}>
              {data.noPlan.slice(0, 8).map((m) => (
                <MemberRow key={m.clientId} href={`/coach/clients/${m.clientId}?open=profile`} name={m.name} line="No plan yet" action="Set up plan" />
              ))}
              {data.noPlan.length > 8 && (
                <Link href="/coach/clients?filter=noplan" className={`${coachRow} flex min-h-11 items-center text-sm font-bold text-accent`}>
                  and {data.noPlan.length - 8} more on Clients
                </Link>
              )}
            </CoachSection>
          )}

          {data.endingSoon.length > 0 && (
            <CoachSection title="Plans ending soon" count={data.endingSoon.length} action={<span className="text-[13px] font-semibold text-zinc-500">Next 14 days</span>}>
              {data.endingSoon.map((m) => (
                <MemberRow
                  key={m.clientId}
                  href={`/coach/clients/${m.clientId}?open=profile`}
                  name={m.name}
                  line={m.plan}
                  action={`Ends ${shortDay(m.endsOn)}`}
                  actionCls="text-amber-700 dark:text-amber-400"
                />
              ))}
            </CoachSection>
          )}

          {data.recentlyEnded.length > 0 && (
            <CoachSection title="Plan ended" count={data.recentlyEnded.length} action={<span className="text-[13px] font-semibold text-zinc-500">Last 30 days</span>}>
              {data.recentlyEnded.map((m) => (
                <MemberRow
                  key={m.clientId}
                  href={`/coach/clients/${m.clientId}?open=messages`}
                  name={m.name}
                  line={`${m.plan} · ended ${shortDay(m.endedOn)}`}
                  action="Message"
                />
              ))}
            </CoachSection>
          )}
        </div>
      </div>
    </div>
  );
}
