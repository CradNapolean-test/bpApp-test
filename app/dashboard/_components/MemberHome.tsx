'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CalendarClock, Check, ChevronRight, Flame, Gift, HelpCircle, PlayCircle, Star, Trophy, Users } from 'lucide-react';
import type { ClubProgress } from '@/lib/clubs';
import type { HomeWeekDay } from '@/lib/memberHome';
import type { FoodLeft, StripText } from '@/lib/todayStrip';
import { ClubBar } from './ClubBar';
import ClickSpark from '@/app/_components/motion/ClickSpark';
import type { ClickSparkHandle } from '@/app/_components/motion/ClickSpark';
import CountUp from '@/app/_components/motion/CountUp';
import { gsap, prefersReducedMotion, useGSAP } from '@/app/_components/motion/gsap';
import { MemberHeader } from './MemberHeader';
import type { HeaderActions } from './MemberHeader';
import type { Category, Screen } from './categories';

// Member Home, "Your day" (the owner's pick from the November 2026 mock-ups). A black header holds the greeting, the week and the next
// session; under it one card says what is left to do today, then the session clubs and the ways into the rest of the app. Messages and
// notifications are the two round buttons at the top right.
// Everything here is layout: the numbers come from TodayTab, which works them out the same way it always has.

const card = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
// On the teal tile and the teal chips the text is near-black in both themes: white on this teal is too faint to read.
const onTeal = 'text-[#041f1f]';

// ---------------------------------------------------------------------------------------------------------------------
// Header

function WeekStrip({ days, caption }: { days: HomeWeekDay[]; caption: string }) {
  const strip = useRef<HTMLOListElement>(null);
  // The day chips pop in left to right when Home opens.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from('[data-chip]', { scale: 0.6, opacity: 0, duration: 0.45, ease: 'back.out(2)', stagger: 0.04, delay: 0.1, clearProps: 'transform,opacity' });
    },
    { scope: strip }
  );
  return (
    <div className="space-y-2">
      <ol ref={strip} className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <li key={d.iso} className="flex flex-col items-center gap-1.5">
            <span className={`text-[11px] ${d.isToday ? 'font-bold text-zinc-100' : 'font-semibold text-zinc-400'}`} aria-hidden>
              {d.label}
            </span>
            <span
              role="img"
              aria-label={d.description}
              data-chip
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                d.state === 'trained'
                  ? `bg-accent ${onTeal}`
                  : d.state === 'today'
                    ? 'bg-zinc-100 font-extrabold text-[#1d1d1b]'
                    : d.state === 'booked'
                      ? 'border-2 border-accent font-bold text-[#5fd6d6]'
                      : 'bg-white/[.07] font-semibold text-zinc-400'
              }`}
            >
              {d.state === 'trained' ? <Check className="h-4 w-4" strokeWidth={3} /> : d.dayNum}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-400">{caption}</p>
    </div>
  );
}

export function HomeHeader({
  dateLabel,
  greeting,
  plan,
  onOpenPlan,
  week,
  actions,
  children,
}: {
  dateLabel: string;
  greeting: string;
  // A plan with a set length (the 6 Week Challenge): "Week 5 of 6 · ends 14 Nov", opening Credits & membership.
  plan?: { name: string; label: string } | null;
  onOpenPlan?: () => void;
  week: { days: HomeWeekDay[]; caption: string };
  actions?: HeaderActions;
  // The next-session tile.
  children: ReactNode;
}) {
  return (
    <MemberHeader eyebrow={dateLabel} title={greeting} actions={actions} large>
      {plan && (
        <button
          type="button"
          onClick={onOpenPlan}
          disabled={!onOpenPlan}
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-left text-xs font-bold text-[#5fd6d6]"
        >
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {plan.name} · {plan.label}
          </span>
        </button>
      )}
      <WeekStrip days={week.days} caption={week.caption} />
      {children}
    </MemberHeader>
  );
}

// The next booked session, on a solid teal tile. `status` is the check-in line or button for a session that is today.
export function NextSessionTile({
  when,
  name,
  status,
  primary,
  secondary,
}: {
  when: string;
  name: string;
  status?: ReactNode;
  primary: { label: string; onClick?: () => void };
  secondary?: { label: string; onClick?: () => void } | null;
}) {
  return (
    <section aria-label="Your next session" className={`space-y-3 rounded-[20px] bg-accent p-4 ${onTeal}`}>
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em]">{when}</p>
        <p className="mt-1 text-[26px] font-black leading-tight tracking-tight">{name}</p>
      </div>
      {status}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={primary.onClick}
          className="h-11 min-w-0 flex-1 rounded-xl bg-[#1d1d1b] px-3 text-sm font-bold text-white"
        >
          {primary.label}
        </button>
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            className={`h-11 shrink-0 rounded-xl border-[1.5px] border-[#041f1f]/55 px-3.5 text-sm font-bold ${onTeal}`}
          >
            {secondary.label}
          </button>
        )}
      </div>
    </section>
  );
}

// Nothing booked: the tile turns into a dashed outline with one way out, to the booking screen.
export function NoSessionTile({ credits, onBook }: { credits: number; onBook?: () => void }) {
  return (
    <section aria-label="Your next session" className="space-y-3 rounded-[20px] border-[1.5px] border-dashed border-white/30 bg-white/[.06] p-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-400">Next session</p>
        <p className="mt-1 text-[26px] font-black leading-tight tracking-tight">No class booked</p>
        <p className="mt-1 text-sm leading-snug text-zinc-300">
          {credits > 0 ? `You have ${credits} credit${credits === 1 ? '' : 's'}. ` : ''}Pick a class to get your next session in.
        </p>
      </div>
      <button type="button" onClick={onBook} className={`h-11 w-full rounded-xl bg-accent text-sm font-extrabold ${onTeal}`}>
        Book now
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Your day

const done = (
  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent ${onTeal}`}>
    <Check className="h-4 w-4" strokeWidth={3} />
  </span>
);
const toDo = <span className="h-9 w-9 shrink-0 rounded-full border-2 border-dashed border-zinc-400 dark:border-zinc-500" />;
const actionPill = 'flex h-11 shrink-0 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent-strong';

// A small ring: how much of today's calories is eaten.
function FoodRing({ pct }: { pct: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, pct)) * c;
  return (
    <svg className="shrink-0" width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="5" className="stroke-black/10 dark:stroke-white/15" />
      {/* Nothing eaten yet: no arc at all (a rounded line of no length still draws a dot). */}
      {filled > 0 && (
        <circle data-grow="ring" data-circumference={c} cx="18" cy="18" r={r} fill="none" strokeWidth="5" strokeLinecap="round" stroke="var(--accent)" strokeDasharray={`${filled} ${c}`} transform="rotate(-90 18 18)" />
      )}
    </svg>
  );
}

function DayRow({
  lead,
  title,
  detail,
  warn,
  action,
  onClick,
  first,
}: {
  lead: ReactNode;
  title: string;
  detail: string;
  warn?: boolean;
  // The word on the button at the right ("Log"); without one the row shows an arrow.
  action?: string;
  onClick: () => void;
  first: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03] ${
        first ? '' : 'border-t border-black/[.07] dark:border-white/10'
      }`}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-black dark:text-zinc-50">{title}</span>
        <span className={`block text-[13px] leading-snug ${warn ? 'font-semibold text-warning' : 'text-zinc-500 dark:text-zinc-400'}`}>{detail}</span>
      </span>
      {action ? <span className={actionPill}>{action}</span> : <ChevronRight className="h-[18px] w-[18px] shrink-0 text-zinc-400" />}
    </button>
  );
}

function foodDetail(left: FoodLeft, eaten: number, target: number | null): { detail: string; warn?: boolean; action: string } {
  const n = (v: number) => Math.round(v).toLocaleString('en-GB');
  switch (left.kind) {
    case 'photo_diary':
      return { detail: 'Photo diary. Add a photo of each meal.', action: 'Add' };
    case 'held':
      return { detail: 'Your plan is being set up. Targets show once your coach has checked it.', action: 'Open' };
    case 'no_target':
      return { detail: 'No targets yet. Open your food diary.', action: 'Open' };
    case 'numbers': {
      const protein = left.proteinLeft > 0 ? `${left.proteinLeft} g protein to go.` : 'Protein target hit.';
      if (left.caloriesLeft < 0) return { detail: `${n(Math.abs(left.caloriesLeft))} kcal over today. ${protein}`, warn: true, action: 'Log' };
      return { detail: `${n(eaten)} of ${n(target ?? 0)} kcal. ${protein}`, action: 'Log' };
    }
  }
}

export interface DayCheckin {
  done: boolean;
  detail: string;
  onOpen: () => void;
}
export interface DayFood {
  left: FoodLeft;
  eaten: number;
  target: number | null;
  onOpen: () => void;
}
export interface DayTraining {
  done: boolean;
  // Counts towards "x of y done": a rest day or a finished programme does not.
  counts: boolean;
  text: Pick<StripText, 'title' | 'detail'>;
  onOpen: () => void;
}

export function YourDay({
  checkin,
  food,
  training,
  streak,
  onOpenStreak,
}: {
  // Each is null when that part of the app is switched off for the member, or there is nothing to show for it today.
  checkin: DayCheckin | null;
  food: DayFood | null;
  training: DayTraining | null;
  // Days in a row, for the plans that show a streak.
  streak?: number | null;
  onOpenStreak?: () => void;
}) {
  // Only the things that are either done or not: food is a running total, so it is left out of the count.
  const counted = [checkin, training && training.counts ? training : null].filter((x): x is DayCheckin | DayTraining => x != null);
  const doneCount = counted.filter((x) => x.done).length;
  const allDone = counted.length > 0 && doneCount === counted.length;

  // The first time everything is done on a day, a burst of teal sparks over "x of y done" (once a day on this device). It waits for the
  // screen's own entrance to finish.
  const sparks = useRef<ClickSparkHandle>(null);
  const spot = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!allDone) return;
    const key = `bp-your-day-done-${new Date().toDateString()}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    // The day is marked as celebrated only when the sparks go off, so an effect that is set up twice (React does that in development, and
    // a re-render can) still celebrates once.
    const timer = window.setTimeout(() => {
      const box = root.current?.getBoundingClientRect();
      const at = spot.current?.getBoundingClientRect();
      if (!box || !at) return;
      sparks.current?.spark(at.left - box.left + at.width / 2, at.top - box.top + at.height / 2);
      try {
        localStorage.setItem(key, '1');
      } catch {
        // Private browsing: it may celebrate again next time, which is harmless.
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [allDone]);

  if (!checkin && !food && !training) return null;
  const rows: Omit<Parameters<typeof DayRow>[0], 'first'>[] = [];
  if (checkin) {
    rows.push({ lead: checkin.done ? done : toDo, title: 'Daily check-in', detail: checkin.detail, action: checkin.done ? undefined : 'Log', onClick: checkin.onOpen });
  }
  if (food) {
    const fd = foodDetail(food.left, food.eaten, food.target);
    const ring = food.left.kind === 'numbers' && food.target ? <FoodRing pct={food.eaten / food.target} /> : toDo;
    rows.push({ lead: ring, title: 'Food', detail: fd.detail, warn: fd.warn, action: fd.action, onClick: food.onOpen });
  }
  if (training) {
    const detail = [training.text.title, training.text.detail].filter(Boolean).join(' · ');
    rows.push({ lead: training.done ? done : toDo, title: 'Training', detail, onClick: training.onOpen });
  }
  return (
    <ClickSpark ref={sparks} clickToSpark={false} sparkColor={['#19adb1', '#5fd6d6', '#f59e0b']} sparkCount={12} sparkRadius={42} sparkSize={12} shape="star" duration={700}>
    <section ref={root} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-base font-extrabold text-black dark:text-zinc-50">Your day</h2>
        <div className="flex items-center gap-2">
          {streak != null && streak > 0 && (
            <button
              type="button"
              onClick={onOpenStreak}
              className="flex min-h-9 items-center gap-1 rounded-full bg-black/5 px-2.5 text-xs font-bold text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
            >
              <Flame className="h-3.5 w-3.5 text-warning" />
              {streak} day{streak === 1 ? '' : 's'} in a row
            </button>
          )}
          {counted.length > 0 && (
            <span ref={spot} className={`text-[13px] font-semibold ${allDone ? 'text-accent-strong' : 'text-zinc-500 dark:text-zinc-400'}`}>
              {allDone ? 'All done today' : `${doneCount} of ${counted.length} done`}
            </span>
          )}
        </div>
      </div>
      <div className={`${card} overflow-hidden`}>
        {rows.map((r, i) => (
          <DayRow key={r.title} {...r} first={i === 0} />
        ))}
      </div>
    </section>
    </ClickSpark>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Clubs, explore

export function ClubCard({ sessions, club, nextReward, onOpen }: { sessions: number; club: ClubProgress; nextReward?: string | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`${card} block w-full space-y-2.5 px-4 py-3.5 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold text-black dark:text-zinc-50">
          <CountUp to={sessions} className="text-[22px] font-black" delay={0.2} /> session{sessions === 1 ? '' : 's'}
        </span>
        <span className="text-[13px] font-semibold text-accent-strong">
          {club.toGo} to the {club.next} club
        </span>
      </span>
      <ClubBar progress={club} />
      {(club.earned.length > 0 || nextReward) && (
        <span className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{club.earned.length > 0 ? `Earned: ${club.earned.map((n) => `${n} club`).join(', ')}` : ''}</span>
          {nextReward && <span className="truncate">{nextReward}</span>}
        </span>
      )}
    </button>
  );
}

function ExploreTile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-black/[.08] bg-card px-1 text-xs font-bold text-black transition-colors hover:bg-black/[.02] dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/[.03]"
    >
      <Icon className="h-5 w-5 text-accent-strong" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

export function ExploreTiles({ onNavigate, showReferral = true }: { onNavigate: (category: Category, screen?: Screen) => void; showReferral?: boolean }) {
  return (
    <nav aria-label="Explore" className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
      <ExploreTile icon={PlayCircle} label="Resources" onClick={() => onNavigate('Learn', 'Education')} />
      <ExploreTile icon={Trophy} label="Events" onClick={() => onNavigate('Community', 'Events')} />
      <ExploreTile icon={Gift} label="Rewards" onClick={() => onNavigate('Community', 'Rewards')} />
      {showReferral && <ExploreTile icon={Users} label="Refer" onClick={() => onNavigate('Community', 'Refer a Friend')} />}
      <ExploreTile icon={Star} label="Feedback" onClick={() => onNavigate('Community', 'Feedback')} />
      <ExploreTile icon={HelpCircle} label="FAQs" onClick={() => onNavigate('Community', 'FAQs')} />
    </nav>
  );
}
