import { weeklyTarget } from '@/lib/calculations';
import { averageDayTarget } from '@/lib/utils/dayTarget';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { dayCaloriesOf, hasFoodLogged } from '@/lib/utils/dailyLog';
import { isoWeekKey } from '@/lib/utils/dates';
import { programWeekAt } from '@/lib/programWeek';
import { calorieTone, splitFoodDays } from '@/lib/weekFood';
import type { TrafficLight } from '@/lib/utils/accountability';
import type { ClientProfileRow } from '@/lib/data/types';

// The Members list's food column (NU30): how each member tracks their food, and this week's average calories against their target.
// The same numbers as the member's own Overview: the target from calculations.ts (averageDayTarget, so a calorie-cycling member's is the
// planned average day), the programme week from the join date or else the first day they logged, and the average from this week's full
// days before today (splitFoodDays: today is still going, and a shake-only day is left out).

export type FoodMethod = ClientProfileRow['nutrition_tracking_mode'];

// The Overview's words for the three ways (CoachMemberOverview).
export const FOOD_METHOD_LABEL: Record<FoodMethod, string> = {
  full_tracking: 'Full tracking',
  manual_import: 'Typed totals',
  photo_diary: 'Photo diary',
};

export interface MemberNutrition {
  method: FoodMethod;
  // Average calories a day over this week's full days, or null when there are none yet.
  avg: number | null;
  // The day's calorie target, or null when the member's details aren't enough to work one out.
  target: number | null;
  fullDays: number;
  // Days of this week before today (0 on a Monday: the first full day counts from tomorrow).
  completedDays: number;
  tone: TrafficLight | null;
}

// The columns of client_profiles the target needs, for the list's one read (lib/data/coach.ts).
export const NUTRITION_PROFILE_COLUMNS =
  'nutrition_tracking_mode, age, gender, start_weight, goal_weight, body_fat_pct, activity_level, diet_approach, nutrition_goal, nutrition_setting, cycling, custom_calories, custom_protein, custom_carbs, custom_fat, join_date';

type FoodLog = { log_date: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

export function weekNutrition(
  profile: Partial<ClientProfileRow> | null,
  weekLogs: FoodLog[],
  firstLoggedDate: string | null,
  todayIso: string
): MemberNutrition {
  const method: FoodMethod =
    profile?.nutrition_tracking_mode === 'manual_import' || profile?.nutrition_tracking_mode === 'photo_diary' ? profile.nutrition_tracking_mode : 'full_tracking';
  const engine = toEngineProfile((profile ?? null) as ClientProfileRow | null);
  const programWeek = programWeekAt(todayIso, profile?.join_date ?? firstLoggedDate);
  const day = averageDayTarget(engine ? weeklyTarget(engine, programWeek) : null);
  const target = day && day.calories > 0 ? Math.round(day.calories) : null;
  const weekStart = isoWeekKey(todayIso);
  const thisWeek = weekLogs.filter((l) => l.log_date >= weekStart && l.log_date < todayIso && hasFoodLogged(l));
  const split = splitFoodDays(thisWeek, todayIso, weekStart, target, dayCaloriesOf);
  const avg = split.full.length > 0 ? Math.round(split.full.reduce((n, l) => n + dayCaloriesOf(l), 0) / split.full.length) : null;
  return {
    method,
    avg,
    target,
    fullDays: split.full.length,
    completedDays: split.completedDays,
    tone: avg != null && target != null ? calorieTone(avg, target) : null,
  };
}

// The list's words: "1,850 / 1,900 kcal", and under it the way they track and how many days it is from.
export function nutritionText(n: MemberNutrition | null | undefined): { main: string; detail: string } {
  if (!n) return { main: '—', detail: '' };
  const kcal = (v: number) => v.toLocaleString('en-GB');
  const main = n.avg != null ? `${kcal(n.avg)}${n.target != null ? ` / ${kcal(n.target)}` : ''} kcal` : n.target != null ? `— / ${kcal(n.target)} kcal` : '—';
  const days =
    n.completedDays === 0
      ? 'from tomorrow'
      : n.avg != null
        ? `${n.fullDays} of ${n.completedDays} day${n.completedDays === 1 ? '' : 's'}`
        : n.method === 'photo_diary'
          ? 'photos, no calories'
          : 'no full day yet';
  return { main, detail: `${FOOD_METHOD_LABEL[n.method]} · ${days}` };
}
