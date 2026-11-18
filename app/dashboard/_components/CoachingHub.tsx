'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, Camera, ChevronRight, ClipboardList, Dumbbell, LineChart, ScanBarcode, Trophy } from 'lucide-react';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { enabledTrackers, toDisabledMetricSet } from '@/lib/checkinMetrics';
import type { CheckinMetric } from '@/lib/checkinMetrics';
import { Badge } from '@/app/_components/ui';
import { weeklyTarget } from '@/lib/calculations';
import { getLatestCoachMessage } from '@/lib/data/chat';
import { checkinToday } from '@/lib/memberHome';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { dayTargetFor } from '@/lib/utils/dayTarget';
import { NO_TARGETS_YET, PLAN_BEING_SET_UP, targetsHeldBack } from '@/lib/onboarding';
import { DEFAULT_TIMEZONE, formatLongDate, formatTime, todayIsoInTz } from '@/lib/utils/dates';
import { resolveActiveProgram, resolveProgramDayByPosition } from '@/lib/utils/checkin';
import { pickCurrentProgram } from '@/lib/utils/currentProgram';
import { memberProgrammeNotice, programmeEnd } from '@/lib/utils/programEnding';
import { dayHighlights } from '@/lib/workoutSections';
import { dayCaloriesOf } from '@/lib/utils/dailyLog';
import { trafficLight } from '@/lib/utils/accountability';
import type { TrafficLight } from '@/lib/utils/accountability';
import { bigDogCount, TIER_TITLE, tierForCount } from '@/lib/bigDog';
import type { BigDogResultRow, ClientProfileRow, DailyLogRow, WorkoutProgramRow } from '@/lib/data/types';
import type { Category, Screen } from './categories';
import { MemberHeader } from './MemberHeader';
import AnimatedContent from '@/app/_components/motion/AnimatedContent';
import CountUp from '@/app/_components/motion/CountUp';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import type { HeaderActions } from './MemberHeader';

// "My coaching" hub -- the destination of the Coach tab (the owner's pick from the November 2026 mock-ups): the coach and their latest
// message on a teal tile in the black header, then today's calories and macros, today's workout, today's check-in numbers, and a grid
// of tiles for progress, Big Dog, resources and forms.

const card = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
const LIGHT_TEXT: Record<TrafficLight, string> = { green: 'text-success', amber: 'text-warning', red: 'text-danger' };

function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className="text-base font-extrabold text-black dark:text-zinc-50">{title}</h2>
      {right}
    </div>
  );
}

function StatBox({ label, display, light }: { label: string; display: string; light?: TrafficLight | null }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-card-muted px-1 py-3 text-center">
      <p className={`truncate text-[17px] font-black leading-none ${light ? LIGHT_TEXT[light] : display === '—' ? 'text-zinc-400' : 'text-black dark:text-zinc-50'}`}>{display}</p>
      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}

function MacroBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1">
      {/* The numbers sit under the label: side by side, three of these do not fit a narrow phone and the bars stop lining up. */}
      <p className="text-[13px] font-bold leading-tight text-black dark:text-zinc-50">{label}</p>
      <p className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
        {Math.round(value)} / {Math.round(target)} g
      </p>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${Math.round(value)} of ${Math.round(target)} grams of ${label.toLowerCase()}`}>
        <div data-grow="bar" className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// How much of today's calories is eaten.
function CalorieRing({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, pct)) * c;
  return (
    <svg className="shrink-0" width="72" height="72" viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="9" className="stroke-black/10 dark:stroke-white/15" />
      {filled > 0 && (
        <circle data-grow="ring" data-circumference={c} cx="36" cy="36" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke="var(--accent)" strokeDasharray={`${filled} ${c}`} transform="rotate(-90 36 36)" />
      )}
    </svg>
  );
}

// One of the four tiles at the bottom of the hub.
function HubTile({ icon: Icon, title, subtitle, badge, onClick }: { icon: LucideIcon; title: string; subtitle: string; badge?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-[18px] border border-black/[.08] bg-card p-3 text-left transition-colors hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {badge}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight text-black dark:text-zinc-50">{title}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
      </span>
    </button>
  );
}

const blackBtn = 'flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1d1d1b] px-3 text-sm font-bold text-white dark:bg-zinc-100 dark:text-[#1d1d1b]';
const outlineBtn = 'flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-[1.5px] border-black/20 px-2 text-sm font-bold text-black hover:bg-black/5 dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5';

export function CoachingHub({
  clientId,
  profile,
  programWeek,
  weekLogs,
  programs,
  bigDogResults,
  unreadMessageCount,
  pendingForms,
  hiddenCategories,
  dailyCheckinHidden = false,
  disabledMetrics = [],
  onNavigate,
  onOpenWorkoutDay,
  onScanBarcode,
  coachName,
  header,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  programWeek: number;
  weekLogs: DailyLogRow[];
  programs: WorkoutProgramRow[];
  bigDogResults: BigDogResultRow[];
  unreadMessageCount: number;
  pendingForms: number;
  // Areas the member's plan (or coach) has switched off entirely -- their rows are hidden.
  hiddenCategories: Set<Category>;
  // The member's plan (or coach) has switched the daily check-in (Weekly Log) off.
  dailyCheckinHidden?: boolean;
  // Check-in measures switched off for this member.
  disabledMetrics?: string[];
  onNavigate: (category: Category, screen?: Screen) => void;
  // Opens a specific programme day in the Workout screen (today's workout from the Training card).
  onOpenWorkoutDay: (dayId: string) => void;
  // Opens the food diary with the barcode scanner already up.
  onScanBarcode?: () => void;
  // The coach's first name for the tile, when known, and the message bubble and bell in the header.
  coachName?: string | null;
  header?: HeaderActions;
}) {
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  const todayLog = weekLogs.find((l) => l.log_date === todayIso);

  // Today's own target (a calorie-cycling member's high day has the high one). This hub is the member's own: no target while
  // their plan waits for their coach (M8).
  const engineProfile = toMemberEngineProfile(profile, false);
  const dayTarget = dayTargetFor(engineProfile ? weeklyTarget(engineProfile, programWeek) : null, todayLog?.day_type);
  const held = targetsHeldBack(profile, false);

  const protein = todayLog?.protein ?? 0;
  const carbs = todayLog?.carbs ?? 0;
  const fat = todayLog?.fat ?? 0;
  // The day's calories include Quick Adds with no macros; the ring used to show 0 for a 300 kcal Quick Add (R11, LT1).
  const calories = todayLog ? dayCaloriesOf(todayLog) : 0;
  const caloriesLeft = dayTarget ? Math.round(dayTarget.calories - calories) : 0;
  const mode = profile?.nutrition_tracking_mode;

  // The programme being followed now, not the oldest one in the list (CH1): the list is oldest first, so a member on their third block
  // was told their first had finished.
  const program = pickCurrentProgram(programs, todayIso).current;
  // Today's workout: the active programme's day for today's weekday (if there is one).
  const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const activeBlock = resolveActiveProgram(programs, todayIso);
  const todaysDay = activeBlock ? resolveProgramDayByPosition(activeBlock.program, activeBlock.weekNum, todayDow) : null;
  // The day's Lift, not its warm-up ("SKI ERG · SA Banded Chest Press" on a bench day, TR7).
  const todaysLifts = todaysDay ? dayHighlights(todaysDay.workout_exercises) : [];
  // The last week, or the end with nothing next (D2): "Last week of this programme: your coach is setting up the next one".
  const programmeNotice = memberProgrammeNotice(programmeEnd(programs, todayIso), (iso) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  );
  // "Week 6 of 12": the programme's length is its highest week number.
  const totalWeeks = activeBlock ? Math.max(0, ...activeBlock.program.workout_program_days.map((d) => d.week_num)) : 0;
  const weekLabel = activeBlock ? `Week ${activeBlock.weekNum}${totalWeeks > 1 && totalWeeks >= activeBlock.weekNum ? ` of ${totalWeeks}` : ''}` : undefined;

  const sleep = todayLog?.sleep ?? null;
  const steps = todayLog?.steps ?? null;
  const water = todayLog?.water ?? null;
  const weight = todayLog?.bodyweight ?? null;
  const trackers = enabledTrackers(toDisabledMetricSet(disabledMetrics));
  const checkin = checkinToday(todayLog ? { sleep, steps, water, bodyweight: weight } : null, trackers);
  const anyIn = sleep != null || steps != null || water != null;

  const bdCount = bigDogCount(bigDogResults);
  const tier = tierForCount(bdCount);
  const show = (c: Category) => !hiddenCategories.has(c);
  const offMetrics = toDisabledMetricSet(disabledMetrics);
  const metricOn = (m: CheckinMetric) => !offMetrics.has(m);
  const coach = coachName?.trim() || null;

  // The coach's newest message, for the preview on the tile: read when this tab opens (one row). Today's shows its time, an older one
  // its day.
  const latest = useOnDemand(() => getLatestCoachMessage(clientId), clientId).data;
  const latestText = latest ? latest.text?.trim() || (latest.audio_path ? 'Voice note' : latest.image_path ? 'Photo' : '') : '';
  const dayOf = (value: Date | string) => formatLongDate(value, { timeZone: tz, weekday: false });
  const latestWhen = !latest ? '' : dayOf(latest.created_at) === dayOf(new Date()) ? formatTime(latest.created_at, tz) : formatLongDate(latest.created_at, { timeZone: tz, weekday: 'short' });

  // The calorie ring and the macro bars fill up from empty when the tab opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.2);

  // Training: what the card says, and where it goes.
  const training = todaysDay
    ? {
        title: "Today's workout",
        subtitle: todaysLifts.length > 0 ? todaysLifts.join(' · ') : `${todaysDay.workout_exercises.length} exercises`,
        onClick: () => onOpenWorkoutDay(todaysDay.id),
      }
    : {
        title: activeBlock ? 'Rest day · no workout today' : program ? 'Your programme' : "This week's program",
        subtitle: activeBlock
          ? `${program?.name ?? 'Programme'} · tap to see the week`
          : program
            ? !program.start_date
              ? `${program.name} · no start date yet — ask your coach`
              : program.start_date > todayIso
                ? `${program.name} · starts ${new Date(program.start_date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
                : (programmeNotice?.text ?? `${program.name} · this programme has finished`)
            : 'No program assigned yet',
        onClick: () => onNavigate('Training', 'Workout'),
      };

  return (
    <div ref={screen} className="space-y-5">
      <MemberHeader eyebrow={weekLabel} title="My coaching" actions={header}>
        {/* Near-black on the teal in both themes: white on this teal is too faint to read. */}
        <section aria-label="Your coach" className="space-y-3 rounded-[20px] bg-accent p-4 text-[#041f1f]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1d1d1b] text-[17px] font-extrabold text-[#5fd6d6]" aria-hidden>
              {(coach ?? 'C')[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black leading-tight">{coach ? `${coach}, your coach` : 'Your coach'}</p>
              <p className="text-[13px] font-medium">Chat, voice notes and photos</p>
            </div>
            {unreadMessageCount > 0 && (
              <span className="flex h-6 shrink-0 items-center rounded-full bg-[#1d1d1b] px-2.5 text-xs font-extrabold text-white">{unreadMessageCount} new</span>
            )}
          </div>
          {latestText && (
            <p className="line-clamp-3 rounded-[14px] bg-[#041f1f]/10 px-3 py-2.5 text-sm font-medium leading-snug">
              {latestText} <span className="whitespace-nowrap font-bold">{latestWhen}</span>
            </p>
          )}
          <button type="button" onClick={() => onNavigate('Messages')} className="h-11 w-full rounded-xl bg-[#1d1d1b] text-sm font-bold text-white">
            {coach ? `Message ${coach}` : 'Message your coach'}
          </button>
        </section>
      </MemberHeader>

      {/* Under the header, each section rises into place in turn when the tab opens. */}
      <AnimatedContent className="space-y-5" distance={18} duration={0.5} stagger={0.06} delay={0.05}>
      {show('Nutrition') && (
        <section className="space-y-2.5">
          <SectionHead title="Nutrition" right={<span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{mode === 'photo_diary' ? 'Photo diary' : "Today's targets"}</span>} />
          {mode === 'photo_diary' ? (
            <div className={`${card} space-y-3 p-4`}>
              <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">Photograph your meals and your coach looks through them.</p>
              <button type="button" onClick={() => onNavigate('Nutrition')} className={`${blackBtn} w-full flex-none`}>
                <Camera className="h-4 w-4" /> Add a meal photo
              </button>
            </div>
          ) : (
            <div className={`${card} space-y-3.5 p-4`}>
              {dayTarget ? (
                <>
                  <div className="flex items-center gap-3.5">
                    <CalorieRing pct={calories / dayTarget.calories} />
                    <div className="min-w-0">
                      <p className={`text-[15px] font-bold ${caloriesLeft < 0 ? 'text-warning' : 'text-black dark:text-zinc-50'}`}>
                        <CountUp to={Math.abs(caloriesLeft)} className="text-[28px] font-black leading-none" delay={0.2} /> kcal {caloriesLeft < 0 ? 'over' : 'left'}
                      </p>
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                        {Math.round(calories).toLocaleString('en-GB')} of {Math.round(dayTarget.calories).toLocaleString('en-GB')} eaten
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <MacroBar label="Protein" value={protein} target={dayTarget.protein} />
                    <MacroBar label="Carbs" value={carbs} target={dayTarget.carbs} />
                    <MacroBar label="Fat" value={fat} target={dayTarget.fat} />
                  </div>
                </>
              ) : (
                <p className="text-sm font-semibold leading-snug text-zinc-600 dark:text-zinc-400">
                  {held ? `${PLAN_BEING_SET_UP}. Your targets will appear here once they have been checked.` : NO_TARGETS_YET}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => onNavigate('Nutrition')} className={blackBtn}>
                  Log food
                </button>
                {onScanBarcode && mode !== 'manual_import' && (
                  <button type="button" onClick={onScanBarcode} className={outlineBtn}>
                    <ScanBarcode className="h-4 w-4 shrink-0" /> Scan a barcode
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {show('Training') && (
        <section className="space-y-2.5">
          <SectionHead title="Training" />
          <button type="button" onClick={training.onClick} className={`${card} flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d1d1b] text-[#5fd6d6] dark:bg-white/10">
              <Dumbbell className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-black dark:text-zinc-50">{training.title}</span>
              <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{training.subtitle}</span>
            </span>
            {activeBlock && <span className="flex h-6 shrink-0 items-center rounded-full bg-black/[.06] px-2.5 text-xs font-extrabold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">Week {activeBlock.weekNum}</span>}
            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-zinc-400" />
          </button>
          {programmeNotice?.stage === 'last_week' && <p className="px-1 text-xs font-semibold text-accent-strong">{programmeNotice.text}</p>}
        </section>
      )}

      {show('Accountability') && !dailyCheckinHidden && trackers.length > 0 && (
        <section className="space-y-2.5">
          <SectionHead
            title="Daily check-in"
            right={
              <button type="button" onClick={() => onNavigate('Accountability', 'Weekly Log')} className="min-h-9 text-[13px] font-bold text-accent-strong">
                {checkin.done ? 'Edit' : 'Log today'}
              </button>
            }
          />
          <div className={`${card} space-y-3 p-3.5`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-black dark:text-zinc-50">Today</p>
              <span
                className={`flex h-6 items-center rounded-full px-2.5 text-xs font-extrabold ${
                  checkin.done ? 'bg-accent-soft text-accent-strong' : 'bg-black/[.06] text-zinc-700 dark:bg-white/10 dark:text-zinc-200'
                }`}
              >
                {checkin.done ? 'Done for today' : anyIn ? checkin.detail : 'Not logged yet'}
              </span>
            </div>
            <div className="flex gap-2">
              <StatBox label="kg" display={weight != null ? String(weight) : '—'} />
              {metricOn('sleep') && <StatBox label="Sleep" display={sleep != null ? `${sleep}h` : '—'} light={sleep != null ? trafficLight('sleep', sleep) : null} />}
              {metricOn('steps') && <StatBox label="Steps" display={steps != null ? steps.toLocaleString() : '—'} light={steps != null ? trafficLight('steps', steps) : null} />}
              {metricOn('water') && <StatBox label="Water" display={water != null ? `${water}L` : '—'} light={water != null ? trafficLight('water', water) : null} />}
            </div>
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <SectionHead title="Progress and learning" />
        <div className="grid grid-cols-2 gap-2.5">
          {show('Progress') && (
            <HubTile icon={LineChart} title="Progress and photos" subtitle="Weight, measurements, scans" onClick={() => onNavigate('Progress', 'Progress & Photos')} />
          )}
          <HubTile
            icon={Trophy}
            title="Big Dog standards"
            subtitle="Peak week scores"
            badge={tier === 'none' ? undefined : <Badge>{TIER_TITLE[tier].replace(' Big Dog', '')}</Badge>}
            onClick={() => onNavigate('Account Settings', 'Big Dog')}
          />
          {show('Learn') && <HubTile icon={BookOpen} title="Resources" subtitle="Video library" onClick={() => onNavigate('Learn', 'Education')} />}
          {show('Accountability') && (
            <HubTile
              icon={ClipboardList}
              title="Forms"
              subtitle="From your coach"
              badge={pendingForms > 0 ? <Badge tone="warning">{pendingForms} to do</Badge> : undefined}
              onClick={() => onNavigate('Accountability', 'Forms')}
            />
          )}
        </div>
      </section>
      </AnimatedContent>
    </div>
  );
}
