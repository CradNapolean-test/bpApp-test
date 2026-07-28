import { calcEngine, cycleDayFor, dayCalories, estimateAdaptiveTdee, isPlateaued } from '@/lib/calculations';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';

const ADAPTIVE_WINDOW_DAYS = 28;
const DIVERGENCE_FLAG_KCAL = 150;

export function InsightsTab({
  historyLogs,
  profile,
}: {
  historyLogs: DailyLogRow[];
  profile: ClientProfileRow | null;
}) {
  const loggedDays = historyLogs
    .filter((l) => l.protein != null && l.carbs != null && l.fat != null)
    .slice(-ADAPTIVE_WINDOW_DAYS);

  const bodyweightSeries = historyLogs
    .filter((l) => l.bodyweight != null)
    .map((l) => l.bodyweight as number);

  let adaptiveInsight: { adaptiveTdee: number; formulaTdee: number; divergence: number } | null = null;
  if (loggedDays.length >= 5 && profile?.age && profile.body_fat_pct) {
    const avgLoggedCalories =
      loggedDays.reduce((sum, l) => sum + dayCalories(l.protein ?? 0, l.carbs ?? 0, l.fat ?? 0), 0) /
      loggedDays.length;
    const bwLogged = loggedDays.filter((l) => l.bodyweight != null);
    if (bwLogged.length >= 2) {
      const weightChangeKg = (bwLogged.at(-1)!.bodyweight as number) - (bwLogged[0].bodyweight as number);
      const spanDays =
        (new Date(bwLogged.at(-1)!.log_date).getTime() - new Date(bwLogged[0].log_date).getTime()) / 86400000;
      const adaptiveTdee = estimateAdaptiveTdee(avgLoggedCalories, weightChangeKg, spanDays);
      const engine = calcEngine({
        age: profile.age,
        gender: profile.gender === 'Male' ? 'Male' : 'Female',
        startWeight: profile.start_weight,
        goalWeight: profile.goal_weight,
        bodyFatPct: profile.body_fat_pct,
        activityLevel: profile.activity_level,
        dietApproach: profile.diet_approach,
        tier: profile.tier,
        cycling: profile.cycling,
      });
      if (engine) {
        adaptiveInsight = {
          adaptiveTdee,
          formulaTdee: engine.tdee,
          divergence: adaptiveTdee - engine.tdee,
        };
      }
    }
  }

  const plateaued = isPlateaued(bodyweightSeries.slice(-28));

  let cycleNote: number | null = null;
  if (profile?.gender === 'Female' && historyLogs.length > 0) {
    const periodStartDates = historyLogs.filter((l) => l.period_started).map((l) => l.log_date);
    const latest = historyLogs.at(-1)!;
    const day = cycleDayFor(periodStartDates, latest.log_date);
    if (day && day >= 18 && day <= 28) cycleNote = day;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Adaptive maintenance check</h3>
        {adaptiveInsight ? (
          <>
            <p className="mt-2 text-sm">
              Formula TDEE: {Math.round(adaptiveInsight.formulaTdee)} kcal · Real-world estimate:{' '}
              {Math.round(adaptiveInsight.adaptiveTdee)} kcal
            </p>
            {Math.abs(adaptiveInsight.divergence) > DIVERGENCE_FLAG_KCAL && (
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                {Math.round(Math.abs(adaptiveInsight.divergence))} kcal divergence from formula — worth a coach review.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            Need at least 5 logged days with 2+ bodyweight entries to estimate.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Plateau check</h3>
        <p className="mt-2 text-sm">
          {bodyweightSeries.length < 6
            ? 'Not enough bodyweight entries yet.'
            : plateaued
              ? 'Bodyweight has moved less than 0.3kg over the recent window — possible plateau.'
              : 'Bodyweight is trending, no plateau detected.'}
        </p>
      </div>

      {profile?.gender === 'Female' && (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Cycle-aware note</h3>
          <p className="mt-2 text-sm">
            {cycleNote
              ? `Latest entry falls on cycle day ${cycleNote} — likely water retention, not fat gain.`
              : 'No cycle-related note for the latest entry.'}
          </p>
        </div>
      )}
    </div>
  );
}
