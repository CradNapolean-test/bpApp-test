'use client';

import { useRef } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// A number that counts up to its value when it first shows, and from the old value to the new one when it changes.
// Adapted from React Bits CountUp (reactbits.dev, CountUp-TS-TW): the original runs on the Motion library; this one runs on GSAP so the
// app loads one animation engine, and it keeps the same main props (to, from, duration, delay, separator, decimals).
// A screen reader is given the final number only (the counting digits are hidden from it), and reduced motion shows the final number.

const format = (value: number, decimals: number, separator: string) =>
  value
    .toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/,/g, separator);

export default function CountUp({
  to,
  from = 0,
  duration = 0.9,
  delay = 0,
  separator = ',',
  decimals = 0,
  className = '',
}: {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  separator?: string;
  decimals?: number;
  className?: string;
}) {
  const shown = useRef<HTMLSpanElement>(null);
  // The value on screen, so a change counts on from there rather than from zero.
  const current = useRef<number | null>(null);

  useGSAP(
    () => {
      const el = shown.current;
      if (!el) return;
      const start = current.current ?? from;
      el.textContent = format(start, decimals, separator);
      if (prefersReducedMotion() || start === to) {
        current.current = to;
        el.textContent = format(to, decimals, separator);
        return;
      }
      const counter = { value: start };
      gsap.to(counter, {
        value: to,
        duration,
        delay: current.current == null ? delay : 0,
        ease: 'power3.out',
        onUpdate: () => {
          current.current = counter.value;
          el.textContent = format(counter.value, decimals, separator);
        },
        onComplete: () => {
          current.current = to;
          el.textContent = format(to, decimals, separator);
        },
      });
    },
    { dependencies: [to], scope: shown }
  );

  return (
    <span className={className}>
      <span className="sr-only">{format(to, decimals, separator)}</span>
      {/* Left empty for React: the digits are written by the effect above (it runs before the first paint), so React and GSAP never both
          own this text. */}
      <span ref={shown} aria-hidden className="tabular-nums" />
    </span>
  );
}
