import { Activity, Gauge, Moon } from 'lucide-react';
import { calcEngine, cycleDayFor, dayCalories, estimateAdaptiveTdee, isPlateaued } from '@/lib/calculations';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

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
  isCoachView = false,
}: {
  historyLogs: DailyLogRow[];
  profile: ClientProfileRow | null;
  isCoachView?: boolean;
}) {
  const who = isCoachView ? 'their' : 'your';
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
      ? `${Math.round(Math.abs(adaptiveInsight.divergence))} kcal off ${isCoachView ? 'their' : 'your'} plan${isCoachView ? ', worth reviewing' : ' — ask your coach to review'}`
      : undefined;

  return (
    <div className="space-y-3">
      <InsightCard icon={Gauge} iconCls="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" title={isCoachView ? "Their real-world maintenance calories" : "Your real-world maintenance calories"} flag={divergenceFlag}>
        {adaptiveInsight ? (
          <p>
            Maintenance calories are what {isCoachView ? 'they' : 'you'} eat to stay the same weight. {isCoachView ? 'Their' : 'Your'} plan assumes about{' '}
            <b className="text-black dark:text-zinc-50">{Math.round(adaptiveInsight.formulaTdee)} kcal</b>; going by what {isCoachView ? 'they have' : 'you have'}
            actually eaten and how {who} weight moved, it looks closer to{' '}
            <b className="text-black dark:text-zinc-50">{Math.round(adaptiveInsight.adaptiveTdee)} kcal</b>.
          </p>
        ) : (
          <p>{isCoachView ? 'Not enough data yet. This needs 5 logged days of food and at least 2 weigh-ins.' : 'Keep logging your food and weighing in. Once you have 5 logged days and at least 2 weigh-ins we can estimate this for you.'}</p>
        )}
      </InsightCard>

      <InsightCard icon={Activity} iconCls="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" title={isCoachView ? "Is their weight stalling?" : "Is your weight stalling?"}>
        <p>
          {bodyweightSeries.length < 6
            ? isCoachView
              ? 'Not enough weigh-ins yet (needs 6 or more).'
              : 'Weigh in a few more times (6 or more) and we will tell you if your weight has stalled.'
            : plateaued
              ? isCoachView
                ? 'Their weight has barely moved (under 0.3kg) recently. This can be normal.'
                : 'Your weight has barely moved (under 0.3kg) recently. This can be normal — mention it to your coach.'
              : isCoachView
                ? 'Their weight is moving, so no stall detected.'
                : 'Your weight is moving, so no stall detected.'}
        </p>
      </InsightCard>

      {profile?.gender === 'Female' && (
        <InsightCard icon={Moon} iconCls="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" title="Cycle note">
          <p>
            {cycleNote
              ? `Latest entry falls on cycle day ${cycleNote} — weight is often higher from water retention at this point, not fat gain.`
              : isCoachView
                ? 'Nothing to flag from their latest entry.'
                : 'Nothing to flag from your latest entry.'}
          </p>
        </InsightCard>
      )}
    </div>
  );
}
