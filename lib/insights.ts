import { calcEngine, estimateAdaptiveTdee } from './calculations';
import { dayCaloriesOf, hasFoodLogged } from './utils/dailyLog';
import { addDays, toIsoDate } from './utils/dates';
import type { ClientProfileRow, DailyLogRow } from './data/types';

// "Your real-world maintenance calories" (R19). The calorie engine (lib/calculations.ts, not changed) turns average intake and the change
// in weight into a maintenance figure, but with no minimum span it could be fed five food days and two weigh-ins a day or two apart,
// extrapolate a small change to a daily figure, and come out negative; the card then told the MEMBER "N kcal off your plan, ask your coach
// to review". This only calls the engine when there is enough to go on, and refuses an answer that cannot be true.

export const ADAPTIVE_WINDOW_DAYS = 28;
// Weigh-ins at least this many days apart: a change over a day or two is mostly water and noise.
export const MIN_WEIGH_IN_SPAN_DAYS = 14;
// Days with food on them (not emptied days, not zero-calorie ones).
export const MIN_FOOD_DAYS = 10;
// Nobody's maintenance is outside this; an estimate that is means the inputs are bad, not that the person is unusual.
export const MIN_TDEE_KCAL = 1000;
export const MAX_TDEE_KCAL = 6000;

export const NEEDS_MORE_DATA = 'Needs about two weeks of food and weigh-ins';

export type AdaptiveTdee =
  | { status: 'ok'; adaptiveTdee: number; formulaTdee: number; divergence: number }
  | { status: 'not_enough'; reason: string };

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

export function trustworthyAdaptiveTdee(logs: DailyLogRow[], profile: ClientProfileRow | null, todayIso?: string): AdaptiveTdee {
  const notEnough = (reason: string): AdaptiveTdee => ({ status: 'not_enough', reason });
  if (!profile?.age || !profile.body_fat_pct) return notEnough('Needs the age and body fat on the profile');

  // The last 28 days up to today (or the latest log, when no date is given).
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const end = todayIso ?? sorted.at(-1)?.log_date;
  if (!end) return notEnough(NEEDS_MORE_DATA);
  const start = toIsoDate(addDays(new Date(`${end}T00:00:00Z`), -(ADAPTIVE_WINDOW_DAYS - 1)));
  const inWindow = sorted.filter((l) => l.log_date >= start && l.log_date <= end);

  // A day counts as food only if something with calories is on it.
  const foodDays = inWindow.filter((l) => hasFoodLogged(l) && dayCaloriesOf(l) > 0);
  if (foodDays.length < MIN_FOOD_DAYS) return notEnough(NEEDS_MORE_DATA);

  const weighIns = inWindow.filter((l) => l.bodyweight != null);
  if (weighIns.length < 2) return notEnough(NEEDS_MORE_DATA);
  const first = weighIns[0];
  const last = weighIns[weighIns.length - 1];
  const span = daysBetween(first.log_date, last.log_date);
  if (span < MIN_WEIGH_IN_SPAN_DAYS) return notEnough(NEEDS_MORE_DATA);

  const avgIntake = foodDays.reduce((sum, l) => sum + dayCaloriesOf(l), 0) / foodDays.length;
  const adaptiveTdee = estimateAdaptiveTdee(avgIntake, (last.bodyweight as number) - (first.bodyweight as number), span);
  if (!(adaptiveTdee >= MIN_TDEE_KCAL && adaptiveTdee <= MAX_TDEE_KCAL)) {
    return notEnough('The estimate came out unrealistic, so it is not shown. A few more weeks of logging will settle it.');
  }

  const engine = calcEngine({
    age: profile.age,
    gender: profile.gender === 'Male' ? 'Male' : 'Female',
    startWeight: profile.start_weight,
    goalWeight: profile.goal_weight,
    bodyFatPct: profile.body_fat_pct,
    activityLevel: profile.activity_level,
    dietApproach: profile.diet_approach,
    goal: profile.nutrition_goal ?? 'fat_loss',
    setting: profile.nutrition_setting ?? 'steady',
    cycling: profile.cycling,
  });
  if (!engine) return notEnough('Needs the age and body fat on the profile');
  return { status: 'ok', adaptiveTdee, formulaTdee: engine.tdee, divergence: adaptiveTdee - engine.tdee };
}
