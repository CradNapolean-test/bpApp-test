'use server';

import { getClientProfile } from './clientProfile';
import { getDailyLog, getDailyLogs, getFirstLoggedDate, getLoggedDates, getOrCreateDailyLog } from './dailyLogs';
import { currentStreak } from '@/lib/streak';
import { programWeekAt } from '@/lib/programWeek';
import { getFoodDiaryEntries } from './foodDiary';
import { getFoodPhotos } from './foodPhotos';
import { getManualMacroEntries } from './manualMacros';
import { getMealPlanEntries } from './mealPlan';
import { getMealSections, getOrCreateMealSections } from './mealSections';
import { getActivities } from './foods';
import { getClientUnreadCount, getMessages } from './chat';
import { getCreditsBalance, getCreditsBucketBalances, getRecentAndUpcomingBookings } from './classes';
import { getPrograms, getWorkoutLogs } from './workouts';
import { getClientExerciseMaxes } from './clientExerciseMaxes';
import { getBigDogResults } from './bigDog';
import { getUpcomingEvents } from './community';
import { getRewardsForMember } from './rewards';
import { getWorkoutDayFeedback } from './workoutDayFeedback';
import { getBlockChoices } from './blockChoices';
import { getBlockResults } from './blockResults';
import { getGymBookingRules, getGymReferralUrl } from './gym';
import { getClientGymId, getCreditPacks, getCreditPacksForGym, getMyMembership, getPackages, getPackagesForGym } from './memberships';
import { getPhotos, getMeasurementLogs } from './progress';
import { getBodyScans } from './bodyScans';
import { getNutritionFeedback } from './nutritionFeedback';
import { getNotifications } from './notifications';
import { getFormTemplates, getClientFormAssignments } from './forms';
import { getExerciseLibraryByIds } from './exerciseLibrary';
import { getProgramTemplates } from './programTemplates';
import { getRecipesWithIngredients } from './recipes';
import { getDisabledMetrics, getDisabledScreens } from './clientScreenSettings';
import { toIsoDate, todayIsoInTz, DEFAULT_TIMEZONE, startOfWeek, weekDates as weekDatesFor, addDays } from '@/lib/utils/dates';
import { bookingWindowStart, workoutWindowStart } from '@/lib/trainingWindow';
import { libraryIdsOf } from '@/lib/programLibrary';
import type { CreditPackRow, MembershipPackageRow, ProgramTemplateRow, FormTemplateRow } from './types';

const HISTORY_DAYS = 84;

// canWrite is false for a coach viewing a client read-only: RLS only allows a client to
// insert their own daily_logs rows, so a coach's session can't (and shouldn't) create
// today's blank row as a side effect of just looking at the page.
//
// It also decides what the page carries (R13/M1: the member's page was 347 KB, 300 KB of it data). A member's own page leaves out what only
// a coach uses (plans, credit packs, form and programme templates). Neither page carries the whole exercise library, only the entries the
// member's programmes use; the coach's builder reads the rest when a day is opened (DB21: it was about 227 KB of the coach's member page,
// which took 3-8 s). Both pages leave out what a screen can fetch when it opens: the timetable, the Education courses and assignments, the credit
// history and the habits, which nothing on the page showed.
export async function loadDashboardBundle(clientId: string, canWrite: boolean) {
  // Profile is fetched first (not inside the big Promise.all below) specifically so its
  // timezone is available before "today" is resolved -- this is the fix for a client's
  // logged data landing on the wrong day near a UTC boundary (see migration 0044's comment
  // for the full root-cause explanation). Every date below derives from this, not raw UTC.
  // The member's own gym too: a coach working in a different gym still sees the member's plans, forms and timetable, not their own (R38).
  const [profile, gymId] = await Promise.all([getClientProfile(clientId), getClientGymId(clientId)]);
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const weekStart = startOfWeek(today);
  const dates = weekDatesFor(weekStart);
  const historyStart = toIsoDate(addDays(today, -HISTORY_DAYS));

  const [
    weekLogs,
    historyLogs,
    mealPlanEntries,
    activities,
    todayLog,
    messages,
    bookings,
    creditsBalance,
    creditsBuckets,
    programs,
    workoutLogs,
    clientExerciseMaxes,
    workoutDayFeedback,
    blockChoices,
    blockResults,
    membership,
    packages,
    creditPacks,
    photos,
    bodyScans,
    nutritionFeedback,
    measurementLogs,
    notifications,
    formTemplates,
    formAssignments,
    programTemplates,
    recipes,
    unreadMessageCount,
    mealSections,
    disabledScreens,
    disabledMetrics,
    bigDogResults,
    events,
    rewardsData,
    gymRules,
    referralUrl,
    loggedDates,
    firstLoggedDate,
  ] = await Promise.all([
    getDailyLogs(clientId, dates[0], dates[6]),
    getDailyLogs(clientId, historyStart, todayIso),
    getMealPlanEntries(clientId),
    getActivities(),
    canWrite ? getOrCreateDailyLog(clientId, todayIso) : getDailyLog(clientId, todayIso),
    getMessages(clientId),
    getRecentAndUpcomingBookings(clientId, bookingWindowStart(todayIso)),
    getCreditsBalance(clientId),
    getCreditsBucketBalances(clientId),
    getPrograms(clientId),
    getWorkoutLogs(clientId, workoutWindowStart(todayIso)),
    getClientExerciseMaxes(clientId),
    getWorkoutDayFeedback(clientId),
    getBlockChoices(clientId),
    getBlockResults(clientId),
    getMyMembership(clientId),
    canWrite ? Promise.resolve([] as MembershipPackageRow[]) : gymId ? getPackagesForGym(gymId) : getPackages(),
    canWrite ? Promise.resolve([] as CreditPackRow[]) : gymId ? getCreditPacksForGym(gymId) : getCreditPacks(),
    getPhotos(clientId),
    getBodyScans(clientId),
    getNutritionFeedback(clientId),
    getMeasurementLogs(clientId),
    getNotifications(clientId),
    canWrite ? Promise.resolve([] as FormTemplateRow[]) : getFormTemplates(gymId),
    getClientFormAssignments(clientId),
    canWrite ? Promise.resolve([] as ProgramTemplateRow[]) : getProgramTemplates(gymId),
    getRecipesWithIngredients(clientId),
    getClientUnreadCount(clientId),
    canWrite ? getOrCreateMealSections(clientId) : getMealSections(clientId),
    getDisabledScreens(clientId),
    getDisabledMetrics(clientId),
    getBigDogResults(clientId),
    // The member's own gym's events (not whichever gym the coach viewing them has active).
    getUpcomingEvents(clientId, gymId),
    getRewardsForMember(clientId),
    getGymBookingRules(gymId),
    // A member's page shows the Refer a friend screen only when their gym has a link (R16).
    canWrite ? getGymReferralUrl(gymId) : Promise.resolve(null as string | null),
    // A year of logged days for the streak (the 84 days above cap it at 85), and the first day ever for the programme week.
    getLoggedDates(clientId, toIsoDate(addDays(today, -400))),
    getFirstLoggedDate(clientId),
  ]);

  // Both pages carry the library entries the member's programmes use (their videos, pictures and muscle groups); the coach's builder reads
  // the whole library when it opens (DB21).
  const exerciseLibrary = await getExerciseLibraryByIds(libraryIdsOf(programs));

  const foodDiaryEntries = todayLog ? await getFoodDiaryEntries(todayLog.id) : [];
  const foodPhotos = todayLog ? await getFoodPhotos(todayLog.id) : [];
  const manualMacroEntries = todayLog ? await getManualMacroEntries(todayLog.id) : [];

  // Counted from the programme's start (the join date the coach set, else the first day ever logged), not from the first log inside the
  // 84-day window, which made it read "week 13" for everyone forever (L1).
  const programWeek = programWeekAt(todayIso, profile?.join_date ?? firstLoggedDate);
  const streak = currentStreak(loggedDates, todayIso);

  return {
    profile,
    weekDates: dates,
    weekLogs,
    historyLogs,
    mealPlanEntries,
    activities,
    todayLogId: todayLog?.id ?? null,
    foodDiaryEntries,
    foodPhotos,
    manualMacroEntries,
    programWeek,
    messages,
    bookings,
    creditsBalance,
    creditsBuckets,
    programs,
    workoutLogs,
    clientExerciseMaxes,
    workoutDayFeedback,
    blockChoices,
    blockResults,
    membership,
    packages,
    creditPacks,
    photos,
    bodyScans,
    nutritionFeedback,
    measurementLogs,
    notifications,
    formTemplates,
    formAssignments,
    exerciseLibrary,
    programTemplates,
    recipes,
    unreadMessageCount,
    mealSections,
    disabledScreens,
    disabledMetrics,
    bigDogResults,
    events,
    rewardsData,
    referralUrl,
    gymTimezone: gymRules.timezone,
    gymBlackout: { start: gymRules.blackoutStart, end: gymRules.blackoutEnd },
    streak,
  };
}
