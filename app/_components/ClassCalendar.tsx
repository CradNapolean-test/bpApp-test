'use client';

import { useMemo, useState } from 'react';
import type { ScheduleOccurrence } from '@/lib/data/types';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ClassCalendar({
  occurrences,
  selectedDate,
  onSelectDate,
}: {
  occurrences: ScheduleOccurrence[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of occurrences) map.set(o.date, (map.get(o.date) ?? 0) + 1);
    return map;
  }, [occurrences]);

  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: { date: string | null; day: number | null }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: toIso(viewYear, viewMonth, d), day: d });

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
        >
          &larr;
        </button>
        <p className="text-sm font-semibold text-black dark:text-zinc-50">
          {firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
        >
          &rarr;
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={i} />;
          const count = countByDate.get(cell.date) ?? 0;
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === todayIso;
          return (
            <button
              key={cell.date}
              type="button"
              disabled={count === 0}
              onClick={() => onSelectDate(cell.date!)}
              className={`relative rounded-md py-2 text-sm transition-colors ${
                count === 0
                  ? 'text-zinc-300 dark:text-zinc-700'
                  : 'text-black hover:bg-black/5 dark:text-zinc-50 dark:hover:bg-white/5'
              } ${isSelected ? 'bg-foreground text-background hover:bg-foreground' : ''} ${
                isToday && !isSelected ? 'font-semibold underline' : ''
              }`}
            >
              {cell.day}
              {count > 0 && (
                <span
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected ? 'bg-background' : 'bg-foreground'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
