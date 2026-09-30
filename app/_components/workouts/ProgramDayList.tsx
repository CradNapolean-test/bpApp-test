'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAY_SHORT } from '@/lib/utils/dates';
import { DefaultMuscleGroupIcon, MUSCLE_GROUP_ICONS } from './muscleGroups';
import type { ExerciseLibraryRow } from '@/lib/data/types';

export interface ProgramDaySummary {
  id: string;
  weekNum: number;
  dayLabel: string;
  phaseLabel: string | null;
  exerciseLibraryIds: (string | null)[];
  exerciseCount: number;
  done?: boolean;
  // Weekday the day is linked to (0 = Sunday .. 6 = Saturday); orders the list Monday-first.
  dayPosition?: number | null;
  // This is today's workout in the current week.
  isToday?: boolean;
  // Lifts in the day and how many have at least one set logged (shown as "3/11").
  liftCount?: number;
  loggedCount?: number;
  // The day's main lifts (first few names), shown under the title.
  highlights?: string[];
}

// Shared week-pill/day-row list used by both the per-client program view (WorkoutTab) and the
// coach's programme-template editor (ProgramTemplateManager) -- previously copy-pasted between
// the two, now written once so the visual treatment (week pills, icon chip, done indicator)
// only needs to change in one place. One active week shown at a time (pill selector), not a
// stacked accordion -- matches the mobile redesign's Wk 1-4 pill bar.
export function ProgramDayList({
  ownerId,
  days,
  library,
  showPhaseLabel,
  onOpenDay,
  renderDayControls,
  activeWeek: controlledActiveWeek,
  onChangeWeek,
  currentWeek,
}: {
  ownerId: string;
  days: ProgramDaySummary[];
  library: ExerciseLibraryRow[];
  showPhaseLabel: boolean;
  onOpenDay: (dayId: string) => void;
  renderDayControls?: (day: ProgramDaySummary) => React.ReactNode;
  // Week selection is uncontrolled by default (WeeklyLog/template preview don't need it from
  // outside). WorkoutTab passes both -- it needs to jump to a specific week when a classes
  // check-in focuses a day underneath a different one.
  activeWeek?: number;
  onChangeWeek?: (week: number) => void;
  // The programme's current week, marked with a dot on its pill.
  currentWeek?: number;
}) {
  const weekNums = Array.from(new Set(days.map((d) => d.weekNum))).sort((a, b) => a - b);
  const [internalActiveWeek, setInternalActiveWeek] = useState<number | null>(null);
  const activeWeek = controlledActiveWeek ?? internalActiveWeek ?? weekNums[0] ?? 1;
  function setActiveWeek(week: number) {
    if (onChangeWeek) onChangeWeek(week);
    else setInternalActiveWeek(week);
  }

  const libraryById = new Map(library.map((l) => [l.id, l]));
  function iconFor(day: ProgramDaySummary) {
    for (const id of day.exerciseLibraryIds) {
      const muscleGroup = id ? libraryById.get(id)?.muscle_group : null;
      if (muscleGroup && MUSCLE_GROUP_ICONS[muscleGroup]) return MUSCLE_GROUP_ICONS[muscleGroup];
    }
    return DefaultMuscleGroupIcon;
  }

  const activeIndex = weekNums.indexOf(activeWeek);
  // Monday-first by linked weekday; days with no weekday sort last, then by label.
  const weekdayRank = (p: number | null | undefined) => (p == null ? 9 : (p + 6) % 7);
  const days_ = [...days.filter((d) => d.weekNum === activeWeek)].sort(
    (a, b) => weekdayRank(a.dayPosition) - weekdayRank(b.dayPosition) || a.dayLabel.localeCompare(b.dayLabel)
  );

  if (weekNums.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous week"
          disabled={activeIndex <= 0}
          onClick={() => setActiveWeek(weekNums[activeIndex - 1])}
          className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekNums.map((week) => (
            <button
              key={`${ownerId}:${week}`}
              type="button"
              onClick={() => setActiveWeek(week)}
              className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                week === activeWeek
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-black/[.08] bg-card text-zinc-700 hover:bg-black/5 dark:border-white/[.12] dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              Week {week}
              {week === currentWeek && (
                <span
                  aria-label="Current week"
                  className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${week === activeWeek ? 'bg-accent-foreground' : 'bg-accent'}`}
                />
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next week"
          disabled={activeIndex >= weekNums.length - 1}
          onClick={() => setActiveWeek(weekNums[activeIndex + 1])}
          className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2.5">
        {days_.map((day) => {
          const Icon = iconFor(day);
          const weekday = day.dayPosition != null ? WEEKDAY_SHORT[day.dayPosition] : null;
          const lifts = day.liftCount ?? 0;
          const logged = day.loggedCount ?? 0;
          const allDone = lifts > 0 && logged >= lifts;
          return (
            <div
              key={day.id}
              className={`rounded-2xl border p-3 ${
                day.isToday ? 'border-accent/50 bg-accent-soft' : 'border-black/[.06] bg-card dark:border-white/10'
              }`}
            >
              <button type="button" onClick={() => onOpenDay(day.id)} className="flex w-full items-center gap-3 text-left">
                <span
                  className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${
                    day.isToday ? 'bg-accent text-accent-foreground' : 'bg-accent-soft text-accent'
                  }`}
                >
                  {weekday ? (
                    <span className="text-xs font-extrabold uppercase tracking-wide">{weekday}</span>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold text-black dark:text-zinc-50">
                    <span className="truncate">{day.dayLabel}</span>
                    {day.isToday && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">Today</span>
                    )}
                  </p>
                  {day.highlights && day.highlights.length > 0 && (
                    <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{day.highlights.join(' · ')}</p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {day.exerciseCount} exercise{day.exerciseCount === 1 ? '' : 's'}
                    {logged > 0 && !allDone && <span className="font-semibold text-accent"> · {logged}/{lifts} logged</span>}
                  </p>
                  {day.phaseLabel && showPhaseLabel && (
                    <span className="mt-0.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {day.phaseLabel}
                    </span>
                  )}
                </div>
                {allDone || (day.done && lifts === 0) ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
                )}
              </button>
              {renderDayControls && (
                <div className="mt-2 flex w-full shrink-0 items-center justify-end gap-2">{renderDayControls(day)}</div>
              )}
            </div>
          );
        })}
        {days_.length === 0 && <p className="mt-3 text-sm text-zinc-500">No days in this week yet.</p>}
      </div>
    </div>
  );
}
