'use client';

import { useRef } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// A whole number whose digits roll like a counter wheel when it changes ("5 of 12 here" turning to 6). After React Bits Counter
// (reactbits.dev): each place is a column of 0-9 that slides to its digit. Written on GSAP, which the app already loads, rather than the
// Motion library the original uses. A screen reader hears the number only; reduced motion jumps straight to it.
function Digit({ digit }: { digit: number }) {
  const column = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);
  useGSAP(
    () => {
      const el = column.current;
      if (!el) return;
      const to = { yPercent: -digit * 10 };
      if (!shown.current || prefersReducedMotion()) gsap.set(el, to);
      else gsap.to(el, { ...to, duration: 0.55, ease: 'back.out(1.4)', overwrite: true });
      shown.current = true;
    },
    { dependencies: [digit] }
  );
  return (
    <span className="relative inline-block h-[1.15em] overflow-hidden">
      <span ref={column} className="flex flex-col">
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block h-[1.15em] leading-[1.15em]">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export default function RollingNumber({ value, className = '' }: { value: number; className?: string }) {
  const digits = String(Math.max(0, Math.round(value))).split('').map(Number);
  return (
    <span className={`inline-flex align-baseline tabular-nums ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {/* Keyed by place (ones, tens...) so a 9 turning to 10 keeps the ones column and adds a tens one. */}
        {digits.map((d, i) => (
          <Digit key={digits.length - i} digit={d} />
        ))}
      </span>
    </span>
  );
}
