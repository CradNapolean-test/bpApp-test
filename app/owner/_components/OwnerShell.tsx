'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { EmptyState } from '@/app/_components/EmptyState';
import { Logo } from '@/app/_components/Logo';
import { Segmented } from '@/app/_components/ui';
import { ReportsPane } from './ReportsPane';
import { brandParts, prettyName, shortGymName } from '@/lib/gymNames';
import { LOAD_FAILED, monthToDateChange } from '@/lib/ownerReport';
import { rosterHref, type RosterFilter } from '@/lib/ownerRoster';
import type { OwnerGym, OwnerGymStats, OwnerTeamRow } from '@/lib/data/owner';

// The owner's home: every gym in the organisation side by side, with a filter to look at one. The numbers
// match the gym admin's Business overview so the two screens agree. Every number for a single gym opens the list of members behind it.

function Stat({ label, value, tone, sub, href }: { label: string; value: number | string; tone?: 'warning' | 'danger'; sub?: string; href?: string }) {
  const color = tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-black dark:text-zinc-50';
  const body = (
    <>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="flex items-center gap-1 text-xs text-zinc-500">
        {label}
        {href && <ChevronRight className="h-3 w-3" aria-hidden />}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-400">{sub}</p>}
    </>
  );
  const cls = 'rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10';
  return href ? (
    <Link href={href} className={`block ${cls} hover:border-accent/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const sum = (list: OwnerGymStats[], pick: (s: OwnerGymStats) => number) => list.reduce((n, s) => n + pick(s), 0);
const sumOptional = (list: OwnerGymStats[], pick: (s: OwnerGymStats) => number | undefined): number | undefined =>
  list.length > 0 && list.every((s) => pick(s) !== undefined) ? list.reduce((n, s) => n + (pick(s) ?? 0), 0) : undefined;

type NumbersInput = Pick<
  OwnerGymStats,
  'members' | 'onPlan' | 'newThisMonth' | 'leftLast30' | 'endingSoon' | 'attendedThisMonth' | 'attendedLastMonth' | 'unmarkedSessions'
> &
  Partial<Pick<OwnerGymStats, 'onboarded' | 'attendedLastMonthToDate' | 'dayOfMonth'>>;

function Numbers({ s, gymId }: { s: NumbersInput; gymId?: string }) {
  const link = (filter?: RosterFilter) => (gymId ? rosterHref(gymId, filter) : undefined);
  const delta = monthToDateChange(s.attendedThisMonth, s.attendedLastMonthToDate, s.dayOfMonth);
  const noPlan = Math.max(0, s.members - s.onPlan);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Members" value={s.members} sub={s.onboarded != null ? `${s.onboarded} finished onboarding` : undefined} href={link()} />
        <Stat label="On a plan" value={s.onPlan} href={link('on_plan')} />
        <Stat label="No plan" value={noPlan} tone={noPlan > 0 ? 'warning' : undefined} href={link('no_plan')} />
        <Stat label="New this month" value={s.newThisMonth} href={link('new_this_month')} />
        <Stat label="Plan ended, last 30 days" value={s.leftLast30} href={link('left_last_30')} />
        <Stat label="Plans ending, next 14 days" value={s.endingSoon} href={link('ending_soon')} />
      </div>
      <div className="mt-2 rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
        <p className="text-xs text-zinc-500">Classes attended this month so far</p>
        <p className="text-2xl font-black text-black dark:text-zinc-50">{s.attendedThisMonth}</p>
        <p className="text-xs text-zinc-500">
          Last month, in total: {s.attendedLastMonth}
          {s.attendedLastMonthToDate != null && ` · same days last month: ${s.attendedLastMonthToDate}`}
          {delta ? ` · ${delta}` : ''}
        </p>
      </div>
      {s.unmarkedSessions > 0 && (
        <p className="mt-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
          {s.unmarkedSessions} past {s.unmarkedSessions === 1 ? 'booking is' : 'bookings are'} not marked attended or no-show.
        </p>
      )}
    </>
  );
}

function TeamTable({ team }: { team: OwnerTeamRow[] }) {
  if (team.length === 0) return <p className="text-sm text-zinc-500">No coaches in this gym yet.</p>;
  // "Gym admin" says nothing when every coach is one; it is only worth a label when some are not.
  const labelAdmins = team.some((c) => !c.isAdmin);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
            <th className="py-1.5 pr-2 font-bold">Coach</th>
            <th className="px-2 py-1.5 text-right font-bold">Members</th>
            <th className="px-2 py-1.5 text-right font-bold">Logged this week</th>
            <th className="px-2 py-1.5 text-right font-bold">Quiet 7+ days</th>
            <th className="py-1.5 pl-2 text-right font-bold">To review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[.05] dark:divide-white/10">
          {team.map((c) => {
            const name = prettyName(c.name);
            return (
              <tr key={c.coachId}>
                <td className="py-2.5 pr-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0">
                      <p className="max-w-[10rem] truncate font-bold text-black dark:text-zinc-50">{name}</p>
                      {labelAdmins && c.isAdmin && <p className="text-xs text-zinc-500">Gym admin</p>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right font-semibold">{c.members}</td>
                <td className="px-2 py-2.5 text-right">{c.eligible === 0 ? '–' : `${c.checkedIn} of ${c.eligible}`}</td>
                <td className={`px-2 py-2.5 text-right ${c.quiet > 0 ? 'font-semibold text-warning' : ''}`}>{c.quiet}</td>
                <td className={`py-2.5 pl-2 text-right ${c.toReview > 0 ? 'font-semibold text-accent' : ''}`}>{c.toReview}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlanMix({ plans }: { plans: { name: string; count: number }[] }) {
  if (plans.length === 0) return <p className="text-sm text-zinc-500">No one is on a plan.</p>;
  const max = Math.max(1, ...plans.map((p) => p.count));
  return (
    <ul className="space-y-2">
      {plans.map((p) => (
        <li key={p.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-semibold text-black dark:text-zinc-50">{p.name}</span>
            <span className="shrink-0 text-zinc-500">{p.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (p.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function RedFlagLine({ rf, gymId }: { rf: OwnerGymStats['redFlags']; gymId?: string }) {
  if (!rf) return <p className="text-sm text-zinc-500">The red flag tracker has not run yet.</p>;
  const flagged = <b className="text-black dark:text-zinc-50">{rf.flagged}</b>;
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-300">
      Week of {weekLabel(rf.weekStart)}:{' '}
      {gymId && rf.flagged > 0 ? (
        <Link href={rosterHref(gymId, 'flagged')} className="underline decoration-dotted underline-offset-2">
          {flagged} flagged
        </Link>
      ) : (
        <>{flagged} flagged</>
      )}
      , <b className={rf.waiting > 0 ? 'text-warning' : 'text-black dark:text-zinc-50'}>{rf.waiting}</b> not contacted yet.
    </p>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{children}</p>;
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-black/10 p-6 text-center dark:border-white/15" role="alert">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
        Try again
      </button>
    </div>
  );
}

function GymCard({ gym, title, stats, onRetry }: { gym: OwnerGym; title: string; stats: OwnerGymStats | undefined; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Building2 className="h-5 w-5 shrink-0 text-accent" />
          <h2 className="truncate text-lg font-extrabold text-black dark:text-zinc-50">{title}</h2>
        </div>
        <Link href={rosterHref(gym.id)} className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-accent">
          Members and team <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {stats ? (
        <>
          <Numbers s={stats} gymId={gym.id} />
          <SectionLabel>Plans</SectionLabel>
          <PlanMix plans={stats.plans} />
          <SectionLabel>Red flags</SectionLabel>
          <RedFlagLine rf={stats.redFlags} gymId={gym.id} />
          <SectionLabel>Coaches</SectionLabel>
          <TeamTable team={stats.team} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Members" value={gym.members} href={rosterHref(gym.id)} />
            <Stat label="Coaches" value={gym.coaches.length} />
          </div>
          <div className="mt-3">
            <Retry message="The full figures could not be loaded." onRetry={onRetry} />
          </div>
        </>
      )}
    </section>
  );
}

export function OwnerShell({
  gyms,
  stats,
  email,
  orgName,
}: {
  // null when the list of gyms could not be loaded (as opposed to an empty organisation).
  gyms: OwnerGym[] | null;
  stats: OwnerGymStats[] | null;
  email: string;
  orgName: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState<'overview' | 'reports'>('overview');
  const shown = gyms ? (filter === 'all' ? gyms : gyms.filter((g) => g.id === filter)) : [];
  const statsOf = (id: string) => stats?.find((s) => s.gymId === id);
  const shownStats = shown.map((g) => statsOf(g.id)).filter((s): s is OwnerGymStats => !!s);
  const names = (gyms ?? []).map((g) => g.name);
  const titleOf = (g: OwnerGym) => shortGymName(g.name, { organisationName: orgName, siblings: names });
  const totals = {
    members: sum(shownStats, (s) => s.members),
    onboarded: sumOptional(shownStats, (s) => s.onboarded),
    onPlan: sum(shownStats, (s) => s.onPlan),
    newThisMonth: sum(shownStats, (s) => s.newThisMonth),
    leftLast30: sum(shownStats, (s) => s.leftLast30),
    endingSoon: sum(shownStats, (s) => s.endingSoon),
    attendedThisMonth: sum(shownStats, (s) => s.attendedThisMonth),
    attendedLastMonth: sum(shownStats, (s) => s.attendedLastMonth),
    attendedLastMonthToDate: sumOptional(shownStats, (s) => s.attendedLastMonthToDate),
    dayOfMonth: shownStats.find((s) => s.dayOfMonth != null)?.dayOfMonth,
    unmarkedSessions: sum(shownStats, (s) => s.unmarkedSessions),
  };
  const flagged = sum(shownStats, (s) => s.redFlags?.flagged ?? 0);
  const waiting = sum(shownStats, (s) => s.redFlags?.waiting ?? 0);
  const brand = brandParts(orgName ?? 'Owner');
  const retry = () => router.refresh();

  return (
    <ClientOnly fallback={<PageSkeleton />}>
      <AppShell
        title={
          <>
            {brand.lead}
            {brand.accent && <span className="text-accent"> {brand.accent}</span>}
          </>
        }
        headerAction={
          <Link href="/owner/account" aria-label="Your account" className="rounded-xl">
            <Avatar name={email} size="md" variant="self" />
          </Link>
        }
        signOutOnMobile
        mobileHeader={
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <div className="leading-tight">
              <p className="text-[15px] font-black text-black dark:text-zinc-50">{brand.lead}</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Owner</p>
            </div>
          </div>
        }
      >
        <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50">{view === 'overview' ? 'Overview' : 'Reports'}</h1>
        <p className="mb-4 text-sm text-zinc-500">
          {view === 'overview' ? 'Every gym in the business, side by side.' : 'Check-ins and coach messaging over time.'}
        </p>
        {gyms !== null && gyms.length > 0 && (
          <div className="mb-4">
            <Segmented
              label="Section"
              value={view}
              onChange={setView}
              options={[{ value: 'overview', label: 'Overview' }, { value: 'reports', label: 'Reports' }]}
            />
          </div>
        )}

        {gyms === null ? (
          <Retry message={LOAD_FAILED} onRetry={retry} />
        ) : gyms.length === 0 ? (
          <EmptyState icon={Building2} title="No gyms in your organisation yet" hint="Gyms are added to the organisation when the owner account is created." />
        ) : (
          <div className="space-y-4">
            {gyms.length > 1 && (
              <Segmented
                label="Gym"
                value={filter}
                onChange={setFilter}
                options={[{ value: 'all', label: 'All gyms' }, ...gyms.map((g) => ({ value: g.id, label: titleOf(g) }))]}
              />
            )}

            {view === 'reports' && <ReportsPane gymId={filter === 'all' ? null : filter} />}

            {view === 'overview' && stats === null && <Retry message={LOAD_FAILED} onRetry={retry} />}

            {view === 'overview' && shown.length > 1 && shownStats.length > 0 && (
              <section className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-4">
                <h2 className="mb-3 text-lg font-extrabold text-black dark:text-zinc-50">All gyms</h2>
                <Numbers s={totals} />
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  Red flags, latest week: <b className="text-black dark:text-zinc-50">{flagged}</b> flagged,{' '}
                  <b className={waiting > 0 ? 'text-warning' : 'text-black dark:text-zinc-50'}>{waiting}</b> not contacted yet.
                </p>
              </section>
            )}

            {view === 'overview' && stats !== null && (
              <div className="grid gap-4 lg:grid-cols-2">
                {shown.map((g) => (
                  <GymCard key={g.id} gym={g} title={titleOf(g)} stats={statsOf(g.id)} onRetry={retry} />
                ))}
              </div>
            )}
          </div>
        )}
      </AppShell>
    </ClientOnly>
  );
}
