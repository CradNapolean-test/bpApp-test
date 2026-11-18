'use client';

import { useRef, type RefObject } from 'react';
import { Flip, gsap, prefersReducedMotion, useGSAP } from './gsap';

// When a filter changes a list, the rows that stay glide from where they were to where they are now, and rows that come in fade up
// (GSAP Flip). Call the returned capture() just before changing the filter: it notes where every row is. Rows are matched by their
// data-flip-id. Rows the filter removes leave at once (React takes them out of the page). Only rows that are showing are measured (the
// phone list and the laptop table are both in the page; one is hidden).
export function useFlipList(scope: RefObject<HTMLElement | null>, key: unknown) {
  const state = useRef<Flip.FlipState | null>(null);
  const shown = () =>
    scope.current ? [...scope.current.querySelectorAll<HTMLElement>('[data-flip-id]')].filter((el) => el.offsetParent !== null) : [];

  useGSAP(
    () => {
      const before = state.current;
      state.current = null;
      if (!before) return;
      Flip.from(before, {
        targets: shown(),
        duration: 0.45,
        ease: 'power3.inOut',
        simple: true,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.15, ease: 'power2.out' }),
      });
    },
    { scope, dependencies: [key] }
  );

  return function capture() {
    if (prefersReducedMotion()) return;
    const rows = shown();
    if (rows.length) state.current = Flip.getState(rows);
  };
}
