'use client';

import { useState } from 'react';
import { Building2, Users } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { EmptyState } from '@/app/_components/EmptyState';
import { Logo } from '@/app/_components/Logo';
import { Segmented } from '@/app/_components/ui';
import { ReportsPane } from './ReportsPane';
import type { OwnerGym, OwnerGymStats, OwnerTeamRow } from '@/lib/data/owner';

// The owner's home: every gym in the organisation side by side, with a filter to look at one. The numbers
// match the gym admin's Business overview so the two screens agree.

const shortName = (name: string) => name.replace(/^Ballistic Performance\s*[-–]\s*/i, '');

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warning' | 'danger' }) {
  const color = tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-black dark:text-zinc-50';
  return (
    <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

// "+12% on last month", or nothing when last month had no attendance to compare with.
function change(now: number, before: number): string | null {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% on last month`;
}

const sum = (list: OwnerGymStats[], pick: (s: OwnerGymStats) => number) => list.reduce((n, s) => n + pick(s), 0);

function Numbers({ s }: { s: Pick<OwnerGymStats, 'members' | 'onPlan' | 'newThisMonth' | 'leftLast30' | 'endingSoon' | 'attendedThisMonth' | 'attendedLastMonth' | 'unmarkedSessions'> }) {
  const delta = change(s.attendedThisMonth, s.attendedLastMonth);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Members" value={s.members} />
        <Stat label="On a plan" value={s.onPlan} />
        <Stat label="No plan" value={Math.max(0, s.members - s.onPlan)} tone={s.members - s.onPlan > 0 ? 'warning' : undefined} />
        <Stat label="New this month" value={s.newThisMonth} />
        <Stat label="Plan ended, last 30 days" value={s.leftLast30} />
        <Stat label="Plans ending, next 14 days" value={s.endingSoon} />
      </div>
      <div className="mt-2 rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
        <p className="text-xs text-zinc-500">Classes attended this month</p>
        <p className="text-2xl font-black text-black dark:text-zinc-50">{s.attendedThisMonth}</p>
        <p className="text-xs text-zinc-500">
          Last month {s.attendedLastMonth}
          {delta ? ` · ${delta} (month so far against the whole of last month)` : ''}
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
          {team.map((c) => (
            <tr key={c.coachId}>
              <td className="py-2.5 pr-2">
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0">
                    <p className="max-w-[10rem] truncate font-bold text-black dark:text-zinc-50">{c.name}</p>
                    {c.isAdmin && <p className="text-xs text-zinc-500">Gym admin</p>}
                  </div>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right font-semibold">{c.members}</td>
              <td className="px-2 py-2.5 text-right">{c.eligible === 0 ? '–' : `${c.checkedIn} of ${c.eligible}`}</td>
              <td className={`px-2 py-2.5 text-right ${c.quiet > 0 ? 'font-semibold text-warning' : ''}`}>{c.quiet}</td>
              <td className={`py-2.5 pl-2 text-right ${c.toReview > 0 ? 'font-semibold text-accent' : ''}`}>{c.toReview}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanMix({ plans }: { plans: { name: string; count: number }[] }) {
  if (plans.length === 0) return <p className="text-sm text-zinc-500">No one is on a plan.</p>;
  const max = Math.max(...plans.map((p) => p.count));
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

function RedFlagLine({ rf }: { rf: OwnerGymStats['redFlags'] }) {
  if (!rf) return <p className="text-sm text-zinc-500">The red flag tracker has not run yet.</p>;
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-300">
      Week of {weekLabel(rf.weekStart)}: <b className="text-black dark:text-zinc-50">{rf.flagged}</b> flagged,{' '}
      <b className={rf.waiting > 0 ? 'text-warning' : 'text-black dark:text-zinc-50'}>{rf.waiting}</b> not contacted yet.
    </p>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{children}</p>;
}

function GymCard({ gym, stats }: { gym: OwnerGym; stats: OwnerGymStats | undefined }) {
  return (
    <section className="rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
      <div className="mb-3 flex items-center gap-2.5">
        <Building2 className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">{shortName(gym.name)}</h2>
      </div>
      {stats ? (
        <>
          <Numbers s={stats} />
          <SectionLabel>Plans</SectionLabel>
          <PlanMix plans={stats.plans} />
          <SectionLabel>Red flags</SectionLabel>
          <RedFlagLine rf={stats.redFlags} />
          <SectionLabel>Coaches</SectionLabel>
          <TeamTable team={stats.team} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Members" value={gym.members} />
            <Stat label="Coaches" value={gym.coaches.length} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">Run migration 0104 for the full figures.</p>
        </>
      )}
    </section>
  );
}

export function OwnerShell({ gyms, stats, email }: { gyms: OwnerGym[] | null; stats: OwnerGymStats[] | null; email: string }) {
  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState<'overview' | 'reports'>('overview');
  const shown = gyms ? (filter === 'all' ? gyms : gyms.filter((g) => g.id === filter)) : [];
  const statsOf = (id: string) => stats?.find((s) => s.gymId === id);
  const shownStats = shown.map((g) => statsOf(g.id)).filter((s): s is OwnerGymStats => !!s);
  const totals = {
    members: sum(shownStats, (s) => s.members),
    onPlan: sum(shownStats, (s) => s.onPlan),
    newThisMonth: sum(shownStats, (s) => s.newThisMonth),
    leftLast30: sum(shownStats, (s) => s.leftLast30),
    endingSoon: sum(shownStats, (s) => s.endingSoon),
    attendedThisMonth: sum(shownStats, (s) => s.attendedThisMonth),
    attendedLastMonth: sum(shownStats, (s) => s.attendedLastMonth),
    unmarkedSessions: sum(shownStats, (s) => s.unmarkedSessions),
  };
  const flagged = sum(shownStats, (s) => s.redFlags?.flagged ?? 0);
  const waiting = sum(shownStats, (s) => s.redFlags?.waiting ?? 0);

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
      <AppShell
        title={
          <>
            Ballistic <span className="text-accent">Performance</span>
          </>
        }
        headerAction={<Avatar name={email} size="md" variant="self" />}
        mobileHeader={
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <div className="leading-tight">
              <p className="text-[15px] font-black text-black dark:text-zinc-50">Ballistic</p>
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
          <EmptyState icon={Users} title="Owner access is not set up yet" hint="Run migrations 0102 and 0103, then npm run create-owner." />
        ) : gyms.length === 0 ? (
          <EmptyState icon={Building2} title="No gyms in your organisation yet" hint="Gyms are added to the organisation when the owner account is created." />
        ) : (
          <div className="space-y-4">
            {gyms.length > 1 && (
              <Segmented
                label="Gym"
                value={filter}
                onChange={setFilter}
                options={[{ value: 'all', label: 'All gyms' }, ...gyms.map((g) => ({ value: g.id, label: shortName(g.name) }))]}
              />
            )}

            {view === 'reports' && <ReportsPane gymId={filter === 'all' ? null : filter} />}

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

            {view === 'overview' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {shown.map((g) => (
                <GymCard key={g.id} gym={g} stats={statsOf(g.id)} />
              ))}
            </div>
            )}
          </div>
        )}
      </AppShell>
    </ClientOnly>
  );
}
