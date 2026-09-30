'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Badge, Card, IconChip } from '@/app/_components/ui';
import { formatClassTime } from '@/lib/utils/dates';
import type { ScheduleOccurrence } from '@/lib/data/types';

// "Today's classes" for the coach dashboard: each session with how full it is, linking through
// to Attendance. "Today" is the coach's own calendar day (this renders in the browser).
export function TodaySessions({ occurrences }: { occurrences: ScheduleOccurrence[] }) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sessions = occurrences
    .filter((o) => o.date === today)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

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
              <li key={`${s.classId}|${s.date}`} className="flex items-center justify-between gap-3 py-2 text-sm">
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
    </Card>
  );
}
