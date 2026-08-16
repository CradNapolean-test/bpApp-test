'use server';

import { getClientProfile } from './clientProfile';
import { getDailyLog, getDailyLogs, getOrCreateDailyLog } from './dailyLogs';
import { getFoodDiaryEntries } from './foodDiary';
import { getFoodPhotos } from './foodPhotos';
import { getManualMacroEntries } from './manualMacros';
import { getMealPlanEntries } from './mealPlan';
import { getMealSections, getOrCreateMealSections } from './mealSections';
import { getActivities } from './foods';
import { getClientUnreadCount, getMessages } from './chat';
import {
  getCreditsBalance,
  getCreditsBucketBalances,
  getCreditsLedger,
  getScheduleOccurrences,
  getUpcomingBookings,
} from './classes';
import { getPrograms, getWorkoutLogs } from './workouts';
import { getClientExerciseMaxes } from './clientExerciseMaxes';
import { getWorkoutDayFeedback } from './workoutDayFeedback';
import { getCreditPacks, getMyMembership, getPackages } from './memberships';
import { getPhotos, getMeasurementLogs } from './progress';
import { getHabitsWithLogs } from './habits';
import { getUnreadNotifications } from './notifications';
import { getFormTemplates, getClientFormAssignments } from './forms';
import { getExerciseLibrary } from './exerciseLibrary';
import { getProgramTemplates } from './programTemplates';
import { getRecipesWithIngredients } from './recipes';
import { getCourses, getClientCourseAssignments } from './education';
import { getDisabledScreens } from './clientScreenSettings';
import { toIsoDate, todayIsoInTz, DEFAULT_TIMEZONE, startOfWeek, weekDates as weekDatesFor, addDays } from '@/lib/utils/dates';

const HISTORY_DAYS = 84;

// canWrite is false for a coach viewing a client read-only: RLS only allows a client to
// insert their own daily_logs rows, so a coach's session can't (and shouldn't) create
// today's blank row as a side effect of just looking at the page.
export async function loadDashboardBundle(clientId: string, canWrite: boolean) {
  // Profile is fetched first (not inside the big Promise.all below) specifically so its
  // timezone is available before "today" is resolved -- this is the fix for a client's
  // logged data landing on the wrong day near a UTC boundary (see migration 0044's comment
  // for the full root-cause explanation). Every date below derives from this, not raw UTC.
  const profile = await getClientProfile(clientId);
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
    unreadMessageCount,
    mealSections,
    disabledScreens,
  ] = await Promise.all([
    getDailyLogs(clientId, dates[0], dates[6]),
    getDailyLogs(clientId, historyStart, todayIso),
    getMealPlanEntries(clientId),
    getActivities(),
    canWrite ? getOrCreateDailyLog(clientId, todayIso) : getDailyLog(clientId, todayIso),
    getMessages(clientId),
    getUpcomingBookings(clientId),
    getScheduleOccurrences(),
    getCreditsBalance(clientId),
    getCreditsBucketBalances(clientId),
    getCreditsLedger(clientId),
    getPrograms(clientId),
    getWorkoutLogs(clientId),
    getClientExerciseMaxes(clientId),
    getWorkoutDayFeedback(clientId),
    getMyMembership(clientId),
    getPackages(),
    getCreditPacks(),
    getPhotos(clientId),
    getMeasurementLogs(clientId),
    getHabitsWithLogs(clientId, profile?.timezone ?? DEFAULT_TIMEZONE),
    getUnreadNotifications(clientId),
    getFormTemplates(),
    getClientFormAssignments(clientId),
    getExerciseLibrary(),
    getProgramTemplates(),
    getRecipesWithIngredients(clientId),
    getCourses(),
    getClientCourseAssignments(clientId),
    getClientUnreadCount(clientId),
    canWrite ? getOrCreateMealSections(clientId) : getMealSections(clientId),
    getDisabledScreens(clientId),
  ]);

  const foodDiaryEntries = todayLog ? await getFoodDiaryEntries(todayLog.id) : [];
  const foodPhotos = todayLog ? await getFoodPhotos(todayLog.id) : [];
  const manualMacroEntries = todayLog ? await getManualMacroEntries(todayLog.id) : [];

  const firstLogDate = historyLogs[0]?.log_date;
  const programWeek = firstLogDate
    ? Math.max(1, Math.floor((today.getTime() - new Date(firstLogDate).getTime()) / (7 * 86400000)) + 1)
    : 1;

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
    unreadMessageCount,
    mealSections,
    disabledScreens,
  };
}
