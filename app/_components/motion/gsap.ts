'use client';

import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// One place that sets GSAP up for the app, so every animated component registers the React hook the same way. GSAP only ever runs in the
// browser: the member screens are client-only (ClientOnly), and useGSAP runs after mount.
gsap.registerPlugin(useGSAP);

// People who ask their device for less motion get none: the same rule as the CSS one in globals.css.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// A quick press-and-spring on something just tapped (a rating, a star): it squeezes a little and springs back to its own size.
// Fire-and-forget on the tapped element only, so it needs no cleanup; the transform is cleared when it ends.
export function pop(el: Element | null, from = 0.82) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale: from }, { scale: 1, duration: 0.45, ease: 'back.out(3)', clearProps: 'transform' });
}

export { gsap, useGSAP };
