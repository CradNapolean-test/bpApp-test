'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Badge, Card, IconChip } from '@/app/_components/ui';
import { formatClassTime } from '@/lib/utils/dates';
import type { ScheduleOccurrence } from '@/lib/data/types';

// "Today's classes" for the coach dashboard: each session with how full it is, linking through
// to Attendance. "Today" is the coach's own calendar day (this renders in the browser).
export function TodaySessions({ occurrences }: { occurrences: ScheduleOccurrence[] }) {
  const [showAll, setShowAll] = useState(false);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sessions = occurrences
    .filter((o) => o.date === today)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  // On a phone only what's still to come (three at most) is shown until expanded; a wide screen
  // always shows the whole day.
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const comingUp = sessions.filter((s) => (s.startTime ?? '') >= nowTime).slice(0, 3);
  const phoneVisible = new Set((showAll || comingUp.length === 0 ? sessions : comingUp).map((s) => `${s.classId}|${s.date}`));

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-black dark:text-zinc-50">Today&apos;s classes</h3>
        <Link href="/coach/classes?tab=attendance" className="flex items-center gap-0.5 text-xs font-semibold text-accent">
          Attendance <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {sessions.length === 0 ? (
        <div className="flex items-center gap-3 py-2 text-sm text-zinc-500">
          <IconChip icon={CalendarDays} tone="muted" size="sm" />
          No classes scheduled today.
        </div>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {sessions.map((s) => {
            const full = s.bookedCount >= s.capacity;
            return (
              <li
                key={`${s.classId}|${s.date}`}
                className={`items-center justify-between gap-3 py-2 text-sm ${phoneVisible.has(`${s.classId}|${s.date}`) ? 'flex' : 'hidden md:flex'}`}
              >
                <span className="font-semibold text-black dark:text-zinc-50">{s.startTime ? formatClassTime(s.startTime) : s.className}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-500">{s.className}</span>
                <Badge tone={full ? 'warning' : s.bookedCount === 0 ? 'muted' : 'accent'}>
                  {s.bookedCount}/{s.capacity}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      {sessions.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 w-full rounded-xl py-2 text-center text-sm font-semibold text-accent hover:bg-black/5 md:hidden dark:hover:bg-white/5"
        >
          {showAll ? 'Show less' : `All ${sessions.length} today`}
        </button>
      )}
    </Card>
  );
}
