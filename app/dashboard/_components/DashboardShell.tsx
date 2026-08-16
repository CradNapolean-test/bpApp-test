'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { StatusBadge } from '@/app/_components/StatusBadge';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { BottomTabBar } from './BottomTabBar';
import { SetupTab } from './SetupTab';
import { WeeklyLogTab } from './WeeklyLogTab';
import { FoodTrackingTab } from './FoodTrackingTab';
import { PhotoDiaryTab } from './PhotoDiaryTab';
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
import { AccountTab } from './AccountTab';
import { NotesTab as CoachInfoTab } from '@/app/coach/_components/workspace/NotesTab';
import type { Category, Screen } from './categories';
import { BOTTOM_TAB_CATEGORIES, screensForCategory, toDisabledScreenSet } from './categories';
import { NotificationsTab } from './NotificationsTab';
import { ClassesArea } from './ClassesArea';
import { CreditsTab } from './CreditsTab';
import { ClientCreditsTab } from './ClientCreditsTab';
import { WorkoutTab } from './WorkoutTab';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type { ThemePreference } from '@/app/_components/theme';
import type {
  ActivityRow,
  BookingRow,
  ChatMessage,
  ClientExerciseMaxRow,
  ClientMembershipRow,
  ClientProfileRow,
  CreditBucketBalances,
  CreditPackRow,
  CreditsLedgerRow,
  DailyLogRow,
  EducationCourseAssignmentWithDetails,
  EducationCourseWithModules,
  ExerciseLibraryRow,
  FoodDiaryEntryRow,
  FoodPhotoEntry,
  ManualMacroEntryRow,
  FormAssignmentWithDetails,
  FormTemplateRow,
  HabitWithLogs,
  MealPlanEntryRow,
  MealSectionRow,
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
  ClientJournalEntryRow,
} from '@/lib/data/types';

type Area = 'Coaching' | 'Classes';

export function DashboardShell({
  clientId,
  clientLabel,
  isCoachView,
  currentUserId,
  currentUserEmail,
  themePreference,
  profile,
  weekDates,
  weekLogs,
  historyLogs,
  todayLogId,
  foodDiaryEntries,
  foodPhotos,
  manualMacroEntries,
  mealPlanEntries,
  mealSections,
  activities,
  programWeek,
  messages,
  bookings,
  occurrences,
  creditsBalance,
  creditsBuckets,
  creditsLedger,
  programs,
  workoutLogs,
  clientExerciseMaxes,
  workoutDayFeedback,
  membership,
  packages,
  creditPacks,
  photos,
  measurementLogs,
  habits,
  notifications,
  formTemplates,
  formAssignments,
  exerciseLibrary,
  programTemplates,
  recipes,
  educationCourses,
  educationAssignments,
  disabledScreens = [],
  journalEntries = [],
  unreadMessageCount = 0,
  healthStatus = null,
  coachUnreadCount = 0,
  perClientUnreadCount = 0,
  isOwnClient = true,
}: {
  clientId: string;
  clientLabel: string;
  isCoachView: boolean;
  currentUserId: string;
  currentUserEmail: string;
  themePreference: ThemePreference;
  profile: ClientProfileRow | null;
  weekDates: string[];
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  todayLogId: string | null;
  foodDiaryEntries: FoodDiaryEntryRow[];
  foodPhotos: FoodPhotoEntry[];
  manualMacroEntries: ManualMacroEntryRow[];
  mealPlanEntries: MealPlanEntryRow[];
  mealSections: MealSectionRow[];
  activities: ActivityRow[];
  programWeek: number;
  messages: ChatMessage[];
  bookings: BookingRow[];
  occurrences: ScheduleOccurrence[];
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  creditsLedger: CreditsLedgerRow[];
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  clientExerciseMaxes: ClientExerciseMaxRow[];
  workoutDayFeedback: WorkoutDayFeedbackRow[];
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
  creditPacks: CreditPackRow[];
  photos: ProgressPhoto[];
  measurementLogs: MeasurementLogRow[];
  habits: HabitWithLogs[];
  notifications: NotificationRow[];
  formTemplates: FormTemplateRow[];
  formAssignments: FormAssignmentWithDetails[];
  exerciseLibrary: ExerciseLibraryRow[];
  programTemplates: ProgramTemplateRow[];
  recipes: RecipeWithIngredients[];
  educationCourses: EducationCourseWithModules[];
  educationAssignments: EducationCourseAssignmentWithDetails[];
  disabledScreens?: string[];
  journalEntries?: ClientJournalEntryRow[];
  unreadMessageCount?: number;
  // Only set when isCoachView -- the client's own dashboard load never computes this.
  healthStatus?: ClientHealthStatus | null;
  coachUnreadCount?: number;
  perClientUnreadCount?: number;
  // Only meaningful when isCoachView -- false when the viewing coach isn't this client's own
  // assigned coach (read-only cross-gym "Search all clients" view, see 0052/0053). Defaults to
  // true so the client's own load (which never passes this) behaves exactly as before.
  isOwnClient?: boolean;
}) {
  const [area, setArea] = useState<Area>('Coaching');
  const [category, setCategory] = useState<Category>('Home');
  const [screen, setScreen] = useState<Screen>('Today');
  const [focusDay, setFocusDay] = useState<{ dayId: string; nonce: number } | null>(null);
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  const disabledScreenSet = toDisabledScreenSet(disabledScreens);
  const nutritionMode = profile?.nutrition_tracking_mode ?? 'full_tracking';
  // The single enforcement choke point: handleNavigate/handleCheckIn below set `screen`
  // directly (for a home-card shortcut or the classes check-in flow), bypassing
  // screensForCategory entirely -- patching each call site individually is fragile, since a
  // coach could disable a screen a hardcoded shortcut still points at. Deriving one
  // `effectiveScreen` and using it for every render check instead of raw `screen` closes that
  // gap at a single point, regardless of how `screen` got set. Falls back to the category's
  // first still-enabled screen, or 'Today' only if every screen in the category is disabled.
  const categoryScreens = screensForCategory(category, isCoachView, disabledScreenSet, nutritionMode);
  const effectiveScreen: Screen = categoryScreens.includes(screen) ? screen : (categoryScreens[0] ?? 'Today');

  function handleCategoryClick(c: Category) {
    // Categories only render while area === 'Coaching' (see showCoaching below) -- without
    // this, selecting a category while the client's Classes area is active would set
    // category/screen but never actually show anything.
    setArea('Coaching');
    setCategory(c);
    setScreen(screensForCategory(c, isCoachView, disabledScreenSet, nutritionMode)[0]);
  }

  // Home screen cards route here (and CheckInButton reuses handleCheckIn below) -- lets a
  // card jump straight to a specific screen within a category, not just the category's
  // default first screen the bottom tab bar/sidebar clicks land on.
  function handleNavigate(c: Category, s?: Screen) {
    setArea('Coaching');
    setCategory(c);
    setScreen(s ?? screensForCategory(c, isCoachView, disabledScreenSet, nutritionMode)[0]);
  }

  // From a classes check-in (Home or Classes tab) -- jumps straight into the Workout screen
  // with the specific day expanded/scrolled to, rather than requiring the client to hunt for
  // it. `nonce` lets re-checking-in on the same day re-trigger the scroll.
  function handleCheckIn(dayId: string) {
    setArea('Coaching');
    setCategory('Training');
    setScreen('Workout');
    setFocusDay((prev) => ({ dayId, nonce: (prev?.nonce ?? 0) + 1 }));
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
    <CategoryNav
      category={category}
      screen={effectiveScreen}
      isCoachView={isCoachView}
      disabledScreens={disabledScreenSet}
      nutritionMode={nutritionMode}
      onSelectCategory={handleCategoryClick}
      onSelectScreen={setScreen}
    />
  ) : undefined;

  // Compact per-screen header shown on mobile only (AppShell hides it at md+ and keeps the
  // logo+title bar there instead) -- avatar chip + date + greeting on Home, matching the
  // mobile redesign's Today screen; a plain category title on every other screen, since the
  // prototype's Nutrition/Training/Accountability/Progress screens never repeat the greeting.
  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  const greetingHour = new Date().getHours();
  const timeGreeting = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening';
  // Who the client is chatting with (coach sees the client's name; client sees a generic
  // "Your coach" since the client-side bundle doesn't carry the coach's own profile).
  const otherPartyName = isCoachView ? clientLabel : 'Your coach';
  // Screens reached by tapping into something (header icons, avatar) rather than a bottom
  // tab -- get a back-chevron chip in place of the avatar, matching the redesign's pattern of
  // only showing self-identity on the persistent tab screens. The Classes area (its own top
  // toggle, not a Coaching-category drill-in) always counts as top-level here -- `category`
  // is stale while area === 'Classes' since setArea() alone doesn't touch it, so this must not
  // key off `category` in that case or the header shows whatever Coaching category was last
  // active before switching tabs.
  const isSubScreen = area === 'Coaching' && !BOTTOM_TAB_CATEGORIES.includes(category);
  const mobileHeaderTitle =
    category === 'Messages'
      ? otherPartyName
      : isCoachView
        ? clientLabel
        : category === 'Account Settings'
          ? 'Account'
          : category;
  const mobileHeader = isSubScreen ? (
    <button
      type="button"
      onClick={() => handleCategoryClick('Home')}
      className="flex min-w-0 items-center gap-2.5 text-left"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
        <ArrowLeft className="h-4 w-4" />
      </span>
      <p className="truncate text-lg font-bold text-black dark:text-zinc-50">{mobileHeaderTitle}</p>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => handleCategoryClick('Account Settings')}
      className="flex min-w-0 items-center gap-2.5 text-left"
    >
      <Avatar name={profile?.name ?? clientLabel} size="md" variant={!isCoachView ? 'self' : 'person'} />
      <div className="min-w-0">
        {!isCoachView && area === 'Coaching' && category === 'Home' ? (
          <>
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-zinc-500">{todayLabel}</p>
            <p className="truncate text-lg font-bold text-black dark:text-zinc-50">{timeGreeting}, {firstName}</p>
          </>
        ) : (
          <p className="truncate text-lg font-bold text-black dark:text-zinc-50">
            {isCoachView ? clientLabel : area === 'Classes' ? 'Classes' : category}
          </p>
        )}
      </div>
    </button>
  );

  const coachSummary = isCoachView && (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-accent-soft px-3 py-2 dark:border-white/10">
      <Link
        href="/coach/clients"
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
      mobileHeader={mobileHeader}
      coachSummary={coachSummary}
      sidebar={sidebar}
      headerAction={
        <>
          <button
            onClick={() => handleCategoryClick('Messages')}
            aria-label="Messages"
            className="relative rounded-xl bg-black/5 p-2 text-zinc-600 hover:bg-black/10 md:hidden dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
          >
            <MessageSquare className="h-5 w-5" />
            {(isCoachView ? perClientUnreadCount : unreadMessageCount) > 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-danger" />
            )}
          </button>
          <button
            onClick={() => handleCategoryClick('Notifications')}
            aria-label="Notifications"
            className="relative rounded-xl bg-black/5 p-2 text-zinc-600 hover:bg-black/10 md:hidden dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
          >
            <Bell className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-danger" />
            )}
          </button>
          {isCoachView && <CoachMessagesButton unreadCount={coachUnreadCount} />}
        </>
      }
      bottomBar={<BottomTabBar category={category} onSelectCategory={handleCategoryClick} />}
    >
      {showCoaching && !BOTTOM_TAB_CATEGORIES.includes(category) && (
        <button
          onClick={() => handleCategoryClick('Home')}
          className="mb-3 hidden items-center gap-1 text-sm font-medium text-zinc-500 hover:text-black md:flex dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      )}
      {showCoaching && categoryScreens.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto md:hidden">
          {categoryScreens.map((s) => (
            <button
              key={s}
              onClick={() => setScreen(s)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                effectiveScreen === s
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-black/[.08] bg-[var(--background)] text-zinc-700 hover:bg-black/5 dark:border-white/[.12] dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {showCoaching && (
        <>
          {effectiveScreen === 'Today' && (
            <TodayTab
              profile={profile}
              programWeek={programWeek}
              weekLogs={weekLogs}
              historyLogs={historyLogs}
              habits={habits}
              formAssignments={formAssignments}
              bookings={bookings}
              creditsBalance={creditsBalance}
              membership={membership}
              programs={programs}
              workoutLogs={workoutLogs}
              onCheckIn={handleCheckIn}
              onNavigate={handleNavigate}
              onNavigateClasses={isCoachView ? undefined : () => setArea('Classes')}
            />
          )}
          {effectiveScreen === 'Setup' && (
            <SetupTab
              clientId={clientId}
              initialProfile={profile}
              readOnly={isCoachView}
              measurementLogs={measurementLogs}
            />
          )}
          {effectiveScreen === 'Account' && !isCoachView && (
            <AccountTab
              clientId={clientId}
              name={profile?.name ?? 'You'}
              email={currentUserEmail}
              notificationsEnabled={profile?.notifications_enabled ?? true}
              emailNotificationsEnabled={profile?.email_notifications_enabled ?? true}
              deletionRequestedAt={profile?.deletion_requested_at ?? null}
              themePreference={themePreference}
              onNavigate={handleNavigate}
            />
          )}
          {effectiveScreen === 'Weekly Log' && (
            <WeeklyLogTab
              clientId={clientId}
              weekDates={weekDates}
              initialLogs={weekLogs}
              gender={profile?.gender ?? null}
              periodStartDates={periodStartDates}
              readOnly={isCoachView}
              isCoachView={isCoachView}
              habits={habits}
              profile={profile}
              programWeek={programWeek}
            />
          )}
          {effectiveScreen === 'Forms' && (
            <FormsTab
              clientId={clientId}
              isCoachView={isCoachView}
              templates={formTemplates}
              assignments={formAssignments}
              readOnly={isCoachView && !isOwnClient}
            />
          )}
          {effectiveScreen === 'Education' && (
            <EducationTab
              clientId={clientId}
              isCoachView={isCoachView}
              courses={educationCourses}
              assignments={educationAssignments}
              readOnly={isCoachView && !isOwnClient}
            />
          )}
          {effectiveScreen === 'Food Tracking' && (
            <FoodTrackingTab
              clientId={clientId}
              dailyLogId={todayLogId}
              initialEntries={foodDiaryEntries}
              initialManualMacroEntries={manualMacroEntries}
              sections={mealSections}
              recipes={recipes}
              readOnly={isCoachView}
              profile={profile}
              programWeek={programWeek}
              nutritionMode={nutritionMode}
            />
          )}
          {effectiveScreen === 'Photo Diary' && (
            <PhotoDiaryTab
              clientId={clientId}
              dailyLogId={todayLogId}
              initialPhotos={foodPhotos}
              readOnly={isCoachView}
              profile={profile}
              programWeek={programWeek}
            />
          )}
          {effectiveScreen === 'Meal Planner' && (
            <MealPlannerTab clientId={clientId} initialEntries={mealPlanEntries} recipes={recipes} readOnly={isCoachView} />
          )}
          {effectiveScreen === 'Recipes' && (
            <RecipesTab clientId={clientId} initialRecipes={recipes} readOnly={isCoachView} />
          )}
          {effectiveScreen === 'Activity' && (
            <ActivityTab activities={activities} bodyWeightKg={todayBodyweight} programWeek={programWeek} />
          )}
          {effectiveScreen === 'Insights' && <InsightsTab historyLogs={historyLogs} profile={profile} />}
          {effectiveScreen === 'Overview' && <OverviewTab historyLogs={historyLogs} />}
          {effectiveScreen === 'Progress & Photos' && (
            <ProgressTab
              clientId={clientId}
              initialPhotos={photos}
              initialMeasurements={measurementLogs}
              profile={profile}
              readOnly={isCoachView}
            />
          )}
          {effectiveScreen === 'Workout' && (
            <WorkoutTab
              clientId={clientId}
              isCoachView={isCoachView}
              programs={programs}
              workoutLogs={workoutLogs}
              clientExerciseMaxes={clientExerciseMaxes}
              workoutDayFeedback={workoutDayFeedback}
              exerciseLibrary={exerciseLibrary}
              programTemplates={programTemplates}
              focusDay={focusDay}
            />
          )}
          {effectiveScreen === 'Credits' && isCoachView && isOwnClient && (
            <CreditsTab
              clientId={clientId}
              creditsBalance={creditsBalance}
              creditsBuckets={creditsBuckets}
              membership={membership}
              packages={packages}
              creditPacks={creditPacks}
              checkinReminderDays={profile?.checkin_reminder_days ?? 3}
              lastCheckinReminderAt={profile?.last_checkin_reminder_at ?? null}
            />
          )}
          {effectiveScreen === 'Credits' && (!isCoachView || !isOwnClient) && (
            <ClientCreditsTab
              creditsBalance={creditsBalance}
              creditsBuckets={creditsBuckets}
              membership={membership}
              ledger={creditsLedger}
            />
          )}
          {effectiveScreen === 'Info' && isCoachView && (
            <CoachInfoTab clientId={clientId} entries={journalEntries} profile={profile} readOnly={!isOwnClient} />
          )}
          {effectiveScreen === 'Notifications' && (
            <NotificationsTab notifications={notifications} />
          )}
          {effectiveScreen === 'Messages' && (
            <ChatTab
              clientId={clientId}
              initialMessages={messages}
              currentUserId={currentUserId}
              otherPartyName={otherPartyName}
              readOnly={isCoachView && !isOwnClient}
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
          programs={programs}
          workoutLogs={workoutLogs}
          onCheckIn={handleCheckIn}
        />
      )}

    </AppShell>
  );
}
