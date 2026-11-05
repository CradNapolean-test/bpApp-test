'use client';

import { useLayoutEffect, useState } from 'react';

// The height that makes an element end `bottomGap` px above the bottom of the window, counted from where it starts on the page (not on
// screen, so scrolling does not change it). The coach inbox uses it so the open conversation and the list each fit the window and scroll
// inside themselves, instead of the reply box sitting below the fold with two scrollbars to reach it.
//
// Only from the md width up, where the inbox is two columns. Below it (and before the first measure, and when not enabled) it gives null,
// so the caller keeps its normal height. Returns a ref callback to put on the element, and the height.
export function useFitToWindow({ bottomGap, min, enabled = true }: { bottomGap: number; min: number; enabled?: boolean }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!el || !enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dropping the measure when the element goes or is switched off
      setHeight(null);
      return;
    }
    const wide = window.matchMedia('(min-width: 768px)');
    const measure = () => {
      if (!wide.matches) {
        setHeight(null);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(min, Math.floor(window.innerHeight - top - bottomGap)));
    };
    measure();
    window.addEventListener('resize', measure);
    wide.addEventListener('change', measure);
    // Something above the element changing size (a banner arriving, the header wrapping) moves where it starts.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      wide.removeEventListener('change', measure);
      observer.disconnect();
    };
  }, [el, enabled, bottomGap, min]);

  return [setEl, height] as const;
}
