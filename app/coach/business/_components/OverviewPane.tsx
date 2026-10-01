'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { Card, SectionLabel } from '@/app/_components/ui';
import type { BusinessOverview } from '@/lib/data/coachDashboard';

function Stat({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
      <p className="text-2xl font-black text-black dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] font-semibold text-warning">{hint}</p>}
    </div>
  );
}

// The owner/manager's picture of the gym: members and plans, who still needs a plan, and how each
// coach's members are doing this week.
export function OverviewPane({ data }: { data: BusinessOverview }) {
  const maxPlan = Math.max(1, ...data.plans.map((p) => p.count));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat value={data.members} label="members" />
        <Stat value={data.onPlan} label="on a plan" />
        <Stat value={data.newThisMonth} label="joined this month" />
        <Stat value={data.attendedThisMonth} label="sessions attended this month" />
      </div>

      {data.noPlan.length > 0 && (
        <div>
          <SectionLabel>No plan set up · {data.noPlan.length}</SectionLabel>
          <Card className="!py-1">
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {data.noPlan.slice(0, 8).map((m) => (
                <Link key={m.clientId} href={`/coach/clients/${m.clientId}?open=profile`} className="flex items-center gap-3 py-2.5">
                  <Avatar name={m.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-black dark:text-zinc-50">{m.name}</span>
                  <span className="text-xs font-bold text-accent">Set up plan</span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </Link>
              ))}
              {data.noPlan.length > 8 && <p className="py-2.5 text-xs text-zinc-500">and {data.noPlan.length - 8} more (Clients, filter by No plan)</p>}
            </div>
          </Card>
        </div>
      )}

      <div>
        <SectionLabel>Members by plan</SectionLabel>
        <Card className="space-y-3">
          {data.plans.length === 0 && <p className="text-sm text-zinc-500">Nobody is on a plan yet.</p>}
          {data.plans.map((p) => (
            <div key={p.name}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-black dark:text-zinc-50">{p.name}</span>
                <span className="font-bold text-accent">{p.count}</span>
              </div>
              <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(p.count / maxPlan) * 100}%` }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionLabel>Team this week</SectionLabel>
        <div className="space-y-2">
          {data.team.length === 0 && <Card className="text-sm text-zinc-500">No coaches at this gym yet.</Card>}
          {data.team.map((t) => (
            <Link
              key={t.coachId}
              href={`/coach?scope=coach&coach=${t.coachId}`}
              className="flex items-center gap-3 rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10"
            >
              <Avatar name={t.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-black dark:text-zinc-50">{t.name}</p>
                <p className="text-xs text-zinc-500">
                  {t.members} member{t.members === 1 ? '' : 's'} · {t.checkedIn} of {t.eligible} checked in
                </p>
                <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${t.eligible > 0 ? (t.checkedIn / t.eligible) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right text-[11px] font-bold">
                {t.quiet > 0 && <p className="text-danger">{t.quiet} quiet</p>}
                {t.toReview > 0 && <p className="text-warning">{t.toReview} to review</p>}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
