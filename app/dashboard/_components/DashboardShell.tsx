'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Settings } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { StatusBadge } from '@/app/_components/StatusBadge';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { BottomTabBar } from './BottomTabBar';
import { SetupTab } from './SetupTab';
import { WeeklyLogTab } from './WeeklyLogTab';
import { FoodTrackingTab } from './FoodTrackingTab';
import { MealPlannerTab } from './MealPlannerTab';
import { ActivityTab } from './ActivityTab';
import { InsightsTab } from './InsightsTab';
import { OverviewTab } from './OverviewTab';
import { ProgressTab } from './ProgressTab';
import { FormsTab } from './FormsTab';
import { EducationTab } from './EducationTab';
import { RecipesTab } from './RecipesTab';
import { TodayTab } from './TodayTab';
import { ChatTab } from './ChatTab';
import { CategoryNav } from './CategoryNav';
import type { Category, Screen } from './categories';
import { screensForCategory } from './categories';
import { NotificationBanner } from './NotificationBanner';
import { ClassesArea } from './ClassesArea';
import { CreditsTab } from './CreditsTab';
import { WorkoutTab } from './WorkoutTab';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type {
  ActivityRow,
  BookingRow,
  ChatMessageRow,
  ClientExerciseMaxRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  EducationAssignmentWithContent,
  EducationContentRow,
  ExerciseLibraryRow,
  FoodDiaryEntryRow,
  FormAssignmentWithDetails,
  FormTemplateRow,
  HabitWithLogs,
  MealPlanEntryRow,
  MeasurementLogRow,
  MembershipPackageRow,
  NotificationRow,
  ProgramTemplateRow,
  ProgressPhoto,
  RecipeWithIngredients,
  ScheduleOccurrence,
  WorkoutDayFeedbackRow,
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
  clientExerciseMaxes,
  workoutDayFeedback,
  membership,
  packages,
  photos,
  measurementLogs,
  habits,
  notifications,
  formTemplates,
  formAssignments,
  exerciseLibrary,
  programTemplates,
  recipes,
  educationContent,
  educationAssignments,
  unreadMessageCount = 0,
  healthStatus = null,
  coachUnreadCount = 0,
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
  clientExerciseMaxes: ClientExerciseMaxRow[];
  workoutDayFeedback: WorkoutDayFeedbackRow[];
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
  photos: ProgressPhoto[];
  measurementLogs: MeasurementLogRow[];
  habits: HabitWithLogs[];
  notifications: NotificationRow[];
  formTemplates: FormTemplateRow[];
  formAssignments: FormAssignmentWithDetails[];
  exerciseLibrary: ExerciseLibraryRow[];
  programTemplates: ProgramTemplateRow[];
  recipes: RecipeWithIngredients[];
  educationContent: EducationContentRow[];
  educationAssignments: EducationAssignmentWithContent[];
  unreadMessageCount?: number;
  // Only set when isCoachView -- the client's own dashboard load never computes this.
  healthStatus?: ClientHealthStatus | null;
  coachUnreadCount?: number;
}) {
  const [area, setArea] = useState<Area>('Coaching');
  const [category, setCategory] = useState<Category>('Home');
  const [screen, setScreen] = useState<Screen>('Today');
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  function handleCategoryClick(c: Category) {
    // Categories only render while area === 'Coaching' (see showCoaching below) -- without
    // this, selecting a category while the client's Classes area is active would set
    // category/screen but never actually show anything.
    setArea('Coaching');
    setCategory(c);
    setScreen(screensForCategory(c, isCoachView)[0]);
  }

  const topBar = isCoachView ? (
    <CoachNav unreadCount={coachUnreadCount} />
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
    <CategoryNav
      category={category}
      screen={screen}
      isCoachView={isCoachView}
      onSelectCategory={handleCategoryClick}
      onSelectScreen={setScreen}
    />
  ) : undefined;

  const coachSummary = isCoachView && (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-accent-soft px-3 py-2 dark:border-white/10">
      <Link
        href="/coach"
        className="flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        &larr; All clients
      </Link>
      {healthStatus && (
        <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <StatusBadge status={healthStatus.status} />
          {healthStatus.status !== 'unmonitored' && `last active ${healthStatus.daysSinceActive}d ago`}
        </span>
      )}
    </div>
  );

  return (
    <AppShell
      title={clientLabel}
      isCoachView={isCoachView}
      topBar={topBar}
      coachSummary={coachSummary}
      banner={!isCoachView && <NotificationBanner notifications={notifications} />}
      sidebar={sidebar}
      headerAction={
        !isCoachView && (
          <>
            <button
              onClick={() => handleCategoryClick('Messages')}
              aria-label="Messages"
              className="relative rounded-md p-1.5 text-zinc-500 hover:bg-black/5 md:hidden dark:hover:bg-white/5"
            >
              <MessageSquare className="h-5 w-5" />
              {unreadMessageCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />
              )}
            </button>
            <button
              onClick={() => handleCategoryClick('Account Settings')}
              aria-label="Account Settings"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-black/5 md:hidden dark:hover:bg-white/5"
            >
              <Settings className="h-5 w-5" />
            </button>
          </>
        )
      }
      bottomBar={!isCoachView && <BottomTabBar category={category} onSelectCategory={handleCategoryClick} />}
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
              isCoachView={isCoachView}
              habits={habits}
            />
          )}
          {screen === 'Forms' && (
            <FormsTab
              clientId={clientId}
              isCoachView={isCoachView}
              templates={formTemplates}
              assignments={formAssignments}
            />
          )}
          {screen === 'Education' && (
            <EducationTab
              clientId={clientId}
              isCoachView={isCoachView}
              content={educationContent}
              assignments={educationAssignments}
            />
          )}
          {screen === 'Food Tracking' && (
            <FoodTrackingTab
              dailyLogId={todayLogId}
              initialEntries={foodDiaryEntries}
              recipes={recipes}
              readOnly={isCoachView}
            />
          )}
          {screen === 'Meal Planner' && (
            <MealPlannerTab clientId={clientId} initialEntries={mealPlanEntries} recipes={recipes} readOnly={isCoachView} />
          )}
          {screen === 'Recipes' && (
            <RecipesTab clientId={clientId} initialRecipes={recipes} readOnly={isCoachView} />
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
              profile={profile}
              readOnly={isCoachView}
            />
          )}
          {screen === 'Workout' && (
            <WorkoutTab
              clientId={clientId}
              isCoachView={isCoachView}
              programs={programs}
              workoutLogs={workoutLogs}
              clientExerciseMaxes={clientExerciseMaxes}
              workoutDayFeedback={workoutDayFeedback}
              exerciseLibrary={exerciseLibrary}
              programTemplates={programTemplates}
            />
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
          {screen === 'Messages' && (
            <ChatTab
              clientId={clientId}
              initialMessages={messages}
              currentUserId={currentUserId}
              otherPartyName={isCoachView ? clientLabel : 'Your coach'}
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

    </AppShell>
  );
}
