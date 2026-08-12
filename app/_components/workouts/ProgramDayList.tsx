'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
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
// the two, now written once so the visual treatment (icon chip, done indicator) only needs to
// change in one place.
export function ProgramDayList({
  ownerId,
  days,
  library,
  showPhaseLabel,
  onOpenDay,
  renderDayControls,
  expandedWeeks: controlledExpandedWeeks,
  onToggleWeek,
}: {
  ownerId: string;
  days: ProgramDaySummary[];
  library: ExerciseLibraryRow[];
  showPhaseLabel: boolean;
  onOpenDay: (dayId: string) => void;
  renderDayControls?: (day: ProgramDaySummary) => React.ReactNode;
  // Week-expand state is uncontrolled by default (WeeklyLog/template preview don't need it
  // from outside). WorkoutTab passes both -- it needs to force-expand a specific week when a
  // classes check-in focuses a day underneath a collapsed one.
  expandedWeeks?: Record<string, boolean>;
  onToggleWeek?: (weekKey: string) => void;
}) {
  const [internalExpandedWeeks, setInternalExpandedWeeks] = useState<Record<string, boolean>>({});
  const expandedWeeks = controlledExpandedWeeks ?? internalExpandedWeeks;
  function toggleWeek(weekKey: string) {
    if (onToggleWeek) onToggleWeek(weekKey);
    else setInternalExpandedWeeks((s) => ({ ...s, [weekKey]: !s[weekKey] }));
  }

  const libraryById = new Map(library.map((l) => [l.id, l]));
  function iconFor(day: ProgramDaySummary) {
    for (const id of day.exerciseLibraryIds) {
      const muscleGroup = id ? libraryById.get(id)?.muscle_group : null;
      if (muscleGroup && MUSCLE_GROUP_ICONS[muscleGroup]) return MUSCLE_GROUP_ICONS[muscleGroup];
    }
    return DefaultMuscleGroupIcon;
  }

  const byWeek = days.reduce<Record<number, ProgramDaySummary[]>>((acc, day) => {
    (acc[day.weekNum] ??= []).push(day);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(byWeek)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([weekNumStr, weekDays]) => {
          const weekNum = Number(weekNumStr);
          const weekKey = `${ownerId}:${weekNum}`;
          const weekExpanded = expandedWeeks[weekKey] ?? false;
          const sortedDays = [...weekDays].sort((a, b) => a.dayLabel.localeCompare(b.dayLabel));
          return (
            <div key={weekKey} className="mt-3 rounded-xl border border-black/[.05] p-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => toggleWeek(weekKey)}
                className="flex w-full items-center gap-1.5 text-left"
              >
                {weekExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                )}
                <p className="text-sm font-semibold">Week {weekNum}</p>
                {!weekExpanded && (
                  <p className="text-xs text-zinc-500">
                    · {sortedDays.length} day{sortedDays.length === 1 ? '' : 's'}
                  </p>
                )}
              </button>

              {weekExpanded &&
                sortedDays.map((day) => {
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
                          <p className="text-sm font-medium">{day.dayLabel}</p>
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
            </div>
          );
        })}
    </>
  );
}
