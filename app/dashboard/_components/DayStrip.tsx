'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { ChevronLeft, Undo2 } from 'lucide-react';
import { prefersReducedMotion } from '@/app/_components/motion/gsap';

// The horizontal day strip on the dark header: Book's (ClassesArea), and since item 8 (signed off 21 Nov 2026) the food diary's and
// the daily check-in's too. The phone has its own copy (apps/mobile/src/components/dayStrip.tsx).
//
// Every look is Book's: the day picked is a white circle with a dark extra-bold number; a day whose ring is full is a 2px teal ring
// with a light-teal number, exactly like a booked day on Book. The food and check-in strips ("progress") add a part ring (that share
// drawn in teal clockwise from 12 o'clock, the number still grey), today's white extra-bold number whenever today is not picked (also
// inside a full ring), a darker grey number on plain days so that white stands out, and a small month name over the 1st.

export interface DayStripDay {
  iso: string;
  // "Thu"
  weekday: string;
  // 19
  dayNum: number;
  // Said to a screen reader instead of the chip: "Thu 19 Nov, 2 of 3 checked in".
  label: string;
  // 0 plain, 1 full ring, anything between a part ring.
  ring: number;
  // Book: a day with no sessions is faded.
  faded?: boolean;
  isToday?: boolean;
  // The small month name over the 1st ("Nov"); null on other days.
  month?: string | null;
  // The coach's line under the date: the day's calories, or "no food" in red.
  below?: { text: string; danger: boolean } | null;
}

// Book's strip runs edge to edge in the header on a phone; a strip in a card of its own passes the card's padding instead.
const HEADER_EDGE = '-mx-5 px-5 sm:-mx-6 sm:px-6 md:mx-0 md:px-0';
const RING_R = 17;
const RING_C = 2 * Math.PI * RING_R;

function chipClass(day: DayStripDay, active: boolean, progress: boolean): string {
  if (active) return 'bg-zinc-100 font-extrabold text-[#1d1d1b]';
  const todayNumber = progress && day.isToday ? 'font-extrabold text-white' : null;
  if (day.ring >= 1) return `border-2 border-accent ${todayNumber ?? 'font-bold text-[#5fd6d6]'}`;
  if (!progress) return day.faded ? 'font-semibold text-zinc-600' : 'bg-white/[.07] font-semibold text-zinc-200';
  if (day.ring > 0) return todayNumber ?? 'font-semibold text-zinc-400';
  return `bg-white/[.07] ${todayNumber ?? 'font-semibold text-zinc-400'}`;
}

export function DayStrip({
  days,
  selected,
  onSelect,
  variant = 'book',
  stripRef,
  edgeClassName = HEADER_EDGE,
  months = false,
  disabled = false,
  caption,
  todayIso,
  onToday,
  before,
}: {
  days: DayStripDay[];
  selected: string;
  onSelect: (iso: string) => void;
  // 'book' is Book exactly as it was; 'progress' is the food diary and check-in look.
  variant?: 'book' | 'progress';
  stripRef?: RefObject<HTMLDivElement | null>;
  edgeClassName?: string;
  // Keep a line over every day for the month names.
  months?: boolean;
  disabled?: boolean;
  // The line under the strip, and the Today button beside it once another day is picked.
  caption?: string;
  todayIso?: string;
  onToday?: () => void;
  // Something at the left end of the strip (the coach's "Earlier" button).
  before?: React.ReactNode;
}) {
  const progress = variant === 'progress';
  const ownRef = useRef<HTMLDivElement | null>(null);
  // Book passes its own ref, which its pop-in animation is scoped to.
  const scroller = stripRef ?? ownRef;
  // The day last brought into view (null until the strip opens).
  const shownDay = useRef<string | null>(null);

  // The day picked is kept in view, with a day's room either side, inside the strip only (the page itself never scrolls). It runs
  // when the strip opens (today, at the right-hand end) and whenever the day changes some other way (the Today button, a swipe across
  // the screen), and only then: days added at the front (the coach's Earlier) leave the strip where it is, so the weeks just loaded
  // show beside the button instead of the strip sliding back to the day picked. (days.length only lets a day not on the strip yet be
  // found once it is.) Book's too, since swiping can walk its day off the end of the strip.
  useEffect(() => {
    if (shownDay.current === selected) return;
    const box = scroller.current;
    const chip = box?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!box || !chip) return;
    const opening = shownDay.current === null;
    shownDay.current = selected;
    const room = 50;
    const boxRect = box.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    let left = box.scrollLeft;
    if (chipRect.right > boxRect.right - room) left += chipRect.right - (boxRect.right - room);
    else if (chipRect.left < boxRect.left + room) left -= boxRect.left + room - chipRect.left;
    if (left !== box.scrollLeft) box.scrollTo({ left, behavior: opening || prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [selected, days.length, scroller]);

  const strip = (
    <div ref={scroller} className={`${edgeClassName} flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
      {before}
      {days.map((d) => {
        const active = d.iso === selected;
        const part = progress && !active && d.ring > 0 && d.ring < 1;
        return (
          <button
            key={d.iso}
            type="button"
            data-day={d.iso}
            disabled={disabled}
            onClick={() => onSelect(d.iso)}
            aria-pressed={active}
            aria-current={progress && d.isToday ? 'date' : undefined}
            aria-label={d.label}
            className={`flex w-11 shrink-0 flex-col items-center gap-1.5 ${progress ? 'disabled:opacity-60' : ''}`}
          >
            {months && (
              <span aria-hidden className="h-[13px] text-[10px] font-extrabold uppercase leading-[13px] tracking-[.05em] text-zinc-300">
                {d.month ?? ''}
              </span>
            )}
            <span
              className={`text-[11px] ${
                active ? 'font-bold text-zinc-100' : progress || !d.faded ? 'font-semibold text-zinc-400' : 'font-semibold text-zinc-600'
              }`}
            >
              {d.weekday}
            </span>
            <span data-chip className={`relative flex h-9 w-9 items-center justify-center rounded-full text-sm ${chipClass(d, active, progress)}`}>
              {d.dayNum}
              {part && (
                <svg aria-hidden className="pointer-events-none absolute inset-0" width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r={RING_R} fill="none" strokeWidth="2" className="stroke-white/[.16]" />
                  <circle
                    cx="18"
                    cy="18"
                    r={RING_R}
                    fill="none"
                    strokeWidth="2"
                    className="stroke-accent"
                    strokeDasharray={`${(d.ring * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`}
                    transform="rotate(-90 18 18)"
                  />
                </svg>
              )}
            </span>
            {d.below && (
              <span className={`-mt-px whitespace-nowrap text-[10px] font-bold leading-none ${d.below.danger ? 'text-red-400' : 'text-zinc-400'}`}>
                {d.below.text}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (caption === undefined && !onToday) return strip;
  return (
    <div className="space-y-2">
      {strip}
      <div className="flex min-h-8 items-center justify-between gap-2.5">
        <p className="text-xs text-zinc-400">{caption}</p>
        {onToday && todayIso && selected !== todayIso && (
          <button
            type="button"
            onClick={onToday}
            disabled={disabled}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-extrabold text-zinc-100 hover:bg-white/15 disabled:opacity-60"
          >
            <Undo2 aria-hidden className="h-3.5 w-3.5" />
            Today
          </button>
        )}
      </div>
    </div>
  );
}

// A dark card for a strip that has no member header to sit in (the coach's view of a member): the same dark as the header.
export function DayStripCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] bg-[#1d1d1b] p-4 text-zinc-100 dark:border dark:border-white/10">{children}</div>;
}

export const CARD_EDGE = '-mx-4 px-4';

// The coach's strip has no 30-day limit: this, at its left end, adds four more weeks (useOlderDayMarks). A screen reader hears the
// same state as the button shows (loading, or the load failed). While loading it is aria-disabled rather than disabled, so a
// keyboard press does not lose its focus (a press then does nothing).
export function EarlierButton({ onClick, loading, failed }: { onClick: () => void; loading: boolean; failed: boolean }) {
  return (
    <button
      type="button"
      onClick={loading ? undefined : onClick}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      aria-label={loading ? 'Loading four earlier weeks' : failed ? 'Could not load earlier weeks. Try again' : 'Show four earlier weeks'}
      className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-2xl bg-white/[.07] text-[11px] font-bold text-zinc-300 hover:bg-white/10 aria-disabled:opacity-60"
    >
      <ChevronLeft aria-hidden className="h-4 w-4" />
      {loading ? 'Loading' : failed ? 'Try again' : 'Earlier'}
    </button>
  );
}
