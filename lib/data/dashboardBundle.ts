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
import { getCreditsBalance, getCreditsLedger, getScheduleOccurrences, getUpcomingBookings } from './classes';
import { getPrograms, getWorkoutLogs } from './workouts';
import { getClientExerciseMaxes } from './clientExerciseMaxes';
import { getWorkoutDayFeedback } from './workoutDayFeedback';
import { getMyMembership, getPackages } from './memberships';
import { getPhotos, getMeasurementLogs } from './progress';
import { getHabitsWithLogs } from './habits';
import { getUnreadNotifications } from './notifications';
import { getFormTemplates, getClientFormAssignments } from './forms';
import { getExerciseLibrary } from './exerciseLibrary';
import { getProgramTemplates } from './programTemplates';
import { getRecipesWithIngredients } from './recipes';
import { getCourses, getClientCourseAssignments } from './education';
import { getDisabledScreens } from './clientScreenSettings';
import { toIsoDate, startOfWeek, weekDates as weekDatesFor, addDays } from '@/lib/utils/dates';

const HISTORY_DAYS = 84;

// canWrite is false for a coach viewing a client read-only: RLS only allows a client to
// insert their own daily_logs rows, so a coach's session can't (and shouldn't) create
// today's blank row as a side effect of just looking at the page.
export async function loadDashboardBundle(clientId: string, canWrite: boolean) {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const weekStart = startOfWeek(today);
  const dates = weekDatesFor(weekStart);
  const historyStart = toIsoDate(addDays(today, -HISTORY_DAYS));

  const [
    profile,
    weekLogs,
    historyLogs,
    mealPlanEntries,
    activities,
    todayLog,
    messages,
    bookings,
    occurrences,
    creditsBalance,
    creditsLedger,
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
    educationCourses,
    educationAssignments,
    unreadMessageCount,
    mealSections,
    disabledScreens,
  ] = await Promise.all([
    getClientProfile(clientId),
    getDailyLogs(clientId, dates[0], dates[6]),
    getDailyLogs(clientId, historyStart, todayIso),
    getMealPlanEntries(clientId),
    getActivities(),
    canWrite ? getOrCreateDailyLog(clientId, todayIso) : getDailyLog(clientId, todayIso),
    getMessages(clientId),
    getUpcomingBookings(clientId),
    getScheduleOccurrences(),
    getCreditsBalance(clientId),
    getCreditsLedger(clientId),
    getPrograms(clientId),
    getWorkoutLogs(clientId),
    getClientExerciseMaxes(clientId),
    getWorkoutDayFeedback(clientId),
    getMyMembership(clientId),
    getPackages(),
    getPhotos(clientId),
    getMeasurementLogs(clientId),
    getHabitsWithLogs(clientId),
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
    creditsLedger,
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
    educationCourses,
    educationAssignments,
    unreadMessageCount,
    mealSections,
    disabledScreens,
  };
}
