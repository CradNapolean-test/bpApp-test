'use client';

import Link from 'next/link';
import { CalendarCheck, CalendarDays, ChevronRight, MessageSquare, Users } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { Card, SectionLabel } from '@/app/_components/ui';
import { formatClassTime } from '@/lib/utils/dates';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type { ScheduleOccurrence } from '@/lib/data/types';

// The coach's "start of the day" block: what's on now/next, how full today is, and everything that
// needs a decision (sessions to mark, unread messages, clients who've gone quiet). Replaces the old
// stat tiles + flat list of every class.

const SESSION_MIN = 45;
const FLAG_PREVIEW = 3;

const toMin = (t: string | null) => {
  const [h, m] = (t ?? '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
};

function localTodayIso(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function AttentionRow({
  href,
  icon: Icon,
  title,
  hint,
  children,
}: {
  href: string;
  icon?: typeof CalendarCheck;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 py-2.5">
      {children ??
        (Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Icon className="h-4 w-4" />
          </span>
        ))}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{title}</span>
        {hint && <span className="block truncate text-xs text-zinc-500">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
    </Link>
  );
}

export function TodayOverview({
  occurrences,
  unreadCount,
  flagged,
  clientCount,
}: {
  occurrences: ScheduleOccurrence[];
  unreadCount: number;
  flagged: ClientHealthStatus[];
  clientCount: number;
}) {
  const now = new Date();
  const todayIso = localTodayIso(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const today = occurrences.filter((o) => o.date === todayIso).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const inProgress = today.find((s) => toMin(s.startTime) <= nowMin && nowMin < toMin(s.startTime) + SESSION_MIN);
  const upNext = inProgress ?? today.find((s) => toMin(s.startTime) > nowMin) ?? null;
  const booked = today.reduce((n, s) => n + s.bookedCount, 0);
  const spots = today.reduce((n, s) => n + s.capacity, 0);

  const toMark = occurrences.filter((o) => (o.unmarkedCount ?? 0) > 0);
  const toMarkPeople = toMark.reduce((n, o) => n + (o.unmarkedCount ?? 0), 0);
  const worst = [...flagged].sort((a, b) => (a.status === b.status ? b.daysSinceActive - a.daysSinceActive : a.status === 'red' ? -1 : 1));
  const attentionCount = (toMark.length > 0 ? 1 : 0) + (unreadCount > 0 ? 1 : 0) + worst.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card tone="accent" className="!p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <CalendarDays className="h-3.5 w-3.5" /> Booked today
          </p>
          <p className="text-2xl font-extrabold text-black dark:text-zinc-50">
            {booked}
            <span className="text-sm font-semibold text-zinc-500"> / {spots}</span>
          </p>
        </Card>
        <Link href="/coach/clients">
          <Card className="!p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Users className="h-3.5 w-3.5" /> Clients
            </p>
            <p className="text-2xl font-extrabold text-black dark:text-zinc-50">{clientCount}</p>
          </Card>
        </Link>
      </div>

      <div>
        <SectionLabel>{inProgress ? 'Happening now' : upNext ? 'Up next' : "Today's classes"}</SectionLabel>
        {today.length === 0 ? (
          <Card className="text-sm text-zinc-500">No classes scheduled today.</Card>
        ) : (
          <div className="space-y-2.5">
            {upNext ? (
              <Link
                href="/coach/classes?tab=sessions"
                className="flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4"
              >
                <span className="min-w-0">
                  <span className="block text-2xl font-black leading-tight text-black dark:text-zinc-50">{formatClassTime(upNext.startTime)}</span>
                  <span className="block truncate text-sm text-zinc-500">{upNext.className}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-2xl font-black text-accent">
                    {upNext.bookedCount}
                    <span className="text-sm font-semibold text-zinc-500"> / {upNext.capacity}</span>
                  </span>
                  <span className="text-xs font-bold text-accent">Open roster →</span>
                </span>
              </Link>
            ) : (
              <Card className="text-sm text-zinc-500">All of today&apos;s classes are done.</Card>
            )}

            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {today.map((s) => {
                const isNext = upNext && s.classId === upNext.classId && s.date === upNext.date;
                const past = toMin(s.startTime) + SESSION_MIN <= nowMin;
                return (
                  <Link
                    key={`${s.classId}|${s.date}`}
                    href="/coach/classes?tab=sessions"
                    className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded-2xl border py-2 ${
                      isNext
                        ? 'border-accent bg-accent text-accent-foreground'
                        : past
                          ? 'border-transparent text-zinc-400 dark:text-zinc-600'
                          : 'border-black/[.06] bg-card text-black dark:border-white/10 dark:text-zinc-100'
                    }`}
                  >
                    <span className="text-sm font-extrabold">{formatClassTime(s.startTime)}</span>
                    <span className={`text-xs font-semibold ${isNext ? 'opacity-90' : 'text-zinc-500'}`}>
                      {s.bookedCount}/{s.capacity}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Needs your attention{attentionCount > 0 ? ` · ${attentionCount}` : ''}</SectionLabel>
        <Card className="!py-1">
          {attentionCount === 0 ? (
            <p className="py-3 text-sm text-zinc-500">All clear — nothing needs you right now. ✓</p>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {toMark.length > 0 && (
                <AttentionRow
                  href="/coach/classes?tab=sessions"
                  icon={CalendarCheck}
                  title={`${toMark.length} past session${toMark.length === 1 ? '' : 's'} to mark`}
                  hint={`${toMarkPeople} booking${toMarkPeople === 1 ? '' : 's'} not marked attended or no-show`}
                />
              )}
              {unreadCount > 0 && (
                <AttentionRow
                  href="/coach/messages"
                  icon={MessageSquare}
                  title={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
                  hint="Open Messages to reply"
                />
              )}
              {worst.slice(0, FLAG_PREVIEW).map((c) => (
                <AttentionRow
                  key={c.clientId}
                  href={`/coach/clients/${c.clientId}`}
                  title={c.name}
                  hint={c.lastActiveDate ? `No log in ${c.daysSinceActive} days` : 'Never logged'}
                >
                  <Avatar name={c.name} size="md" />
                </AttentionRow>
              ))}
              {worst.length > FLAG_PREVIEW && (
                <AttentionRow href="/coach/clients" title={`+${worst.length - FLAG_PREVIEW} more clients gone quiet`} hint="See the full list" />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
