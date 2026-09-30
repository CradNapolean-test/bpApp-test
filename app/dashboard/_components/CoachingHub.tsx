import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Dumbbell, LineChart, MessageCircle, NotebookPen, Trophy } from 'lucide-react';
import { ProgressRing } from '@/app/_components/ProgressRing';
import { weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { trafficLight } from '@/lib/utils/accountability';
import type { TrafficLight } from '@/lib/utils/accountability';
import { bigDogCount, TIER_TITLE, tierForCount } from '@/lib/bigDog';
import type { BigDogResultRow, ClientProfileRow, DailyLogRow, WorkoutProgramRow } from '@/lib/data/types';
import type { Category, Screen } from './categories';

// "My coaching" hub -- the destination of the Coach tab, following the owner's BP mockup
// (05-my-coaching-home): coach strip, today's nutrition rings, training, today's
// accountability numbers, and progress & results.

const cardCls = 'rounded-2xl border border-black/[.06] bg-[var(--background)] p-3.5 dark:border-white/10';
const sectionCls = 'px-1 pb-1.5 pt-1 text-[9px] font-extrabold uppercase tracking-[2px] text-zinc-500';

const LIGHT_TEXT: Record<TrafficLight, string> = { green: 'text-success', amber: 'text-warning', red: 'text-danger' };

function LinkRow({
  icon: Icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border-b border-black/5 px-3.5 py-3 text-left last:border-b-0 dark:border-white/5"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-black dark:text-zinc-50">{title}</span>
          <span className="block truncate text-[10px] text-zinc-500">{subtitle}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {badge && (
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-extrabold text-accent">
            {badge}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-zinc-400" />
      </span>
    </button>
  );
}

function MacroRing({ label, unit, value, target }: { label: string; unit: string; value: number; target: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <ProgressRing value={value} target={target ?? 0} label="" size={62} strokeWidth={6} hideValue />
      <p className="text-[13px] font-black leading-none text-black dark:text-zinc-50">
        {Math.round(value)}
        <span className="text-[9px] font-bold text-zinc-500">{unit}</span>
      </p>
      <p className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-[9px] text-zinc-400">{target != null ? `of ${Math.round(target)}${unit}` : '—'}</p>
    </div>
  );
}

function TrackerStat({ label, display, light }: { label: string; display: string; light: TrafficLight | null }) {
  return (
    <div className="flex-1 rounded-xl bg-black/[.03] px-2 py-2.5 text-center dark:bg-white/[.04]">
      <p className={`text-base font-black leading-none ${light ? LIGHT_TEXT[light] : 'text-zinc-400'}`}>{display}</p>
      <p className="mt-1 text-[9px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

export function CoachingHub({
  profile,
  programWeek,
  weekLogs,
  programs,
  bigDogResults,
  unreadMessageCount,
  onNavigate,
}: {
  profile: ClientProfileRow | null;
  programWeek: number;
  weekLogs: DailyLogRow[];
  programs: WorkoutProgramRow[];
  bigDogResults: BigDogResultRow[];
  unreadMessageCount: number;
  onNavigate: (category: Category, screen?: Screen) => void;
}) {
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const todayLog = weekLogs.find((l) => l.log_date === todayIso);

  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  const protein = todayLog?.protein ?? 0;
  const carbs = todayLog?.carbs ?? 0;
  const fat = todayLog?.fat ?? 0;
  const calories = protein * 4 + carbs * 4 + fat * 9;

  const program = programs[0] ?? null;
  const sleep = todayLog?.sleep ?? null;
  const steps = todayLog?.steps ?? null;
  const water = todayLog?.water ?? null;

  const bdCount = bigDogCount(bigDogResults);
  const tier = tierForCount(bdCount);

  return (
    <div className="space-y-3">
      <div className={`${cardCls} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent bg-accent-soft text-sm font-black text-accent">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-black dark:text-zinc-50">Your coach</p>
            <p className="text-[10px] text-zinc-500">Your assigned coach</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('Messages')}
          className="relative flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-extrabold text-accent-foreground"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Message
          {unreadMessageCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadMessageCount}
            </span>
          )}
        </button>
      </div>

      <div>
        <p className={sectionCls}>Nutrition</p>
        <div className={cardCls}>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-xs font-extrabold text-black dark:text-zinc-50">Today&apos;s targets</p>
            <p className="text-[10px] text-zinc-500">
              {new Date(todayIso + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <MacroRing label="Calories" unit="" value={calories} target={dayTarget?.calories ?? null} />
            <MacroRing label="Protein" unit="g" value={protein} target={dayTarget?.protein ?? null} />
            <MacroRing label="Carbs" unit="g" value={carbs} target={dayTarget?.carbs ?? null} />
            <MacroRing label="Fats" unit="g" value={fat} target={dayTarget?.fat ?? null} />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('Nutrition')}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-accent-soft px-3.5 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-extrabold text-accent">
              <NotebookPen className="h-4 w-4" /> Log food diary
            </span>
            <ChevronRight className="h-4 w-4 text-accent" />
          </button>
        </div>
      </div>

      <div>
        <p className={sectionCls}>Training</p>
        <div className={`${cardCls} !p-0`}>
          <LinkRow
            icon={Dumbbell}
            title="This week's program"
            subtitle={program ? program.name : 'No program assigned yet'}
            onClick={() => onNavigate('Training', 'Workout')}
          />
        </div>
      </div>

      <div>
        <p className={sectionCls}>Accountability — today</p>
        <div className={cardCls}>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-extrabold text-black dark:text-zinc-50">Daily tracker</p>
            <button
              type="button"
              onClick={() => onNavigate('Accountability', 'Weekly Log')}
              className="rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold text-accent-foreground"
            >
              Log today
            </button>
          </div>
          <div className="flex gap-2">
            <TrackerStat label="Sleep" display={sleep != null ? `${sleep}h` : '—'} light={sleep != null ? trafficLight('sleep', sleep) : null} />
            <TrackerStat label="Steps" display={steps != null ? steps.toLocaleString() : '—'} light={steps != null ? trafficLight('steps', steps) : null} />
            <TrackerStat label="Water" display={water != null ? `${water}L` : '—'} light={water != null ? trafficLight('water', water) : null} />
          </div>
        </div>
      </div>

      <div>
        <p className={sectionCls}>Progress &amp; results</p>
        <div className={`${cardCls} !p-0`}>
          <LinkRow
            icon={LineChart}
            title="Body composition & photos"
            subtitle="Weight, measurements, progress photos & scans"
            onClick={() => onNavigate('Progress', 'Progress & Photos')}
          />
          <LinkRow
            icon={Trophy}
            title="Peak week scores"
            subtitle="Log your test results · Big Dog tracker"
            badge={tier === 'none' ? undefined : TIER_TITLE[tier].replace(' Big Dog', '')}
            onClick={() => onNavigate('Account Settings', 'Big Dog')}
          />
        </div>
      </div>
    </div>
  );
}
