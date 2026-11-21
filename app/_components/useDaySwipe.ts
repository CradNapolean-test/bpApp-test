'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { neighbourDays, startsAtEdge, swipeStep } from '@/lib/utils/daySwipe';

// Swiping sideways on a screen that picks a day changes the day (21 Nov 2026): Book, the food diary (full and typed totals), the photo
// diary and the daily check-in, the member's and the coach's. The rule is lib/utils/daySwipe.ts, shared with the phone
// (apps/mobile/src/components/daySwipe.tsx). Touch only: a mouse or trackpad clicks the strip or the arrows as before, and a screen
// reader's swipes are the screen reader's own.
//
// The swipe goes to what `previous` / `next` do (null where the screen stops), the same function a tap on that day calls.

export interface DaySwipe {
  previous?: (() => void) | null;
  next?: (() => void) | null;
}

// The days either side of the one picked on a strip, each as a tap on it would pick it.
export function stripSwipe(days: readonly string[], selected: string, pick: (iso: string) => void): DaySwipe {
  const { previous, next } = neighbourDays(days, selected);
  return { previous: previous ? () => pick(previous) : null, next: next ? () => pick(next) : null };
}

// Things that take a sideways drag themselves, or sit over the page, so a touch starting on them is never a day swipe.
const OWN_DRAG = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="dialog"], dialog, [data-no-day-swipe]';

interface DragNode {
  matches(selector: string): boolean;
  parentElement: DragNode | null;
  scrollWidth: number;
  clientWidth: number;
}
type StyleOf = (el: DragNode) => Pick<CSSStyleDeclaration, 'position' | 'overflowX' | 'touchAction'>;

// Whether a touch on `target` belongs to something between it and the swipe's area (`root`, included) rather than to the day: a form
// field or slider, a sheet or menu over the page (fixed), a row that scrolls sideways (the strip itself, a wide table), or something
// with its own touch handling (a zoomable photo).
export function startsOnOwnDrag(target: DragNode, root: DragNode, styleOf: StyleOf): boolean {
  for (let el: DragNode | null = target; el; el = el === root ? null : el.parentElement) {
    if (el.matches(OWN_DRAG)) return true;
    const style = styleOf(el);
    if (style.position === 'fixed') return true;
    if (style.touchAction === 'none' || style.touchAction.startsWith('pan-y')) return true;
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

export function useDaySwipe(area: RefObject<HTMLElement | null>, swipe: DaySwipe | null) {
  // The newest previous / next, read when the finger lifts, so the listeners are added once.
  const latest = useRef(swipe);
  useEffect(() => {
    latest.current = swipe;
  });
  const on = swipe !== null;

  useEffect(() => {
    const root = area.current;
    if (!root || !on) return;
    let start: { x: number; y: number } | null = null;

    const begin = (e: TouchEvent) => {
      start = null;
      // A second finger (pinching) is never a swipe, and neither is moving round a page zoomed in.
      if (e.touches.length !== 1 || (window.visualViewport?.scale ?? 1) > 1.01) return;
      const touch = e.touches[0];
      if (startsAtEdge(touch.clientX, window.innerWidth)) return;
      if (e.target instanceof Element && startsOnOwnDrag(e.target, root, (el) => getComputedStyle(el as Element))) return;
      start = { x: touch.clientX, y: touch.clientY };
    };
    const end = (e: TouchEvent) => {
      const from = start;
      start = null;
      const touch = e.changedTouches[0];
      if (!from || !touch || e.touches.length > 0) return;
      // A finger dragged to choose some text has not swiped.
      if (window.getSelection()?.isCollapsed === false) return;
      const step = swipeStep(touch.clientX - from.x, touch.clientY - from.y);
      const go = step === 1 ? latest.current?.next : step === -1 ? latest.current?.previous : null;
      go?.();
    };
    const cancel = () => {
      start = null;
    };

    root.addEventListener('touchstart', begin, { passive: true });
    root.addEventListener('touchend', end, { passive: true });
    root.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      root.removeEventListener('touchstart', begin);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', cancel);
    };
  }, [area, on]);
}
