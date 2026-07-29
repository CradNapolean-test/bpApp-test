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
import { ProgressTab } from './ProgressTab';
import { HabitsTab } from './HabitsTab';
import { FormsTab } from './FormsTab';
import { NotificationBanner } from './NotificationBanner';
import { ChatPopup } from './ChatPopup';
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
  FormAssignmentWithDetails,
  FormTemplateRow,
  HabitWithLogs,
  MealPlanEntryRow,
  MeasurementLogRow,
  MembershipPackageRow,
  NotificationRow,
  ProgressPhoto,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';

// Screens are grouped into categories rather than one flat tab bar. Chat isn't a screen
// at all anymore — it's a floating popup (ChatPopup) visible from anywhere in the shell.
type Screen =
  | 'Setup'
  | 'Weekly Log'
  | 'Habits'
  | 'Forms'
  | 'Food Tracking'
  | 'Meal Planner'
  | 'Activity'
  | 'Insights'
  | 'Overview'
  | 'Progress & Photos'
  | 'Workout'
  | 'Credits';

type Category = 'Nutrition' | 'Training' | 'Accountability' | 'Progress' | 'Account Settings';
const CATEGORY_ORDER: Category[] = ['Nutrition', 'Training', 'Accountability', 'Progress', 'Account Settings'];

// Accountability = did-you-do-the-thing (check-ins, habits, coach-flagged insights);
// Progress = how-are-you-changing (trend lines, photos, measurements over time).
function screensForCategory(category: Category, isCoachView: boolean): Screen[] {
  switch (category) {
    case 'Nutrition':
      return ['Food Tracking', 'Meal Planner'];
    case 'Training':
      return ['Activity', 'Workout'];
    case 'Accountability':
      return ['Weekly Log', 'Habits', 'Forms', 'Insights'];
    case 'Progress':
      return ['Overview', 'Progress & Photos'];
    case 'Account Settings':
      return isCoachView ? ['Setup', 'Credits'] : ['Setup'];
  }
}

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
  photos,
  measurementLogs,
  habits,
  notifications,
  formTemplates,
  formAssignments,
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
  photos: ProgressPhoto[];
  measurementLogs: MeasurementLogRow[];
  habits: HabitWithLogs[];
  notifications: NotificationRow[];
  formTemplates: FormTemplateRow[];
  formAssignments: FormAssignmentWithDetails[];
}) {
  const [area, setArea] = useState<Area>('Coaching');
  const [category, setCategory] = useState<Category>('Nutrition');
  const [screen, setScreen] = useState<Screen>('Food Tracking');
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  function handleCategoryClick(c: Category) {
    setCategory(c);
    setScreen(screensForCategory(c, isCoachView)[0]);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{clientLabel}</h1>
          {isCoachView && <p className="text-sm text-zinc-500">Viewing as coach</p>}
        </div>
        <SignOutButton />
      </div>

      {!isCoachView && <NotificationBanner notifications={notifications} />}

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
          <nav className="mt-6 flex flex-wrap gap-1 rounded-lg border border-black/10 p-1 dark:border-white/10">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                onClick={() => handleCategoryClick(c)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  category === c
                    ? 'bg-foreground text-background'
                    : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
                }`}
              >
                {c}
              </button>
            ))}
          </nav>

          <nav className="mt-4 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
            {screensForCategory(category, isCoachView).map((s) => (
              <button
                key={s}
                onClick={() => setScreen(s)}
                className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                  screen === s
                    ? 'border-b-2 border-foreground text-black dark:text-zinc-50'
                    : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </nav>

          <div className="mt-6">
            {screen === 'Setup' && (
              <SetupTab clientId={clientId} initialProfile={profile} readOnly={isCoachView} />
            )}
            {screen === 'Weekly Log' && (
              <WeeklyLogTab
                clientId={clientId}
                weekDates={weekDates}
                initialLogs={weekLogs}
                gender={profile?.gender ?? null}
                periodStartDates={periodStartDates}
                readOnly={isCoachView}
              />
            )}
            {screen === 'Habits' && (
              <HabitsTab clientId={clientId} isCoachView={isCoachView} habits={habits} />
            )}
            {screen === 'Forms' && (
              <FormsTab
                clientId={clientId}
                isCoachView={isCoachView}
                templates={formTemplates}
                assignments={formAssignments}
              />
            )}
            {screen === 'Food Tracking' && (
              <FoodTrackingTab dailyLogId={todayLogId} initialEntries={foodDiaryEntries} readOnly={isCoachView} />
            )}
            {screen === 'Meal Planner' && (
              <MealPlannerTab clientId={clientId} initialEntries={mealPlanEntries} readOnly={isCoachView} />
            )}
            {screen === 'Activity' && (
              <ActivityTab activities={activities} bodyWeightKg={todayBodyweight} programWeek={programWeek} />
            )}
            {screen === 'Insights' && <InsightsTab historyLogs={historyLogs} profile={profile} />}
            {screen === 'Overview' && <OverviewTab historyLogs={historyLogs} />}
            {screen === 'Progress & Photos' && (
              <ProgressTab
                clientId={clientId}
                initialPhotos={photos}
                initialMeasurements={measurementLogs}
                readOnly={isCoachView}
              />
            )}
            {screen === 'Workout' && (
              <WorkoutTab clientId={clientId} isCoachView={isCoachView} programs={programs} workoutLogs={workoutLogs} />
            )}
            {screen === 'Credits' && isCoachView && (
              <CreditsTab
                clientId={clientId}
                creditsBalance={creditsBalance}
                membership={membership}
                packages={packages}
                checkinReminderDays={profile?.checkin_reminder_days ?? 3}
                lastCheckinReminderAt={profile?.last_checkin_reminder_at ?? null}
              />
            )}
          </div>
        </>
      )}

      {!isCoachView && area === 'Classes' && (
        <div className="mt-6">
          <ClassesArea classes={classes} bookings={bookings} creditsBalance={creditsBalance} membership={membership} />
        </div>
      )}

      <ChatPopup clientId={clientId} initialMessages={messages} currentUserId={currentUserId} />
    </div>
  );
}
