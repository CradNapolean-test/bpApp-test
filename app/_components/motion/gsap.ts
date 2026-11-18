'use client';

import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';

// One place that sets GSAP up for the app, so every animated component registers the React hook the same way. GSAP only ever runs in the
// browser: the member screens are client-only (ClientOnly), and useGSAP runs after mount. Flip (part of GSAP) moves list rows to their
// new places when a filter changes (useFlipList).
gsap.registerPlugin(useGSAP, Flip);

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

// A short teal glow round something that just changed somewhere else on the screen (the week a day was copied into).
export function flash(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { boxShadow: '0 0 0 5px rgba(25, 173, 177, 0.45)' },
    { boxShadow: '0 0 0 0px rgba(25, 173, 177, 0)', duration: 1.1, ease: 'power2.out', clearProps: 'boxShadow' }
  );
}

// A row that is done with (a to-do marked reviewed, a reward handed out) folds shut while it saves, so the list closes up at once rather
// than when the page reloads. If the save fails the row opens again. `act` resolves true when it saved (useAction's run does).
export async function foldAway(el: HTMLElement | null, act: () => Promise<boolean>): Promise<boolean> {
  if (!el || prefersReducedMotion()) return act();
  const height = el.offsetHeight;
  gsap.set(el, { overflow: 'hidden' });
  const out = gsap.to(el, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, duration: 0.32, ease: 'power2.in' });
  const ok = await act();
  if (!ok) {
    out.kill();
    gsap.fromTo(el, { height: el.offsetHeight }, { height, opacity: 1, duration: 0.3, ease: 'power2.out', clearProps: 'all' });
  }
  return ok;
}

export { gsap, Flip, useGSAP };
