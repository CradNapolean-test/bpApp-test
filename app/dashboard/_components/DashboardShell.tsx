'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLenis } from 'lenis/react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, MessageSquare, User } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { Avatar } from '@/app/_components/Avatar';
import { createClient } from '@/lib/supabase/client';
import { isIsoDate } from '@/lib/photoReview';
import { getClientUnreadCount } from '@/lib/data/chat';
import { PushPrompt } from './PushPrompt';
import { ReviewBanner } from './ReviewBanner';
import { InstallBanner } from './InstallBanner';
import { DetailsConfirmBanner } from './DetailsConfirmBanner';
import { BodyScansTab } from './BodyScansTab';
import { CoachMemberOverview } from './CoachMemberOverview';
import { CoachNutritionPlan } from './CoachNutritionPlan';
import { OfflineSnapshot } from './OfflineSnapshot';
import { closeTopOverlay } from '@/app/_components/useBackHandler';
import { Logo } from '@/app/_components/Logo';
import { StatusBadge } from '@/app/_components/StatusBadge';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachSidebar } from '@/app/coach/_components/CoachSidebar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { useReadSinceDrawn } from '@/app/coach/_components/CoachUnreadContext';
import { CoachMemberBottomNav, CoachMemberGroupTabs, CoachMemberTabs, activeCoachGroup, coachGroups } from './CoachMemberNav';
import type { CoachTab } from './CoachMemberNav';
import { ClientBottomTabBar } from './ClientBottomTabBar';
import type { ClientTab } from './ClientBottomTabBar';
import { CoachingHub } from './CoachingHub';
import { ClientSideNav } from './ClientSideNav';
import { SetupTab } from './SetupTab';
import { WeeklyLogTab } from './WeeklyLogTab';
import { FoodTrackingTab } from './FoodTrackingTab';
import { MetricsTab } from './MetricsTab';
import { PhotoDiaryTab } from './PhotoDiaryTab';
import { MealPlannerTab } from './MealPlannerTab';
import { ActivityTab } from './ActivityTab';
import { InsightsTab } from './InsightsTab';
import { OverviewTab } from './OverviewTab';
import { ProgressTab } from './ProgressTab';
import { FormsTab } from './FormsTab';
import { EducationTab } from './EducationTab';
import { RecipesTab } from './RecipesTab';
import { StrengthTab } from './StrengthTab';
import { TodayTab } from './TodayTab';
import { MemberHeader } from './MemberHeader';
import { SmoothScroll } from '@/app/_components/motion/SmoothScroll';
import AnimatedContent from '@/app/_components/motion/AnimatedContent';
import { ChatTab } from './ChatTab';
import { PrivateChatNotice } from './PrivateChatNotice';
import { AccountTab } from './AccountTab';
import { NotesTab as CoachInfoTab } from '@/app/coach/_components/workspace/NotesTab';
import type { Category, Screen } from './categories';
import { BOTTOM_TAB_CATEGORIES, CLIENT_CATEGORY_TITLE, CLIENT_PILL_CATEGORIES, CLIENT_PILL_LABEL, CLIENT_TAB_CATEGORIES, COACH_HUB_CATEGORIES, SCREEN_TITLE, screensForCategory, toEffectiveDisabledScreenSet } from './categories';
import { addDays, DEFAULT_TIMEZONE, formatClassTime, formatLongDate, todayIsoInTz, toIsoDate } from '@/lib/utils/dates';
import { dayCaloriesOf, hasFoodLogged } from '@/lib/utils/dailyLog';
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
  BodyScan,
  NutritionFeedbackRow,
  BookingRow,
  EventWithSignup,
  RewardsForMember,
  ChatMessage,
  ClientExerciseMaxRow,
  ClientMembershipRow,
  ClientProfileRow,
  CreditBucketBalances,
  CreditPackRow,
  DailyLogRow,
  ExerciseLibraryRow,
  FoodDiaryEntryRow,
  FoodPhotoEntry,
  ManualMacroEntryRow,
  FormAssignmentWithDetails,
  FormTemplateRow,
  MealPlanEntryRow,
  MealSectionRow,
  MeasurementLogRow,
  MembershipPackageRow,
  NotificationRow,
  ProgramTemplateRow,
  ProgressPhoto,
  RecipeWithIngredients,
  WorkoutBlockChoiceRow,
  WorkoutBlockResultRow,
  WorkoutDayFeedbackRow,
  WorkoutLogRow,
  WorkoutProgramRow,
  ClientJournalEntryRow,
} from '@/lib/data/types';

type Area = 'Coaching' | 'Classes';

// A member's sub-screen (the food diary, a progress tab, Events...) rises into place when it opens or its tab changes, like the four main
// tabs do. The key starts it over for each screen. Anything else (the four tabs draw their own; a coach's view) is passed straight through.
// The coach's view of a member: after a section tab is tapped, the section slides in from that side (still on first showing).
function CoachSectionSlide({ on, slide, screenKey, children }: { on: boolean; slide: 'none' | 'left' | 'right'; screenKey: string; children: ReactNode }) {
  if (!on || slide === 'none') return <>{children}</>;
  return (
    <AnimatedContent key={screenKey} direction="horizontal" distance={28} reverse={slide === 'left'} duration={0.4}>
      {children}
    </AnimatedContent>
  );
}

function SubScreenEnter({ on, screenKey, children }: { on: boolean; screenKey: string; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <AnimatedContent key={screenKey} distance={16} duration={0.45}>
      {children}
    </AnimatedContent>
  );
}

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
  creditsBalance,
  creditsBuckets,
  programs,
  workoutLogs,
  clientExerciseMaxes,
  workoutDayFeedback,
  blockChoices = [],
  blockResults = [],
  membership,
  packages,
  creditPacks,
  photos,
  bodyScans,
  nutritionFeedback = [],
  measurementLogs,
  notifications,
  formTemplates,
  formAssignments,
  exerciseLibrary,
  programTemplates,
  recipes,
  disabledScreens = [],
  disabledMetrics = [],
  journalEntries = [],
  bigDogResults = [],
  events = [],
  rewardsData = { rewards: [], grantedIds: [], sessions: 0, months: 0 },
  unreadMessageCount = 0,
  gymTimezone = null,
  streak = undefined,
  referralUrl = null,
  gymBlackout = null,
  latestWeighIn = null,
  ownerCoachName = null,
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
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  clientExerciseMaxes: ClientExerciseMaxRow[];
  workoutDayFeedback: WorkoutDayFeedbackRow[];
  blockChoices?: WorkoutBlockChoiceRow[];
  blockResults?: WorkoutBlockResultRow[];
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
  creditPacks: CreditPackRow[];
  photos: ProgressPhoto[];
  bodyScans: BodyScan[];
  nutritionFeedback?: NutritionFeedbackRow[];
  measurementLogs: MeasurementLogRow[];
  notifications: NotificationRow[];
  formTemplates: FormTemplateRow[];
  formAssignments: FormAssignmentWithDetails[];
  exerciseLibrary: ExerciseLibraryRow[];
  programTemplates: ProgramTemplateRow[];
  recipes: RecipeWithIngredients[];
  disabledScreens?: string[];
  disabledMetrics?: string[];
  journalEntries?: ClientJournalEntryRow[];
  bigDogResults?: BigDogResultRow[];
  events?: EventWithSignup[];
  rewardsData?: RewardsForMember;
  unreadMessageCount?: number;
  // The member's gym's timezone (coach view): the Credits tab dates follow the gym's calendar.
  gymTimezone?: string | null;
  // Consecutive days logged, from a year of logs (the 84-day history alone cannot pass 85).
  streak?: number;
  // The member's gym's referral page; null when it has none (the Refer a friend screen is then hidden).
  referralUrl?: string | null;
  // The gym's overnight window that does not count towards a cancellation cut-off (L5).
  gymBlackout?: { start: string | null; end: string | null } | null;
  // Coach view: the member's most recent weigh-in however old, and the name of the coach they belong to (for the read-only note).
  latestWeighIn?: { date: string; weight: number } | null;
  ownerCoachName?: string | null;
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
  // The coach's view: which way the next section slides in (from the right for a tab further along, from the left for one before).
  const [coachSlide, setCoachSlide] = useState<'none' | 'left' | 'right'>('none');
  const [backStack, setBackStack] = useState<{ area: Area; category: Category; screen: Screen; scroll: number }[]>([]);
  // Set by a coach deep link (?week=): which week of check-ins to open the Weekly Log on.
  const [startWeek, setStartWeek] = useState<string | null>(null);
  // Set by a coach deep link (?open=nutrition&date=): the day of meal photos to open the photo diary on (DB19).
  const [nutritionDate, setNutritionDate] = useState<string | null>(null);
  // Used once: leaving Nutrition forgets it, so coming back later opens on the day the diary itself picks.
  if (nutritionDate && category !== 'Nutrition') setNutritionDate(null);
  const [focusDay, setFocusDay] = useState<{ dayId: string; nonce: number } | null>(null);

  // Live unread-message count for the member, so the header badge appears the moment the coach
  // replies, on whatever screen they're on. Seeded from the server count (which refreshes after
  // any action) and bumped by a realtime subscription; viewing the thread clears it.
  const [liveUnread, setLiveUnread] = useState(unreadMessageCount);
  // Set by "Scan a barcode" on the Coach tab: the food diary then opens with the scanner up, once.
  const [scanOnOpen, setScanOnOpen] = useState(false);
  // The food diary and the daily check-in put their day strip in the black header (item 8): the header holds an empty spot for it.
  const [stripSlot, setStripSlot] = useState<HTMLDivElement | null>(null);
  const [seenServerUnread, setSeenServerUnread] = useState(unreadMessageCount);
  if (seenServerUnread !== unreadMessageCount) {
    setSeenServerUnread(unreadMessageCount);
    setLiveUnread(unreadMessageCount);
  }
  // The coach's view: this member's chat read here since the page loaded (the slide-over, or the Messages drawer). The "Message · 2 new"
  // pill, the phone's chat dot and the header's Messages count drop at once; they kept the page's figures until a reload. `messages`
  // is new on every server render, so a reload's own figures take over again.
  const readSinceLoad = useReadSinceDrawn(messages);
  const chatReadHere = isCoachView && readSinceLoad(clientId);
  const perClientUnread = chatReadHere ? 0 : perClientUnreadCount;
  const coachUnread = chatReadHere ? Math.max(0, coachUnreadCount - perClientUnreadCount) : coachUnreadCount;
  const viewingMessagesRef = useRef(false);
  useEffect(() => {
    if (isCoachView) return;
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let wasDown = false;
    // Ask the server for the real count: after the live connection dropped (or the phone was locked) messages may have arrived that
    // this badge never heard about (M5). Not while the thread is open, where the count is held at zero.
    const recount = () => {
      getClientUnreadCount(clientId)
        .then((n) => {
          if (!cancelled && !viewingMessagesRef.current) setLiveUnread(n);
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recount();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    // Wait for the session first -- see ChatTab: an early subscribe silently never delivers.
    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`unread-${clientId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `client_id=eq.${clientId}` },
          (payload) => {
            const row = payload.new as { sender_id: string };
            if (row.sender_id === currentUserId || viewingMessagesRef.current) return;
            setLiveUnread((n) => n + 1);
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            if (wasDown) {
              wasDown = false;
              recount();
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            wasDown = true;
          }
        });
    });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [clientId, currentUserId, isCoachView]);
  // The member's coach's name for the chat (MS25). A member cannot read their coach's profile row, so it comes from the narrow
  // get_my_coach_display_name() read made for this (migration 0042). Null until it arrives, or when the coach has no name set.
  const [coachName, setCoachName] = useState<string | null>(null);
  useEffect(() => {
    if (isCoachView) return;
    let cancelled = false;
    void Promise.resolve(createClient().rpc('get_my_coach_display_name'))
      .then(({ data }) => {
        const name = typeof data === 'string' ? data.trim() : '';
        if (!cancelled && name) setCoachName(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCoachView]);
  const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
  // The last seven days of food, oldest first, for the coach's at-a-glance strip on the Food screen.
  const memberToday = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const recentFoodDays = Array.from({ length: 7 }, (_, i) => {
    const date = toIsoDate(addDays(new Date(memberToday + 'T00:00:00Z'), i - 6));
    const log = historyLogs.find((l) => l.log_date === date);
    return { date, calories: log && hasFoodLogged(log) ? dayCaloriesOf(log) : null };
  });
  const todayBodyweight =
    historyLogs.filter((l) => l.bodyweight != null).at(-1)?.bodyweight ?? profile?.start_weight ?? null;

  // A plan can hide screens from the member, but never from their coach, who still needs to build their
  // training and see everything.
  const memberDisabledScreens = toEffectiveDisabledScreenSet(disabledScreens, membership?.package?.included_screens ?? null);
  const disabledScreenSet: typeof memberDisabledScreens = isCoachView ? new Set() : memberDisabledScreens;
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

  const viewingMessages = !isCoachView && area === 'Coaching' && effectiveScreen === 'Messages';
  const [wasViewingMessages, setWasViewingMessages] = useState(false);
  if (viewingMessages !== wasViewingMessages) {
    setWasViewingMessages(viewingMessages);
    if (viewingMessages) setLiveUnread(0);
  }
  useEffect(() => {
    viewingMessagesRef.current = viewingMessages;
  }, [viewingMessages]);

  // A tab / top-level switch: starts a fresh trail.
  // The coach's chat with this member slides over from the right, like the Messages drawer in the header.
  // It stays mounted once opened, so a half-typed message is still there when it is closed and reopened or
  // the coach moves between sections.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  function openChat() {
    setChatMounted(true);
    setChatOpen(true);
  }
  useEffect(() => {
    if (!chatOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setChatOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen]);

  // A member's screen opens at the top: the page used to keep the scroll of the screen before, so a row tapped low on Profile opened its
  // screen part-way down with the header out of sight. Back puts the screen before where it was left. Lenis does the jump (immediate,
  // so nothing glides), as it owns the page's scroll and would otherwise carry on from where it was; the coach's view has no Lenis.
  const lenis = useLenis();
  const lenisRef = useRef(lenis);
  useEffect(() => {
    lenisRef.current = lenis;
  }, [lenis]);
  const restoreScroll = useRef<number | null>(null);
  const shownOnce = useRef(false);
  const screenKey = `${area}|${category}|${screen}`;
  useLayoutEffect(() => {
    if (!shownOnce.current) {
      shownOnce.current = true;
      return;
    }
    if (isCoachView) return;
    const to = restoreScroll.current ?? 0;
    restoreScroll.current = null;
    const smooth = lenisRef.current;
    if (smooth) {
      // The new screen's height, before the jump is measured against it.
      smooth.resize();
      smooth.scrollTo(to, { immediate: true, force: true });
    } else window.scrollTo(0, to);
  }, [screenKey, isCoachView]);

  function handleCategoryClick(c: Category) {
    if (isCoachView && c === 'Messages') {
      openChat();
      return;
    }
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
    if (isCoachView && c === 'Messages') {
      openChat();
      return;
    }
    setBackStack((stack) => [...stack, { area, category, screen: effectiveScreen, scroll: window.scrollY }]);
    setArea('Coaching');
    setCategory(c);
    setScreen(s ?? screensForCategory(c, isCoachView, disabledScreenSet, nutritionMode)[0]);
  }

  function goBack() {
    const prev = backStack[backStack.length - 1];
    if (prev) {
      restoreScroll.current = prev.scroll;
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

  // Deep links. Members: home-screen shortcuts and push notifications open /dashboard?open=<where>.
  // Coaches: the dashboard's To do list opens a member straight to the right screen
  // (/coach/clients/<id>?open=checkin&week=<Monday>). Runs once on load, then removes the
  // parameters so a refresh doesn't repeat it.
  useEffect(() => {
    Promise.resolve().then(() => {
      const url = new URL(window.location.href);
      const open = url.searchParams.get('open');
      if (!open) return;
      if (isCoachView) {
        const week = url.searchParams.get('week');
        if (open === 'checkin') {
          if (week) setStartWeek(week);
          handleCategoryClick('Accountability');
        } else if (open === 'nutrition') {
          const date = url.searchParams.get('date');
          if (isIsoDate(date)) setNutritionDate(date);
          handleCategoryClick('Nutrition');
        }
        else if (open === 'forms') handleNavigate('Accountability', 'Forms');
        else if (open === 'bigdog') handleCategoryClick('Achievements');
        else if (open === 'training') handleCategoryClick('Training');
        else if (open === 'profile') handleCategoryClick('Account Settings');
        else if (open === 'messages') handleCategoryClick('Messages');
      } else if (open === 'messages') handleCategoryClick('Messages');
      else if (open === 'book') handleClientTab('Book');
      else if (open === 'checkin') handleCategoryClick('Accountability');
      else if (open === 'nutrition') handleCategoryClick('Nutrition');
      // The "New programme" notification (D20).
      else if (open === 'training') handleCategoryClick('Training');
      url.searchParams.delete('open');
      url.searchParams.delete('week');
      url.searchParams.delete('date');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Red number on the home-screen icon = unread messages (where the phone supports it).
  useEffect(() => {
    if (isCoachView || !('setAppBadge' in navigator)) return;
    const nav = navigator as Navigator & { setAppBadge: (n?: number) => Promise<void>; clearAppBadge: () => Promise<void> };
    (liveUnread > 0 ? nav.setAppBadge(liveUnread) : nav.clearAppBadge()).catch(() => {});
  }, [liveUnread, isCoachView]);

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

  // A coach moves around a member through six sections, each with its own row of tabs.
  const coachNavGroups = isCoachView ? coachGroups(disabledScreenSet, nutritionMode) : [];
  const activeGroup = isCoachView ? activeCoachGroup(coachNavGroups, category, effectiveScreen) : undefined;
  function selectCoachTab(t: CoachTab) {
    const order = coachNavGroups.flatMap((g) => g.tabs);
    const at = (c: Category, s: Screen) => order.findIndex((x) => x.category === c && x.screen === s);
    const from = at(category, effectiveScreen);
    const to = at(t.category, t.screen);
    if (from >= 0 && to >= 0 && from !== to) setCoachSlide(to < from ? 'left' : 'right');
    setBackStack([]);
    setArea('Coaching');
    setCategory(t.category);
    setScreen(t.screen);
  }

  // The coach's sections are a row of tabs under the member's header now (the November 2026 mock-ups), not a left menu.
  const sidebar = isCoachView ? undefined : (
    <ClientSideNav
      activeTab={activeClientTab}
      category={category}
      disabledCategories={disabledCategories}
      onSelectTab={handleClientTab}
      onNavigate={handleNavigate}
    />
  );

  // Who the client is chatting with: the coach sees the client's name, the member their coach's name (MS25), or "Your coach" until it
  // is known or when the coach has not set one.
  const otherPartyName = isCoachView ? clientLabel : (coachName ?? 'Your coach');
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
  const isSubScreen = !isCoachView && area === 'Coaching' && (!tabCategories.includes(category) || isProfileSubpage);
  // Logical parent when there is no trail to go back along.
  const backCategory: Category = !isCoachView && COACH_HUB_CATEGORIES.includes(category)
    ? 'Coach'
    : isProfileSubpage
      ? 'Account Settings'
      : 'Home';
  const showPills =
    showCoaching && !isCoachView && categoryScreens.length > 1 && CLIENT_PILL_CATEGORIES.includes(category);
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
  ) : // The coach's view has no header row on a phone (CV11): the member's name, the Message button and their sections are all in the
  // card and the bar below it, where the name and a "Chat with this member" icon used to be repeated.
  undefined;

  // Every member screen draws its own black header on a phone (MemberHeader), so the page's own header row is left out there. The four
  // tabs draw theirs inside the screen; every other screen gets the one below, with a back button. Both keep the message bubble and the
  // bell top right, so the coach and the notifications are a tap away from any screen (PR #2 review: a sub-screen used to drop them).
  const ownHeader = !isCoachView;
  const memberHeader = {
    unreadMessages: liveUnread,
    onOpenMessages: () => handleNavigate('Messages'),
    unreadNotifications: notifications.some((n) => !n.read_at),
    onOpenNotifications: () => handleNavigate('Notifications'),
  };
  // On the Messages screen the bubble would only open the screen it is on, and on Notifications the bell would: each is left out there.
  const subScreenActions = {
    ...memberHeader,
    onOpenMessages: category === 'Messages' ? undefined : memberHeader.onOpenMessages,
    onOpenNotifications: category === 'Notifications' ? undefined : memberHeader.onOpenNotifications,
  };
  // The day strip's spot in the header, on the two screens that have a strip. A tab is given `undefined` when there is no header for
  // it (the coach's view), and draws its strip in a dark card of its own instead.
  const stripInHeader = !isCoachView && showCoaching && isSubScreen && (effectiveScreen === 'Food Tracking' || effectiveScreen === 'Weekly Log');
  const stripTarget = stripInHeader ? stripSlot : undefined;
  const subScreenHeader =
    !isCoachView && showCoaching && isSubScreen ? (
      <div className="mb-4">
        <MemberHeader
          lead={
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-100 hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          }
          eyebrow={
            category === 'Messages'
              ? coachName
                ? 'Your coach'
                : undefined
              : category === 'Nutrition' || category === 'Accountability'
                ? formatLongDate(new Date(), { timeZone: profile?.timezone ?? DEFAULT_TIMEZONE })
                : undefined
          }
          title={mobileHeaderTitle}
          actions={subScreenActions}
        >
          {showPills && (
            <div
              role="group"
              aria-label={`${mobileHeaderTitle} sections`}
              className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {categoryScreens.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScreen(s)}
                  aria-pressed={effectiveScreen === s}
                  className={`h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm transition-colors ${
                    effectiveScreen === s ? 'bg-zinc-100 font-extrabold text-[#1d1d1b]' : 'bg-white/[.08] font-bold text-zinc-300 hover:bg-white/15'
                  }`}
                >
                  {CLIENT_PILL_LABEL[s] ?? s}
                </button>
              ))}
            </div>
          )}
          {stripInHeader && <div ref={setStripSlot} />}
        </MemberHeader>
      </div>
    ) : null;

  // The coach's own name for the page they are on ("Overview", "Step swaps"), for the screen reader's page title.
  const coachTabLabel = activeGroup?.tabs.find((t) => t.category === category && t.screen === effectiveScreen)?.label;

  const coachSummary = isCoachView && (
    <>
    {profile?.needs_coach_review && !(category === 'Home' && effectiveScreen === 'Today') && (
      <ReviewBanner clientId={clientId} reasons={profile.review_reasons ?? []} canAct={isOwnClient} />
    )}
    <div className="mb-6 mt-2 space-y-4 md:mb-0 lg:mt-0">
      <Link href="/coach/clients" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" /> All clients
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Avatar name={clientLabel} size="lg" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-[26px] font-extrabold leading-tight tracking-[-0.015em] text-black sm:text-[32px] dark:text-zinc-50">{clientLabel}</p>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {[membership?.package?.name ?? 'No plan', programWeek > 0 ? `Week ${programWeek}` : null].filter(Boolean).join(' · ')}
          </p>
          {healthStatus && (
            <span
              className="mt-1.5 inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
              title="How long since they last logged anything, against their check-in reminder setting (Credits & plan). Turns amber, then red, the longer they go quiet."
            >
              <StatusBadge status={healthStatus.status} />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (chatOpen ? setChatOpen(false) : openChat())}
            aria-pressed={chatOpen}
            className={`relative inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${
              chatOpen ? 'bg-accent text-accent-foreground' : 'bg-accent-soft text-accent'
            }`}
          >
            <MessageSquare className="h-4 w-4" /> Message
            {!chatOpen && perClientUnread > 0 && <span className="font-extrabold">· {perClientUnread} new</span>}
          </button>
          {isOwnClient && (
            <button
              type="button"
              onClick={() => selectCoachTab({ category: 'Account Settings', screen: 'Credits', label: 'Credits & plan' })}
              className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
            >
              Add credits
            </button>
          )}
        </div>
      </div>
      {/* The member's sections along the top from a tablet up (a phone has them on the bar at the foot). */}
      <div className="hidden md:block">
        <CoachMemberGroupTabs groups={coachNavGroups} active={activeGroup?.key} onSelect={selectCoachTab} />
      </div>
    </div>
    </>
  );

  // Phone back button / swipe-back. The page keeps a "base" history entry plus one in front of it;
  // pressing back lands on the base entry, we handle it inside the app (close a sheet, go back a
  // screen, or go to Home) and put the front entry back. At the Home screen we let it leave the app.
  const navRef = useRef({ canBack: false, atRoot: true, goBack: () => {}, goHome: () => {} });
  useEffect(() => {
    navRef.current = {
      canBack: backStack.length > 0,
      atRoot: area === 'Coaching' && category === 'Home' && effectiveScreen === 'Today',
      goBack,
      goHome: () => handleCategoryClick('Home'),
    };
  });
  useEffect(() => {
    if (isCoachView) return;
    if (window.history.state?.bp !== 'app') {
      window.history.replaceState({ bp: 'base' }, '');
      window.history.pushState({ bp: 'app' }, '');
    }
    const rearm = () => window.history.pushState({ bp: 'app' }, '');
    const onPop = (e: PopStateEvent) => {
      if (e.state?.bp !== 'base') return; // a forward move, or not ours
      if (closeTopOverlay()) return rearm();
      const nav = navRef.current;
      if (nav.canBack) {
        nav.goBack();
        return rearm();
      }
      if (!nav.atRoot) {
        nav.goHome();
        return rearm();
      }
      window.history.back(); // already at Home: leave the app
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isCoachView]);

  return (
    <ClientOnly fallback={<PageSkeleton />}>
    <AppShell
      // The coach's view names the member once, in the card (CV11); the header row (tablet only) carries the brand, as on every coach page.
      title={isCoachView ? <CoachBrand /> : clientLabel}
      // The one <h1> of the screen, for screen readers: the brand in the header is not a heading (SH4).
      pageTitle={
        isCoachView
          ? `${clientLabel}: ${coachTabLabel ?? effectiveScreen}`
          : area === 'Classes'
            ? 'Book a session'
            : effectiveScreen
      }
      isCoachView={isCoachView}
      topBar={topBar}
      mobileHeader={mobileHeader}
      hideMobileHeader={ownHeader || isCoachView}
      memberUi={!isCoachView}
      coachSidebar={isCoachView ? <CoachSidebar /> : undefined}
      coachSummary={coachSummary}
      sidebar={sidebar}
      headerAction={
        <>
          {!isCoachView && (
          <button
            onClick={() => handleNavigate('Messages')}
            aria-label={liveUnread > 0 ? `Messages, ${liveUnread} unread` : 'Messages'}
            className={`relative rounded-xl p-2 ${
              liveUnread > 0
                ? 'bg-accent text-accent-foreground'
                : 'bg-black/5 text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15'
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            {liveUnread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--background)] bg-danger px-1 text-[10px] font-extrabold leading-none text-white">
                {liveUnread > 9 ? '9+' : liveUnread}
              </span>
            )}
          </button>
          )}
          {/* At every width (MX22): it used to be phone only, and the side menu on a tablet or laptop has no way to the notifications, so
              a waitlist place or a class time change never reached a member there. */}
          {!isCoachView && (
          <button
            onClick={() => handleNavigate('Notifications')}
            aria-label={notifications.some((n) => !n.read_at) ? 'Notifications, some unread' : 'Notifications'}
            className="relative rounded-xl bg-black/5 p-2 text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
          >
            <Bell className="h-5 w-5" />
            {notifications.some((n) => !n.read_at) && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-danger" />
            )}
          </button>
          )}
          {/* The coach's inbox (every member), on a tablet: the header row is not shown on a phone, and a laptop has the side bar. */}
          {isCoachView && <CoachMessagesButton unreadCount={coachUnread} />}
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
          <CoachMemberBottomNav groups={coachNavGroups} active={activeGroup?.key} onSelect={selectCoachTab} />
        ) : (
          <ClientBottomTabBar active={activeClientTab} onSelect={handleClientTab} coachUnread={liveUnread > 0} />
        )
      }
    >
      {subScreenHeader}
      {showCoaching && isCoachView && activeGroup && activeGroup.tabs.length > 1 && (
        <CoachMemberTabs tabs={activeGroup.tabs} category={category} screen={effectiveScreen} onSelect={selectCoachTab} />
      )}
      {/* The member's nutrition plan and targets, at the top of the coach's view of their Nutrition (CL8). Drawn here, once for the whole
          section, not inside the screen below it: picking a new tracking method swaps that screen (Food for Photo diary), which used to
          rebuild the card and lose edits not yet saved. Outside the screen, a swipe across it never changes the day either. */}
      {showCoaching && isCoachView && category === 'Nutrition' && (
        <div className="mb-4">
          <CoachNutritionPlan clientId={clientId} profile={profile} programWeek={programWeek} canEdit={isOwnClient} />
        </div>
      )}
      {showCoaching && (
        <CoachSectionSlide on={isCoachView} slide={coachSlide} screenKey={`${category}|${effectiveScreen}`}>
        <SubScreenEnter on={!isCoachView && isSubScreen} screenKey={`${category}|${effectiveScreen}`}>
          {effectiveScreen === 'Today' && isCoachView && (
            <CoachMemberOverview
              clientId={clientId}
              profile={profile}
              programWeek={programWeek}
              weekLogs={weekLogs}
              historyLogs={historyLogs}
              formAssignments={formAssignments}
              bookings={bookings}
              creditsBalance={creditsBalance}
              membership={membership}
              programs={programs}
              workoutLogs={workoutLogs}
              bodyScans={bodyScans}
              bigDogResults={bigDogResults}
              journalEntries={journalEntries}
              healthStatus={healthStatus}
              isOwnClient={isOwnClient}
              latestWeighIn={latestWeighIn}
              ownerCoachName={ownerCoachName}
              currentUserId={currentUserId}
              disabledMetrics={disabledMetrics}
              unreadMessages={perClientUnread}
              classTimezone={gymTimezone ?? profile?.timezone ?? DEFAULT_TIMEZONE}
              onNavigate={handleNavigate}
              onOpenCheckin={(week) => {
                setStartWeek(week);
                handleNavigate('Accountability', 'Weekly Log');
              }}
            />
          )}
          {effectiveScreen === 'Today' && !isCoachView && (
            <TodayTab
              profile={profile}
              programWeek={programWeek}
              weekLogs={weekLogs}
              historyLogs={historyLogs}
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
              sessionsAttended={rewardsData.sessions}
              showReferral={referralUrl != null}
              events={events}
              dailyCheckinHidden={disabledScreenSet.has('Weekly Log')}
              streakDays={streak}
              disabledMetrics={disabledMetrics}
              clientId={clientId}
              coachName={coachName}
              hiddenScreens={disabledScreenSet}
              header={memberHeader}
              banners={
                <>
                  <InstallBanner />
                  {profile && <DetailsConfirmBanner clientId={clientId} email={currentUserEmail} profile={profile} />}
                </>
              }
            />
          )}
          {effectiveScreen === 'Coaching' && !isCoachView && (
            <CoachingHub
              profile={profile}
              programWeek={programWeek}
              weekLogs={weekLogs}
              programs={programs}
              bigDogResults={bigDogResults}
              unreadMessageCount={liveUnread}
              pendingForms={formAssignments.filter((f) => !f.completed_at).length}
              hiddenCategories={disabledCategories}
              dailyCheckinHidden={disabledScreenSet.has('Weekly Log')}
              disabledMetrics={disabledMetrics}
              onNavigate={handleNavigate}
              onOpenWorkoutDay={handleCheckIn}
              onScanBarcode={() => {
                setScanOnOpen(true);
                handleNavigate('Nutrition', 'Food Tracking');
              }}
              clientId={clientId}
              coachName={coachName}
              header={memberHeader}
            />
          )}
          {effectiveScreen === 'Setup' && (
            <SetupTab
              clientId={clientId}
              initialProfile={profile}
              readOnly={isCoachView && !isOwnClient}
              isCoachView={isCoachView}
              screenToggles={
                isCoachView
                  ? { disabledScreens, disabledMetrics, planIncludedScreens: membership?.package?.included_screens ?? null, planName: membership?.package?.name ?? null }
                  : undefined
              }
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
              header={memberHeader}
            />
          )}
          {effectiveScreen === 'Weekly Log' && (
            <WeeklyLogTab
              clientId={clientId}
              weekDates={weekDates}
              initialLogs={weekLogs}
              historyLogs={historyLogs}
              canReview={isCoachView && isOwnClient}
              startWeek={startWeek}
              gender={profile?.gender ?? null}
              periodStartDates={periodStartDates}
              disabledMetrics={disabledMetrics}
              readOnly={isCoachView}
              isCoachView={isCoachView}
              profile={profile}
              programWeek={programWeek}
              onOpenFoodDiary={() => handleNavigate('Nutrition', 'Food Tracking')}
              stripSlot={stripTarget}
              attendedSessions={bookings
                .filter((b) => b.attended)
                .map((b) => ({ date: b.booking_date, label: `${b.class?.name ?? 'Class'}${b.class?.start_time ? ` ${formatClassTime(b.class.start_time)}` : ''}` }))}
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
              canGiveFeedback={isCoachView && isOwnClient}
              feedback={nutritionFeedback}
              recentDays={isCoachView ? recentFoodDays : undefined}
              historyLogs={historyLogs}
              stripSlot={stripTarget}
              scanOnOpen={scanOnOpen}
              onScanOpened={() => setScanOnOpen(false)}
            />
          )}
          {effectiveScreen === 'Photo Diary' && (
            <PhotoDiaryTab
              clientId={clientId}
              dailyLogId={todayLogId}
              initialPhotos={foodPhotos}
              sections={mealSections}
              readOnly={isCoachView}
              canGiveFeedback={isCoachView && isOwnClient}
              feedback={nutritionFeedback}
              profile={profile}
              initialDate={isCoachView ? nutritionDate : null}
            />
          )}
          {effectiveScreen === 'Meal Planner' && (
            <MealPlannerTab
              clientId={clientId}
              initialEntries={mealPlanEntries}
              sections={mealSections}
              recipes={recipes}
              readOnly={isCoachView}
              profile={profile}
              programWeek={programWeek}
              todayLogId={isCoachView ? null : todayLogId}
            />
          )}
          {effectiveScreen === 'Recipes' && (
            <RecipesTab clientId={clientId} initialRecipes={recipes} readOnly={isCoachView} />
          )}
          {effectiveScreen === 'Activity' && (
            <ActivityTab
              activities={activities}
              bodyWeightKg={todayBodyweight}
              clientId={clientId}
              savedMinutesPer1000={profile?.minutes_per_1000_steps ?? null}
              canSave={!isCoachView}
            />
          )}
          {effectiveScreen === 'Insights' && <InsightsTab historyLogs={historyLogs} profile={profile} isCoachView={isCoachView} />}
          {effectiveScreen === 'Overview' && <OverviewTab historyLogs={historyLogs} profile={profile} programWeek={programWeek} isCoachView={isCoachView} />}
          {effectiveScreen === 'Metrics' && (
            <MetricsTab clientId={clientId} historyLogs={historyLogs} profile={profile} programWeek={programWeek} isCoachView={isCoachView} />
          )}
          {effectiveScreen === 'Strength' && <StrengthTab clientId={clientId} workoutLogs={workoutLogs} programs={programs} profile={profile} blockResults={blockResults} />}
          {effectiveScreen === 'Body Scans' && (
            <BodyScansTab clientId={clientId} scans={bodyScans} profile={profile} readOnly={isCoachView && !isOwnClient} isCoachView={isCoachView} />
          )}
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
              blockChoices={blockChoices}
              blockResults={blockResults}
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
              gymTimezone={gymTimezone}
              memberName={profile?.name ?? clientLabel}
            />
          )}
          {effectiveScreen === 'Credits' && (!isCoachView || !isOwnClient) && (
            <ClientCreditsTab
              clientId={clientId}
              creditsBalance={creditsBalance}
              creditsBuckets={creditsBuckets}
              membership={membership}
              onBook={isCoachView ? undefined : () => setArea('Classes')}
            />
          )}
          {effectiveScreen === 'Info' && isCoachView && (
            <CoachInfoTab clientId={clientId} entries={journalEntries} profile={profile} readOnly={!isOwnClient} currentUserId={currentUserId} />
          )}
          {effectiveScreen === 'Events' && <EventsTab events={events} readOnly={isCoachView} />}
          {effectiveScreen === 'Rewards' && <RewardsTab data={rewardsData} />}
          {effectiveScreen === 'FAQs' && <FaqTab clientId={clientId} membership={membership} gymBlackout={gymBlackout} referralUrl={referralUrl} onMessageCoach={isCoachView ? undefined : () => handleNavigate('Messages')} />}
          {effectiveScreen === 'Feedback' && <FeedbackTab readOnly={isCoachView} />}
          {effectiveScreen === 'Refer a Friend' && !isCoachView && referralUrl && (
            <ReferTab name={profile?.name ?? clientLabel} referralUrl={referralUrl} />
          )}
          {effectiveScreen === 'Big Dog' && (
            <BigDogTab
              clientId={clientId}
              profile={profile}
              results={bigDogResults}
              canRecord={isCoachView && isOwnClient}
              canLog={!isCoachView}
            />
          )}
          {effectiveScreen === 'Notifications' && (
            <NotificationsTab clientId={clientId} notifications={notifications} readOnly={isCoachView} />
          )}
          {!isCoachView && effectiveScreen === 'Messages' && (
            <ChatTab
              clientId={clientId}
              initialMessages={messages}
              currentUserId={currentUserId}
              otherPartyName={otherPartyName}
              composePlaceholder={coachName ? undefined : 'Message your coach…'}
              readOnly={isCoachView && !isOwnClient}
              // A half-written message is still there after the member leaves Messages and comes back (MS26), as the coach's is.
              draftKey={`member-${clientId}`}
              look="member"
            />
          )}
        </SubScreenEnter>
        </CoachSectionSlide>
      )}

      {!isCoachView && area === 'Classes' && (
        <ClassesArea
          clientId={clientId}
          bookings={bookings}
          creditsBalance={creditsBalance}
          membership={membership}
          programs={programs}
          workoutLogs={workoutLogs}
          onCheckIn={handleCheckIn}
          timezone={profile?.timezone}
          gymBlackout={gymBlackout}
          header={memberHeader}
        />
      )}

      {!isCoachView && <SmoothScroll />}
      {!isCoachView && <PushPrompt clientId={clientId} />}
      {!isCoachView && <OfflineSnapshot name={clientLabel} profile={profile} programWeek={programWeek} programs={programs} weekLogs={weekLogs} />}
      {isCoachView && chatMounted && (
        <div className={chatOpen ? 'fixed inset-0 z-50' : 'hidden'}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setChatOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-black/10 bg-[var(--background)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-xl dark:border-white/10">
            {isOwnClient ? (
              <ChatTab
                fill
                clientId={clientId}
                initialMessages={messages}
                currentUserId={currentUserId}
                otherPartyName={otherPartyName}
                draftKey={`coach-${clientId}`}
                active={chatOpen}
                onClose={() => setChatOpen(false)}
                savedReplies
              />
            ) : (
              // A colleague's member: their chat is private to their own coach (D3, 0153), so say so rather than show an empty chat (MS22).
              <PrivateChatNotice memberName={otherPartyName} coachName={ownerCoachName} onClose={() => setChatOpen(false)} />
            )}
          </aside>
        </div>
      )}
    </AppShell>
    </ClientOnly>
  );
}
