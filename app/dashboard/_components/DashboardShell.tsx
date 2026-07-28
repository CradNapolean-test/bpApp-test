'use client';

import { useState } from 'react';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { SetupTab } from './SetupTab';
import { WeeklyLogTab } from './WeeklyLogTab';
import { FoodTrackingTab } from './FoodTrackingTab';
import { MealPlannerTab } from './MealPlannerTab';
import { ActivityTab } from './ActivityTab';
import { InsightsTab } from './InsightsTab';
import { OverviewTab } from './OverviewTab';
import type {
  ActivityRow,
  ClientProfileRow,
  DailyLogRow,
  FoodDiaryEntryRow,
  MealPlanEntryRow,
} from '@/lib/data/types';

const TABS = [
  'Setup',
  'Weekly Log',
  'Food Tracking',
  'Meal Planner',
  'Activity',
  'Insights',
  'Overview',
] as const;
type Tab = (typeof TABS)[number];

export function DashboardShell({
  clientId,
  clientLabel,
  isCoachView,
  profile,
  weekDates,
  weekLogs,
  historyLogs,
  todayLogId,
  foodDiaryEntries,
  mealPlanEntries,
  activities,
  programWeek,
}: {
  clientId: string;
  clientLabel: string;
  isCoachView: boolean;
  profile: ClientProfileRow | null;
  weekDates: string[];
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  todayLogId: string | null;
  foodDiaryEntries: FoodDiaryEntryRow[];
  mealPlanEntries: MealPlanEntryRow[];
  activities: ActivityRow[];
  programWeek: number;
}) {
  const [tab, setTab] = useState<Tab>('Setup');
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{clientLabel}</h1>
          {isCoachView && <p className="text-sm text-zinc-500">Viewing as coach</p>}
        </div>
        <SignOutButton />
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-foreground text-black dark:text-zinc-50'
                : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'Setup' && (
          <SetupTab clientId={clientId} initialProfile={profile} readOnly={isCoachView} />
        )}
        {tab === 'Weekly Log' && (
          <WeeklyLogTab
            clientId={clientId}
            weekDates={weekDates}
            initialLogs={weekLogs}
            gender={profile?.gender ?? null}
            periodStartDates={periodStartDates}
            readOnly={isCoachView}
          />
        )}
        {tab === 'Food Tracking' && (
          <FoodTrackingTab dailyLogId={todayLogId} initialEntries={foodDiaryEntries} readOnly={isCoachView} />
        )}
        {tab === 'Meal Planner' && (
          <MealPlannerTab clientId={clientId} initialEntries={mealPlanEntries} readOnly={isCoachView} />
        )}
        {tab === 'Activity' && (
          <ActivityTab activities={activities} bodyWeightKg={todayBodyweight} programWeek={programWeek} />
        )}
        {tab === 'Insights' && <InsightsTab historyLogs={historyLogs} profile={profile} />}
        {tab === 'Overview' && <OverviewTab historyLogs={historyLogs} />}
      </div>
    </div>
  );
}
