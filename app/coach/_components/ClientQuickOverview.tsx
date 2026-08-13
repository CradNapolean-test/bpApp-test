'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { StatusBadge } from '@/app/_components/StatusBadge';
import { CoachNav } from './CoachNav';
import { CoachBottomTabBar } from './CoachBottomTabBar';
import { CoachMessagesButton } from './CoachMessagesButton';
import { FormsTab } from '@/app/dashboard/_components/FormsTab';
import { EducationTab } from '@/app/dashboard/_components/EducationTab';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { resolveActiveProgram } from '@/lib/utils/checkin';
import { toIsoDate } from '@/lib/utils/dates';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type {
  ClientProfileRow,
  DailyLogRow,
  EducationCourseAssignmentWithDetails,
  EducationCourseWithModules,
  FormAssignmentWithDetails,
  FormTemplateRow,
  WorkoutProgramRow,
} from '@/lib/data/types';

const TABS = ['Overview', 'Program', 'Nutrition', 'Progress', 'Forms & Edu'] as const;
type Tab = (typeof TABS)[number];

const cardCls =
  'rounded-2xl border border-black/[.05] bg-[var(--background)] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

// Same custom-SVG-over-a-charting-library precedent as OverviewTab's Sparkline / TodayTab's
// ProgressRing -- a compact "how's the trend looking" glance, not a full Recharts axis.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="flex h-12 items-center text-xs text-zinc-400">Not enough data yet</div>;
  }
  const width = 280;
  const height = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-12 w-full">
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A lightweight "at a glance" summary reached from a flagged client on the coach dashboard --
// deliberately additive, not a replacement for the full DashboardShell view at
// /coach/clients/[clientId] (see docs/PT_DISTINCTION_LAYOUT_ROADMAP.md: a dedicated coach-only
// workspace replaced that full view once before and was reverted after real usage showed it
// cost coaches their one-click access to Setup/Credits/Workout editing/etc). This screen never
// removes that access -- it links into it from every tab instead.
export function ClientQuickOverview({
  clientId,
  clientLabel,
  healthStatus,
  coachUnreadCount,
  profile,
  programs,
  programWeek,
  historyLogs,
  formTemplates,
  formAssignments,
  educationCourses,
  educationAssignments,
}: {
  clientId: string;
  clientLabel: string;
  healthStatus: ClientHealthStatus | null;
  coachUnreadCount: number;
  profile: ClientProfileRow | null;
  programs: WorkoutProgramRow[];
  programWeek: number;
  historyLogs: DailyLogRow[];
  formTemplates: FormTemplateRow[];
  formAssignments: FormAssignmentWithDetails[];
  educationCourses: EducationCourseWithModules[];
  educationAssignments: EducationCourseAssignmentWithDetails[];
}) {
  const [tab, setTab] = useState<Tab>('Overview');
  const todayIso = toIsoDate(new Date());

  const activeProgram = useMemo(() => resolveActiveProgram(programs, todayIso), [programs, todayIso]);
  const maxWeek = activeProgram
    ? Math.max(0, ...activeProgram.program.workout_program_days.map((d) => d.week_num))
    : 0;

  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  const recentLogs = historyLogs.slice(-14);
  const loggedCount = recentLogs.filter(hasLoggedData).length;
  const adherence = recentLogs.length > 0 ? Math.round((loggedCount / recentLogs.length) * 100) : 0;
  const kcalLogs = recentLogs.filter((l) => l.protein != null || l.carbs != null || l.fat != null);
  const kcalAvg = kcalLogs.length
    ? Math.round(
        kcalLogs.reduce((sum, l) => sum + dayCalories(l.protein ?? 0, l.carbs ?? 0, l.fat ?? 0), 0) / kcalLogs.length
      )
    : 0;

  const bodyweights = historyLogs.filter((l) => l.bodyweight != null).map((l) => l.bodyweight as number);
  const latestWeight = bodyweights.length ? bodyweights[bodyweights.length - 1] : null;
  const weightDelta = bodyweights.length >= 2 ? bodyweights[bodyweights.length - 1] - bodyweights[0] : null;

  const lastCheckIn = healthStatus
    ? healthStatus.daysSinceActive === 0
      ? 'Today'
      : `${healthStatus.daysSinceActive}d ago`
    : '—';

  const statusNote = healthStatus
    ? healthStatus.status === 'red'
      ? `No log in ${healthStatus.daysSinceActive} days`
      : healthStatus.status === 'amber'
        ? `Last active ${healthStatus.daysSinceActive} days ago`
        : healthStatus.status === 'unmonitored'
          ? 'Check-in reminders are off for this client'
          : 'On track'
    : 'No activity data yet';

  const coachSummary = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-accent-soft px-3 py-2 dark:border-white/10">
      <Link
        href="/coach"
        className="flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>
      <Link href={`/coach/clients/${clientId}`} className="text-sm font-medium text-accent-strong hover:underline">
        Open full dashboard &rarr;
      </Link>
    </div>
  );

  return (
    <AppShell
      title={clientLabel}
      isCoachView
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachMessagesButton unreadCount={coachUnreadCount} />}
      coachSummary={coachSummary}
    >
      <div className="flex items-center gap-3">
        <Avatar name={clientLabel} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-black dark:text-zinc-50">{clientLabel}</p>
          <p className="truncate text-sm text-zinc-500">
            {activeProgram ? `${activeProgram.program.name} · Week ${activeProgram.weekNum} of ${maxWeek}` : 'No active program'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-accent text-accent-foreground shadow-[0_1px_3px_rgba(0,0,0,.1)]'
                : 'bg-black/[.04] text-zinc-600 dark:bg-white/[.06] dark:text-zinc-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'Overview' && (
          <div className="space-y-3">
            {healthStatus && (
              <div className={cardCls}>
                <StatusBadge status={healthStatus.status} />
                <p className="mt-2 text-sm text-black dark:text-zinc-50">{statusNote}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className={cardCls}>
                <p className="text-xs font-medium text-zinc-500">Bodyweight</p>
                <p className="mt-1 text-lg font-semibold text-black dark:text-zinc-50">
                  {latestWeight != null ? `${latestWeight} kg` : '—'}
                </p>
              </div>
              <div className={cardCls}>
                <p className="text-xs font-medium text-zinc-500">Last check-in</p>
                <p className="mt-1 text-lg font-semibold text-black dark:text-zinc-50">{lastCheckIn}</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'Program' && (
          <div className={cardCls}>
            {activeProgram ? (
              <>
                <p className="text-sm font-semibold text-black dark:text-zinc-50">{activeProgram.program.name}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Week {activeProgram.weekNum} of {maxWeek}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">No active program assigned.</p>
            )}
            <Link
              href={`/coach/clients/${clientId}`}
              className="mt-3 inline-block rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground"
            >
              Open program
            </Link>
          </div>
        )}

        {tab === 'Nutrition' && (
          <div className={cardCls}>
            <p className="text-xl font-bold text-black dark:text-zinc-50">
              {kcalAvg}
              <span className="ml-1 text-sm font-medium text-zinc-500">
                {dayTarget ? `/ ${Math.round(dayTarget.calories)} kcal avg` : 'kcal avg'}
              </span>
            </p>
            <p className="mt-2 text-xs text-zinc-500">Log adherence</p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${adherence}%` }} />
            </div>
            <p className="mt-1 text-sm font-semibold text-black dark:text-zinc-50">{adherence}% of days logged</p>
          </div>
        )}

        {tab === 'Progress' && (
          <div className={cardCls}>
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-zinc-500">Bodyweight trend</p>
              <p className="text-sm font-semibold text-black dark:text-zinc-50">
                {weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg` : '—'}
              </p>
            </div>
            <div className="mt-2">
              <Sparkline values={bodyweights} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">Trend across logged history</p>
          </div>
        )}

        {tab === 'Forms & Edu' && (
          <div className="space-y-6">
            <FormsTab clientId={clientId} isCoachView templates={formTemplates} assignments={formAssignments} />
            <EducationTab
              clientId={clientId}
              isCoachView
              courses={educationCourses}
              assignments={educationAssignments}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
