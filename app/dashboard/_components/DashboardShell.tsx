'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
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
import { TodayTab } from './TodayTab';
import { CategoryNav } from './CategoryNav';
import type { Category, Screen } from './categories';
import { screensForCategory } from './categories';
import { NotificationBanner } from './NotificationBanner';
import { ChatPopup } from './ChatPopup';
import { ClassesArea } from './ClassesArea';
import { CreditsTab } from './CreditsTab';
import { WorkoutTab } from './WorkoutTab';
import type {
  ActivityRow,
  BookingRow,
  ChatMessageRow,
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
  ScheduleOccurrence,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';

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
  bookings,
  occurrences,
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
  bookings: BookingRow[];
  occurrences: ScheduleOccurrence[];
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
  const [category, setCategory] = useState<Category>('Home');
  const [screen, setScreen] = useState<Screen>('Today');
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  function handleCategoryClick(c: Category) {
    setCategory(c);
    setScreen(screensForCategory(c, isCoachView)[0]);
  }

  const topBar = isCoachView ? (
    <CoachNav />
  ) : (
    <div className="flex gap-1 rounded-lg border border-black/10 p-1 dark:border-white/10">
      {(['Coaching', 'Classes'] as Area[]).map((a) => (
        <button
          key={a}
          onClick={() => setArea(a)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            area === a
              ? 'bg-accent text-accent-foreground'
              : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );

  const showCoaching = isCoachView || area === 'Coaching';

  const sidebar = showCoaching ? (
    <>
      {isCoachView && (
        <Link
          href="/coach"
          className="mb-2 block rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300"
        >
          &larr; All clients
        </Link>
      )}
      <CategoryNav
        category={category}
        screen={screen}
        isCoachView={isCoachView}
        onSelectCategory={handleCategoryClick}
        onSelectScreen={setScreen}
      />
    </>
  ) : undefined;

  return (
    <AppShell
      title={clientLabel}
      subtitle={isCoachView ? 'Viewing as coach' : undefined}
      topBar={topBar}
      banner={!isCoachView && <NotificationBanner notifications={notifications} />}
      sidebar={sidebar}
    >
      {showCoaching && (
        <>
          {screen === 'Today' && (
            <TodayTab
              weekLogs={weekLogs}
              historyLogs={historyLogs}
              habits={habits}
              formAssignments={formAssignments}
              bookings={bookings}
              creditsBalance={creditsBalance}
              membership={membership}
            />
          )}
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
        </>
      )}

      {!isCoachView && area === 'Classes' && (
        <ClassesArea
          bookings={bookings}
          occurrences={occurrences}
          creditsBalance={creditsBalance}
          membership={membership}
        />
      )}

      <ChatPopup clientId={clientId} initialMessages={messages} currentUserId={currentUserId} />
    </AppShell>
  );
}
