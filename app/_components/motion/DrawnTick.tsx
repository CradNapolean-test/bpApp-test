'use client';

import { useRef } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// A tick that draws itself when something is marked done (a member marked here), after React Bits SpringCheck, on GSAP. Already ticked
// when the screen opens, it is simply shown. It takes the text colour, like the icons it replaces.
export default function DrawnTick({ on, className = 'h-4 w-4' }: { on: boolean; className?: string }) {
  const path = useRef<SVGPathElement>(null);
  const wasOn = useRef(on);
  useGSAP(
    () => {
      const el = path.current;
      if (!el) return;
      if (on && !wasOn.current && !prefersReducedMotion()) {
        gsap.fromTo(el, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.42, ease: 'power2.out' });
      } else {
        gsap.set(el, { strokeDashoffset: 0 });
      }
      wasOn.current = on;
    },
    { dependencies: [on] }
  );
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path ref={path} d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} strokeDashoffset={0} />
    </svg>
  );
}
