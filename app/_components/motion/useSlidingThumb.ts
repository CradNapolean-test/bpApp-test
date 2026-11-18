'use client';

import { useEffect, type RefObject } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsap';

// A segmented control's white highlight slides to the option picked instead of jumping (the coach's hub tabs and "My members / Whole
// gym" switches). The track holds a <span data-thumb-el> as its first child and marks the picked option data-active="true"; the track must
// be position: relative. Once the highlight is in place the track is marked data-thumb="on", and globals.css stops the picked option
// drawing its own white, so before JavaScript runs (or if it fails) the option still shows as picked.
function place(track: HTMLElement, animate: boolean) {
  const thumb = track.querySelector<HTMLElement>(':scope > [data-thumb-el]');
  const on = track.querySelector<HTMLElement>(':scope > [data-active="true"]');
  if (!thumb || !on) {
    track.removeAttribute('data-thumb');
    return;
  }
  const box = { x: on.offsetLeft, y: on.offsetTop, width: on.offsetWidth, height: on.offsetHeight };
  // Slides only from a place it already has: the first time a control shows (also one that appears later), it is simply put there.
  if (animate && thumb.offsetWidth > 0 && !prefersReducedMotion()) gsap.to(thumb, { ...box, duration: 0.38, ease: 'power3.out', overwrite: true });
  else gsap.set(thumb, box);
  track.setAttribute('data-thumb', 'on');
}

// `active` is whatever changes when another option is picked (pass more, such as the screen's section, when the control itself comes
// and goes).
export function useSlidingThumb(track: RefObject<HTMLElement | null>, active: unknown) {
  useGSAP(
    () => {
      if (track.current) place(track.current, true);
    },
    { scope: track, dependencies: [active] }
  );
  // A wider window or a label that wraps moves the options: the highlight follows without animating.
  useEffect(() => {
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place(el, false));
    ro.observe(el);
    return () => ro.disconnect();
  }, [track]);
}
