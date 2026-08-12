import { Activity, Gauge, Moon } from 'lucide-react';
import { calcEngine, cycleDayFor, dayCalories, estimateAdaptiveTdee, isPlateaued } from '@/lib/calculations';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';

const cardCls = 'rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

function InsightCard({
  icon: Icon, iconCls, title, children, flag,
}: {
  icon: typeof Gauge;
  iconCls: string;
  title: string;
  children: React.ReactNode;
  flag?: string;
}) {
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconCls}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-black dark:text-zinc-50">{title}</h3>
      </div>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
      {flag && (
        <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
          {flag}
        </span>
      )}
    </div>
  );
}

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

  const divergenceFlag =
    adaptiveInsight && Math.abs(adaptiveInsight.divergence) > DIVERGENCE_FLAG_KCAL
      ? `${Math.round(Math.abs(adaptiveInsight.divergence))} kcal divergence — worth a review`
      : undefined;

  return (
    <div className="space-y-3">
      <InsightCard icon={Gauge} iconCls="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" title="Adaptive maintenance check" flag={divergenceFlag}>
        {adaptiveInsight ? (
          <p>
            Formula TDEE: {Math.round(adaptiveInsight.formulaTdee)} kcal · Real-world estimate:{' '}
            {Math.round(adaptiveInsight.adaptiveTdee)} kcal
          </p>
        ) : (
          <p>Need at least 5 logged days with 2+ bodyweight entries to estimate.</p>
        )}
      </InsightCard>

      <InsightCard icon={Activity} iconCls="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" title="Plateau check">
        <p>
          {bodyweightSeries.length < 6
            ? 'Not enough bodyweight entries yet.'
            : plateaued
              ? 'Bodyweight has moved less than 0.3kg over the recent window — possible plateau.'
              : 'Bodyweight is trending, no plateau detected.'}
        </p>
      </InsightCard>

      {profile?.gender === 'Female' && (
        <InsightCard icon={Moon} iconCls="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" title="Cycle-aware note">
          <p>
            {cycleNote
              ? `Latest entry falls on cycle day ${cycleNote} — likely water retention, not fat gain.`
              : 'No cycle-related note for the latest entry.'}
          </p>
        </InsightCard>
      )}
    </div>
  );
}
