'use client';

import { flash, prefersReducedMotion } from './gsap';

// The programme builder (a member's programme, a template): after Add week, the page comes up to the row of weeks if it is out of view,
// so the coach sees the new week slide in; after "Copy to next week", the week it went into glows briefly. Both find the programme by
// the data-program its ProgramDayList carries.
interface Scroller {
  scrollTo: (target: HTMLElement, options?: { offset?: number }) => void;
}

const weekRow = (ownerId: string) =>
  document.querySelector<HTMLElement>(`[data-program="${CSS.escape(ownerId)}"] [data-week-chooser]`);

export function showWeekRow(ownerId: string, lenis?: Scroller | null) {
  requestAnimationFrame(() => {
    const row = weekRow(ownerId);
    if (!row) return;
    const box = row.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    if (lenis) lenis.scrollTo(row, { offset: -120 });
    else row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

// The new copy arrives with the page's reload, so the glow waits a moment for the week's pill to be there.
export function flashWeek(ownerId: string, week: number) {
  window.setTimeout(() => {
    flash(document.querySelector(`[data-program="${CSS.escape(ownerId)}"] [data-week="${week}"]`));
  }, 700);
}
