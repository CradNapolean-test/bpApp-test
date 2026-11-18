'use client';

import type { RefObject } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// The items of a list rise into place one after another: when the list first shows, and again when `key` changes (another day, another
// filter). Only the first dozen or so move, so a long list does not keep the reader waiting. The selector is looked up inside `scope` only.
export function useStaggerIn(scope: RefObject<HTMLElement | null>, selector: string, key: unknown = null, delay = 0.12) {
  useGSAP(
    () => {
      if (!scope.current || prefersReducedMotion()) return;
      // Only items that are showing: a screen can hold a phone list and a laptop table, one of them hidden.
      const items = gsap.utils.toArray<HTMLElement>(selector).filter((el) => el.getClientRects().length > 0).slice(0, 14);
      if (items.length === 0) return;
      gsap.from(items, { y: 14, opacity: 0, duration: 0.5, delay, ease: 'power3.out', stagger: 0.05, clearProps: 'transform,opacity' });
    },
    { scope, dependencies: [key], revertOnUpdate: true }
  );
}
