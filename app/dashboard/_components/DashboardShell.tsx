'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, MessageSquare, User } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { Avatar } from '@/app/_components/Avatar';
import { Logo } from '@/app/_components/Logo';
import { StatusBadge } from '@/app/_components/StatusBadge';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { BottomTabBar } from './BottomTabBar';
import { ClientBottomTabBar } from './ClientBottomTabBar';
import type { ClientTab } from './ClientBottomTabBar';
import { CoachingHub } from './CoachingHub';
import { ClientSideNav } from './ClientSideNav';
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
import { BOTTOM_TAB_CATEGORIES, CLIENT_CATEGORY_TITLE, CLIENT_PILL_CATEGORIES, CLIENT_TAB_CATEGORIES, COACH_HUB_CATEGORIES, SCREEN_TITLE, screensForCategory, toEffectiveDisabledScreenSet } from './categories';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { NotificationsTab } from './NotificationsTab';
import { ClassesArea } from './ClassesArea';
import { CreditsTab } from './CreditsTab';
import { ClientCreditsTab } from './ClientCreditsTab';
import { WorkoutTab } from './WorkoutTab';
import { BigDogTab } from './BigDogTab';
import { EventsTab, FaqTab, FeedbackTab, ReferTab, RewardsTab } from './CommunityTabs';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type { ThemePreference } from '@/app/_components/theme';
import type {
  ActivityRow,
  BigDogResultRow,
  BookingRow,
  EventWithSignup,
  RewardsForMember,
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
  bigDogResults = [],
  events = [],
  rewardsData = { rewards: [], grantedIds: [], sessions: 0, months: 0 },
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
  bigDogResults?: BigDogResultRow[];
  events?: EventWithSignup[];
  rewardsData?: RewardsForMember;
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
  const [backStack, setBackStack] = useState<{ area: Area; category: Category; screen: Screen }[]>([]);
  const [focusDay, setFocusDay] = useState<{ dayId: string; nonce: number } | null>(null);
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  const disabledScreenSet = toEffectiveDisabledScreenSet(disabledScreens, membership?.package?.included_screens ?? null);
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

  // A tab / top-level switch: starts a fresh trail.
  function handleCategoryClick(c: Category) {
    // Categories only render while area === 'Coaching' (see showCoaching below) -- without
    // this, selecting a category while the client's Classes area is active would set
    // category/screen but never actually show anything.
    setBackStack([]);
    setArea('Coaching');
    setCategory(c);
    setScreen(screensForCategory(c, isCoachView, disabledScreenSet, nutritionMode)[0]);
  }

  // Tapping into something from a screen (a Home tile, a hub row, a profile row): remembers
  // where we came from so the back arrow returns there, e.g. Home -> Events -> back to Home, or
  // Coach hub -> Big Dog -> back to the Coach hub.
  function handleNavigate(c: Category, s?: Screen) {
    setBackStack((stack) => [...stack, { area, category, screen: effectiveScreen }]);
    setArea('Coaching');
    setCategory(c);
    setScreen(s ?? screensForCategory(c, isCoachView, disabledScreenSet, nutritionMode)[0]);
  }

  function goBack() {
    const prev = backStack[backStack.length - 1];
    if (prev) {
      setBackStack((stack) => stack.slice(0, -1));
      setArea(prev.area);
      setCategory(prev.category);
      setScreen(prev.screen);
      return;
    }
    // No trail (e.g. arrived via a tab): fall back to the logical parent.
    handleCategoryClick(backCategory);
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

  function handleClientTab(tab: ClientTab) {
    if (tab === 'Book') {
      setArea('Classes');
      return;
    }
    handleCategoryClick(tab === 'Home' ? 'Home' : tab === 'Coach' ? 'Coach' : 'Account Settings');
  }

  const topBar = isCoachView ? <CoachNav /> : undefined;

  const activeClientTab: ClientTab =
    area === 'Classes' ? 'Book'
    : category === 'Home' || category === 'Notifications' || category === 'Community' ? 'Home'
    : category === 'Account Settings' ? 'Profile'
    : 'Coach';

  const showCoaching = isCoachView || area === 'Coaching';

  // Categories whose every screen is switched off for this member (tier or coach toggle).
  const disabledCategories = new Set<Category>(
    COACH_HUB_CATEGORIES.filter((c) => screensForCategory(c, false, disabledScreenSet, nutritionMode).length === 0)
  );

  const sidebar = isCoachView ? (
    <CategoryNav
      category={category}
      screen={effectiveScreen}
      isCoachView={isCoachView}
      disabledScreens={disabledScreenSet}
      nutritionMode={nutritionMode}
      onSelectCategory={handleCategoryClick}
      onSelectScreen={setScreen}
    />
  ) : (
    <ClientSideNav
      activeTab={activeClientTab}
      category={category}
      disabledCategories={disabledCategories}
      onSelectTab={handleClientTab}
      onNavigate={handleNavigate}
    />
  );

  // Compact per-screen header shown on mobile only (AppShell hides it at md+ and keeps the
  // logo+title bar there instead) -- avatar chip + date + greeting on Home, matching the
  // mobile redesign's Today screen; a plain category title on every other screen, since the
  // prototype's Nutrition/Training/Accountability/Progress screens never repeat the greeting.
  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  // Anchored to the client's own account timezone (not the viewer's browser) -- matches
  // WeeklyLogTab's day selection and every other tz-aware "today" in this codebase; a coach
  // viewing this client's dashboard from a different timezone must see the same "today" the
  // client themselves would, or the header and the day the log defaults to disagree.
  const todayLabel = new Date()
    .toLocaleDateString('en-US', { timeZone: profile?.timezone ?? DEFAULT_TIMEZONE, weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
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
  const tabCategories = isCoachView ? BOTTOM_TAB_CATEGORIES : CLIENT_TAB_CATEGORIES;
  // A member's profile pages (personal details, credits, Big Dog) are drill-ins from the
  // profile list, not tabs of their own, so they get a back arrow like any other sub-screen.
  const isProfileSubpage = !isCoachView && category === 'Account Settings' && effectiveScreen !== 'Account';
  const isSubScreen = area === 'Coaching' && (!tabCategories.includes(category) || isProfileSubpage);
  // Logical parent when there is no trail to go back along.
  const backCategory: Category = !isCoachView && COACH_HUB_CATEGORIES.includes(category)
    ? 'Coach'
    : isProfileSubpage
      ? 'Account Settings'
      : 'Home';
  const showPills =
    showCoaching && categoryScreens.length > 1 && (isCoachView || CLIENT_PILL_CATEGORIES.includes(category));
  // Header title: a member sees the page they're on ("Big Dog standards"), or the area when the
  // page is one of several pills ("Nutrition"). A coach viewing a client sees the client's name.
  const mobileHeaderTitle = isCoachView
    ? clientLabel
    : category === 'Messages'
      ? otherPartyName
      : showPills
        ? (CLIENT_CATEGORY_TITLE[category] ?? category)
        : (SCREEN_TITLE[effectiveScreen] ?? CLIENT_CATEGORY_TITLE[category] ?? category);
  const mobileHeader = isSubScreen ? (
    <button
      type="button"
      onClick={goBack}
      className="flex min-w-0 items-center gap-2.5 text-left"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
        <ArrowLeft className="h-4 w-4" />
      </span>
      <p className="truncate text-lg font-bold text-black dark:text-zinc-50">{mobileHeaderTitle}</p>
    </button>
  ) : !isCoachView ? (
    // Member top-level tabs: the Profile tab replaces the old avatar shortcut, and the greeting
    // now lives once, in the Home hero card -- so the header is just the brand (Home) or the
    // screen title (other tabs).
    <div className="flex min-w-0 items-center gap-2.5">
      {area === 'Coaching' && category === 'Home' ? (
        <>
          <Logo size={36} />
          <div className="min-w-0 leading-tight">
            <p className="text-[15px] font-black text-black dark:text-zinc-50">Ballistic</p>
            <p className="text-[8px] font-semibold uppercase tracking-[2px] text-zinc-500">Performance</p>
          </div>
        </>
      ) : (
        <p className="truncate text-lg font-bold text-black dark:text-zinc-50">
          {area === 'Classes' ? 'Book a session' : mobileHeaderTitle}
        </p>
      )}
    </div>
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
            {isCoachView ? clientLabel : area === 'Classes' ? 'Book a session' : mobileHeaderTitle}
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
    <ClientOnly fallback={<div className="min-h-screen" />}>
    <AppShell
      title={clientLabel}
      isCoachView={isCoachView}
      topBar={topBar}
      mobileHeader={mobileHeader}
      coachSummary={coachSummary}
      sidebar={sidebar}
      headerAction={
        <>
          {isCoachView && (
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
          )}
          <button
            onClick={() => handleNavigate('Notifications')}
            aria-label="Notifications"
            className="relative rounded-xl bg-black/5 p-2 text-zinc-600 hover:bg-black/10 md:hidden dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
          >
            <Bell className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-danger" />
            )}
          </button>
          {isCoachView && <CoachMessagesButton unreadCount={coachUnreadCount} />}
          {!isCoachView && area === 'Coaching' && category === 'Home' && (
            <button
              onClick={() => handleNavigate('Account Settings')}
              aria-label="My profile"
              className="rounded-full bg-accent p-2 text-accent-foreground md:hidden"
            >
              <User className="h-5 w-5" />
            </button>
          )}
        </>
      }
      bottomBar={
        isCoachView ? (
          <BottomTabBar category={category} onSelectCategory={handleCategoryClick} />
        ) : (
          <ClientBottomTabBar active={activeClientTab} onSelect={handleClientTab} coachUnread={unreadMessageCount > 0} />
        )
      }
    >
      {showCoaching && (isCoachView ? !BOTTOM_TAB_CATEGORIES.includes(category) : isSubScreen) && (
        <button
          onClick={isCoachView ? () => handleCategoryClick('Home') : goBack}
          className="mb-3 hidden items-center gap-1 text-sm font-medium text-zinc-500 hover:text-black md:flex dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      )}
      {showPills && (
        <div className={`mb-3 flex gap-2 overflow-x-auto ${isCoachView ? 'md:hidden' : ''}`}>
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
              isCoachView={isCoachView}
              rewards={rewardsData.rewards}
            />
          )}
          {effectiveScreen === 'Coaching' && !isCoachView && (
            <CoachingHub
              profile={profile}
              programWeek={programWeek}
              weekLogs={weekLogs}
              programs={programs}
              bigDogResults={bigDogResults}
              unreadMessageCount={unreadMessageCount}
              pendingForms={formAssignments.filter((f) => !f.completed_at).length}
              hiddenCategories={disabledCategories}
              onNavigate={handleNavigate}
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
              profile={profile}
              membershipName={membership?.package?.name ?? null}
              bigDogResults={bigDogResults}
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
              profile={profile}
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
              profile={profile}
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
          {effectiveScreen === 'Events' && <EventsTab events={events} readOnly={isCoachView} />}
          {effectiveScreen === 'Rewards' && <RewardsTab data={rewardsData} />}
          {effectiveScreen === 'FAQs' && <FaqTab />}
          {effectiveScreen === 'Feedback' && <FeedbackTab readOnly={isCoachView} />}
          {effectiveScreen === 'Refer a Friend' && !isCoachView && (
            <ReferTab name={profile?.name ?? clientLabel} />
          )}
          {effectiveScreen === 'Big Dog' && (
            <BigDogTab
              clientId={clientId}
              profile={profile}
              results={bigDogResults}
              canRecord={isCoachView && isOwnClient}
            />
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
          timezone={profile?.timezone}
        />
      )}

    </AppShell>
    </ClientOnly>
  );
}
