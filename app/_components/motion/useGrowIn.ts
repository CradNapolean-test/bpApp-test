'use client';

import type { RefObject } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// Progress shapes fill up from empty when a screen opens: bars marked data-grow="bar" widen from the left, rings marked data-grow="ring"
// draw round from the top. Each ends exactly where React drew it, and the bars' inline transform is cleared afterwards.
// Bars grow with a transform (scaleX) rather than width: their width is React's inline percentage, and tweening it would leave a fixed
// pixel width behind.
// A screen whose bars arrive after it opens (read on demand) passes ready, something that changes when they do, and they fill then.
export function useGrowIn(scope: RefObject<HTMLElement | null>, delay = 0.15, ready?: unknown) {
  useGSAP(
    () => {
      // Without a scope element the selectors would look across the whole page.
      if (!scope.current || prefersReducedMotion()) return;
      const bars = gsap.utils.toArray<HTMLElement>('[data-grow="bar"]');
      const rings = gsap.utils.toArray<SVGCircleElement>('[data-grow="ring"]');
      if (bars.length) {
        gsap.from(bars, { scaleX: 0, transformOrigin: '0% 50%', duration: 0.9, delay, ease: 'power3.out', stagger: 0.06, clearProps: 'transform,transformOrigin' });
      }
      for (const ring of rings) {
        const total = Number(ring.getAttribute('data-circumference'));
        if (!total) continue;
        gsap.from(ring, { attr: { 'stroke-dasharray': `0 ${total}` }, duration: 1, delay, ease: 'power3.out' });
      }
    },
    { scope, dependencies: [ready] }
  );
}
