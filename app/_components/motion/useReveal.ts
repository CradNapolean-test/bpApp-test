'use client';

import type { RefObject } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// A chart draws itself in from the left: the element is uncovered with a clip from left to right, so a trend line reads in the order of
// its dates. It plays when the chart first shows and again when `key` changes (another measure picked), and the clip is cleared after.
// A clip rather than a stroke-dash draw: the app's lines are stretched to the card (non-scaling strokes), where dash lengths do not
// match the drawn length.
export function useReveal(target: RefObject<Element | null>, key: unknown = null, delay = 0.1) {
  useGSAP(
    () => {
      const el = target.current;
      if (!el || prefersReducedMotion()) return;
      gsap.fromTo(
        el,
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)', duration: 1, delay, ease: 'power2.inOut', clearProps: 'clipPath' }
      );
    },
    { dependencies: [key], revertOnUpdate: true }
  );
}
