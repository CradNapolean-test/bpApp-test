import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { weeklyTarget } from '@/lib/calculations';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { dayTargetFor } from '@/lib/utils/dayTarget';
import { targetsHeldBack } from '@/lib/onboarding';
import { dayCaloriesOf, hasLoggedData } from '@/lib/utils/dailyLog';
import { formatClassTime, formatLongDate, todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type {
  BookingRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  FormAssignmentWithDetails,
  EventWithSignup,
  RewardRow,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';
import type { Category, Screen } from './categories';
import { CheckInButton } from './CheckInButton';
import { bannerEvent } from '@/lib/eventBanner';
import { EventBanner } from './EventBanner';
import { currentStreak, showsStreak } from '@/lib/streak';
import { enabledTrackers, toDisabledMetricSet } from '@/lib/checkinMetrics';
import { clubProgress } from '@/lib/clubs';
import { challengeHome } from '@/lib/challengeHome';
import { checkinToday, homeWeek } from '@/lib/memberHome';
import { weightUnitOf } from '@/lib/utils/weightUnits';
import { foodLeft, workoutStripText } from '@/lib/todayStrip';
import { shortDay, WhatsNextCard } from './HomeChallenge';
import { stripWorkoutFor } from './TodayStrip';
import { FirstWeekCard } from './FirstWeekCard';
import { ClubCard, ExploreTiles, HomeHeader, NextSessionTile, NoSessionTile, YourDay } from './MemberHome';
import type { DayTraining } from './MemberHome';
import type { HeaderActions } from './MemberHeader';
import AnimatedContent from '@/app/_components/motion/AnimatedContent';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';

const NO_SCREENS: ReadonlySet<Screen> = new Set();

// Member Home. The layout is "Your day" (MemberHome.tsx); this works out what goes in it. A coach looking at a member gets
// CoachMemberOverview instead, so everything here is the member's own view.
export function TodayTab({
  profile,
  programWeek,
  weekLogs,
  historyLogs,
  formAssignments,
  bookings,
  creditsBalance,
  membership,
  programs,
  workoutLogs,
  onCheckIn,
  onNavigate,
  onNavigateClasses,
  isCoachView = false,
  rewards = [],
  sessionsAttended,
  showReferral = true,
  events = [],
  dailyCheckinHidden = false,
  streakDays,
  disabledMetrics = [],
  clientId,
  coachName,
  hiddenScreens = NO_SCREENS,
  header,
  banners,
}: {
  profile: ClientProfileRow | null;
  programWeek: number;
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  formAssignments: FormAssignmentWithDetails[];
  bookings: BookingRow[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  onNavigate: (category: Category, screen?: Screen) => void;
  onNavigateClasses?: () => void;
  isCoachView?: boolean;
  rewards?: RewardRow[];
  // Sessions attended, ever: the rewards function's count (the bookings above are the last 90 days and what is ahead).
  sessionsAttended?: number;
  // False when the member's gym has no referral link: the Refer a friend tile is left out (R16).
  showReferral?: boolean;
  events?: EventWithSignup[];
  dailyCheckinHidden?: boolean;
  // Consecutive days logged, worked out on the server from a year of logs (L2).
  streakDays?: number;
  disabledMetrics?: string[];
  // The member's own id (a "What's next" choice leaves a message in their chat) and their coach's name, when known.
  clientId?: string;
  coachName?: string | null;
  // Screens switched off for this member (their plan or coach): Your day leaves out what they cannot open.
  hiddenScreens?: ReadonlySet<Screen>;
  // The message bubble and the bell in the header.
  header?: HeaderActions;
  // Shown straight under the header: "add to your home screen", "confirm your details".
  banners?: ReactNode;
}) {
  // Must match the timezone dashboardBundle used server-side to resolve `weekLogs`/streaks/etc
  // (see lib/data/dashboardBundle.ts) -- a raw `toIsoDate(new Date())` here is the UTC date,
  // which disagrees with the client's local "today" for roughly half of every day outside UTC.
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  const todayLog = weekLogs.find((l) => l.log_date === todayIso);
  // Includes Quick Adds with no macros (R11): the ring used to show 0 for a 300 kcal Quick Add.
  const todayCalories = todayLog ? dayCaloriesOf(todayLog) : 0;

  // Today's own target: a calorie-cycling member's high day has the high target, any other day the low one.
  const todayType = todayLog?.day_type;
  const engineProfile = toMemberEngineProfile(profile, isCoachView);
  const dayTarget = dayTargetFor(engineProfile ? weeklyTarget(engineProfile, programWeek) : null, todayType);
  // A member whose plan is waiting for their coach sees a message where the target would be (M8).
  const planHeld = targetsHeldBack(profile, isCoachView);

  // The dashboard sends the streak worked out from a year of logs; without it, from the 84 days this screen has (L2).
  const streak = streakDays ?? currentStreak(historyLogs.filter(hasLoggedData).map((l) => l.log_date), todayIso);
  const upcomingEvent = useMemo(() => bannerEvent(events, new Date()), [events]);
  const streakVisible = showsStreak(membership);

  // Sleep, steps and water are the daily check-in: the ones switched on for this member.
  const trackers = enabledTrackers(toDisabledMetricSet(disabledMetrics));
  const checkin = checkinToday(
    todayLog ? { sleep: todayLog.sleep, steps: todayLog.steps, water: todayLog.water, bodyweight: todayLog.bodyweight } : null,
    trackers,
    weightUnitOf(profile?.weight_unit)
  );
  const pendingForms = formAssignments.filter((a) => !a.completed_at).length;

  const nextClass = bookings
    .filter((b) => b.status === 'booked' && b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')))[0];
  const nextIsToday = nextClass?.booking_date === todayIso;
  const nextTime = formatClassTime(nextClass?.class?.start_time);

  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  const greetingHour = new Date().getHours();
  const timeGreeting = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening';

  // D5: where a member is in a plan with a set length (the 6 Week Challenge), and in its last 2 weeks what comes next.
  const challenge = challengeHome(membership, todayIso, shortDay);

  // The week strip in the header: sessions attended, today, and what is still booked.
  const week = homeWeek(bookings, todayIso);

  // Your day. The food target is the food diary's own (dayTargetFor above); none while the plan waits for the coach. A line is left
  // out when the member's plan or coach switched that screen off (a photo-diary member always keeps Food).
  const mode = profile?.nutrition_tracking_mode;
  const foodOn = mode === 'photo_diary' || !hiddenScreens.has('Food Tracking');
  const strip = hiddenScreens.has('Workout') ? null : stripWorkoutFor(programs, workoutLogs, todayIso, tz);
  const workoutText = strip ? workoutStripText(strip.workout) : null;

  // Training today: the programme's workout for the day or, with no programme running, the class booked for today.
  const training: DayTraining | null =
    strip && workoutText
      ? {
          done: strip.workout.status === 'workout' && strip.workout.done,
          counts: strip.workout.status === 'workout',
          text: workoutText,
          onOpen: () => (strip.dayId ? onCheckIn(strip.dayId) : onNavigate('Training', 'Workout')),
        }
      : nextClass && nextIsToday
        ? {
            done: nextClass.attended,
            counts: true,
            text: { title: nextClass.class?.name ?? 'Class', detail: nextTime ? `Booked for ${nextTime}` : 'Booked for today' },
            onOpen: () => onNavigateClasses?.(),
          }
        : null;

  // Attendance is marked by the coach after each session, so this counts sessions actually attended rather than merely booked.
  const sessionsDone = sessionsAttended ?? bookings.filter((b) => b.attended).length;
  const club = clubProgress(sessionsDone);
  // The nearest not-yet-reached sessions reward (e.g. "Hoodie" at 100), named on the club card.
  const nextReward = rewards
    .filter((r) => r.kind === 'sessions' && r.threshold > sessionsDone)
    .sort((a, b) => a.threshold - b.threshold)[0];

  // The food ring and the club bar fill up from empty when Home opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.25);

  // "See the workout" opens today's workout without checking in; the check-in itself is the line above it, around the session time.
  const todaysDayId = nextIsToday ? (strip?.dayId ?? null) : null;

  return (
    <div ref={screen} className="space-y-4">
      <HomeHeader
        dateLabel={formatLongDate(new Date(), { timeZone: tz })}
        greeting={`${timeGreeting}, ${firstName}`}
        plan={challenge ? { name: challenge.planName, label: challenge.label } : null}
        onOpenPlan={() => onNavigate('Account Settings', 'Credits')}
        week={week}
        actions={header}
      >
        {nextClass ? (
          <NextSessionTile
            when={`${
              nextIsToday
                ? 'Today'
                : new Date(nextClass.booking_date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
            }${nextTime ? `, ${nextTime}` : ''}`}
            name={nextClass.class?.name ?? 'Session'}
            status={
              nextIsToday ? (
                <CheckInButton
                  classRow={nextClass.class}
                  programs={programs}
                  workoutLogs={workoutLogs}
                  onCheckIn={onCheckIn}
                  timezone={profile?.timezone}
                  date={nextClass.booking_date}
                  attended={nextClass.attended}
                  onAccent
                />
              ) : undefined
            }
            primary={todaysDayId ? { label: 'See the workout', onClick: () => onCheckIn(todaysDayId) } : { label: 'My bookings', onClick: onNavigateClasses }}
            secondary={todaysDayId ? { label: "Can't make it", onClick: onNavigateClasses } : null}
          />
        ) : (
          <NoSessionTile credits={creditsBalance} onBook={onNavigateClasses} />
        )}
      </HomeHeader>

      {/* Under the header, each card rises into place in turn when Home opens. */}
      <AnimatedContent className="space-y-4" distance={18} duration={0.5} stagger={0.06} delay={0.05}>

      {banners && <div className="space-y-3 empty:hidden">{banners}</div>}

      {challenge?.whatsNext && clientId && (
        <WhatsNextCard
          home={challenge}
          clientId={clientId}
          gymId={membership?.package?.gym_id ?? null}
          coachName={coachName}
          onOpenChat={() => onNavigate('Messages')}
        />
      )}
      {clientId && (
        <FirstWeekCard
          clientId={clientId}
          onboardedAt={profile?.onboarding_completed_at}
          todayIso={todayIso}
          timezone={tz}
          coachName={coachName}
          show={{ photos: !hiddenScreens.has('Progress & Photos'), weighIn: !dailyCheckinHidden, forms: !hiddenScreens.has('Forms') }}
          onOpen={(key) => {
            if (key === 'photos') onNavigate('Progress', 'Progress & Photos');
            else if (key === 'weigh_in') onNavigate('Accountability', 'Weekly Log');
            else if (key === 'intake') onNavigate('Accountability', 'Forms');
            else if (key === 'book') onNavigateClasses?.();
            else onNavigate('Messages');
          }}
        />
      )}
      {upcomingEvent && <EventBanner event={upcomingEvent} onOpen={() => onNavigate('Community', 'Events')} />}

      <YourDay
        checkin={dailyCheckinHidden ? null : { ...checkin, onOpen: () => onNavigate('Accountability', 'Weekly Log') }}
        food={
          foodOn
            ? {
                left: foodLeft({ mode, held: planHeld, target: dayTarget, eaten: { calories: todayCalories, protein: todayLog?.protein ?? 0 } }),
                eaten: todayCalories,
                target: dayTarget?.calories ?? null,
                onOpen: () => onNavigate('Nutrition', 'Food Tracking'),
              }
            : null
        }
        training={training}
        streak={streakVisible ? streak : null}
        onOpenStreak={() => onNavigate('Accountability', 'Weekly Log')}
      />

      {pendingForms > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('Accountability', 'Forms')}
          className="flex w-full items-center justify-between gap-3 rounded-[20px] border border-warning/30 bg-warning/10 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2.5">
            <Camera className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold text-black dark:text-zinc-50">
              {pendingForms} form{pendingForms === 1 ? '' : 's'} to complete
            </span>
          </span>
          <span className="text-xs font-bold text-warning">Open</span>
        </button>
      )}

      <ClubCard
        sessions={sessionsDone}
        club={club}
        nextReward={nextReward ? `${nextReward.name} at ${nextReward.threshold}` : null}
        onOpen={() => onNavigate('Community', 'Rewards')}
      />

      <ExploreTiles onNavigate={onNavigate} showReferral={showReferral} />
      </AnimatedContent>
    </div>
  );
}
