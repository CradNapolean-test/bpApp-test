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
import { ChatTab } from './ChatTab';
import { ClassesArea } from './ClassesArea';
import { CreditsTab } from './CreditsTab';
import { WorkoutTab } from './WorkoutTab';
import type {
  ActivityRow,
  BookingRow,
  ChatMessageRow,
  ClassRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  FoodDiaryEntryRow,
  MealPlanEntryRow,
  MembershipPackageRow,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';

// The coaching tab set is shared by both roles. Coach view additionally gets a "Credits"
// tab (grant credits + assign membership, no booking UI — a coach doesn't book on a
// client's behalf). The client's own booking/credits experience lives one level up, in
// the separate "Classes" area (see the area toggle below), not as a coaching tab.
const COACHING_TABS = [
  'Setup',
  'Weekly Log',
  'Food Tracking',
  'Meal Planner',
  'Activity',
  'Insights',
  'Overview',
  'Chat',
  'Workout',
] as const;
type CoachingTab = (typeof COACHING_TABS)[number] | 'Credits';

type Area = 'Coaching' | 'Classes';

export function DashboardShell({
  clientId,
  clientLabel,
  isCoachView,
  currentUserId,
  profile,
  weekDates,
  weekLogs,
  historyLogs,
  todayLogId,
  foodDiaryEntries,
  mealPlanEntries,
  activities,
  programWeek,
  messages,
  classes,
  bookings,
  creditsBalance,
  programs,
  workoutLogs,
  membership,
  packages,
}: {
  clientId: string;
  clientLabel: string;
  isCoachView: boolean;
  currentUserId: string;
  profile: ClientProfileRow | null;
  weekDates: string[];
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  todayLogId: string | null;
  foodDiaryEntries: FoodDiaryEntryRow[];
  mealPlanEntries: MealPlanEntryRow[];
  activities: ActivityRow[];
  programWeek: number;
  messages: ChatMessageRow[];
  classes: ClassRow[];
  bookings: BookingRow[];
  creditsBalance: number;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
}) {
  const [area, setArea] = useState<Area>('Coaching');
  const [tab, setTab] = useState<CoachingTab>('Setup');
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  const tabsForRole: CoachingTab[] = isCoachView ? [...COACHING_TABS, 'Credits'] : [...COACHING_TABS];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{clientLabel}</h1>
          {isCoachView && <p className="text-sm text-zinc-500">Viewing as coach</p>}
        </div>
        <SignOutButton />
      </div>

      {!isCoachView && (
        <div className="mt-6 flex gap-1 rounded-lg border border-black/10 p-1 dark:border-white/10">
          {(['Coaching', 'Classes'] as Area[]).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                area === a
                  ? 'bg-foreground text-background'
                  : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {(isCoachView || area === 'Coaching') && (
        <>
          <nav className="mt-6 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
            {tabsForRole.map((t) => (
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
            {tab === 'Chat' && (
              <ChatTab clientId={clientId} initialMessages={messages} currentUserId={currentUserId} />
            )}
            {tab === 'Workout' && (
              <WorkoutTab clientId={clientId} isCoachView={isCoachView} programs={programs} workoutLogs={workoutLogs} />
            )}
            {tab === 'Credits' && isCoachView && (
              <CreditsTab clientId={clientId} creditsBalance={creditsBalance} membership={membership} packages={packages} />
            )}
          </div>
        </>
      )}

      {!isCoachView && area === 'Classes' && (
        <div className="mt-6">
          <ClassesArea classes={classes} bookings={bookings} creditsBalance={creditsBalance} membership={membership} />
        </div>
      )}
    </div>
  );
}
