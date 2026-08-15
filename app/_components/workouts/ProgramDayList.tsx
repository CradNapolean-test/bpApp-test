'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const days_ = [...days.filter((d) => d.weekNum === activeWeek)].sort((a, b) => a.dayLabel.localeCompare(b.dayLabel));

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
        <div className="flex flex-1 gap-2 overflow-x-auto">
          {weekNums.map((week) => (
            <button
              key={`${ownerId}:${week}`}
              type="button"
              onClick={() => setActiveWeek(week)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                week === activeWeek
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-black/[.08] bg-[var(--background)] text-zinc-700 hover:bg-black/5 dark:border-white/[.12] dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              Wk {week}
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

      <div className="space-y-3">
        {days_.map((day) => {
          const Icon = iconFor(day);
          return (
            <div
              key={day.id}
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[.05] p-3 dark:border-white/5"
            >
              <button
                type="button"
                onClick={() => onOpenDay(day.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-black dark:text-zinc-50">{day.dayLabel}</p>
                  <p className="text-xs text-zinc-500">
                    {day.exerciseCount} exercise{day.exerciseCount === 1 ? '' : 's'}
                  </p>
                  {day.phaseLabel && showPhaseLabel && (
                    <span className="mt-0.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                      {day.phaseLabel}
                    </span>
                  )}
                </div>
                {day.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
                )}
              </button>
              {renderDayControls && (
                <div className="flex shrink-0 items-center gap-2">{renderDayControls(day)}</div>
              )}
            </div>
          );
        })}
        {days_.length === 0 && <p className="mt-3 text-sm text-zinc-500">No days in this week yet.</p>}
      </div>
    </div>
  );
}
