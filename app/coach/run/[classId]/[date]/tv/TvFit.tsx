'use client';

import { useLayoutEffect, useRef } from 'react';

// Fits the TV card to the screen (D25): on a screen 768px wide or more the card fills the window without scrolling, and every size
// inside it is in em, so one font size scales the lot. It starts from 3% of the window height (32px at 1920×1080, 23px at 1366×768)
// and steps down until no panel spills over. Exercise names wrap rather than being cut off. A phone keeps the normal scrolling page.
const MIN_PX = 11;
const MAX_PX = 34;

function spills(root: HTMLElement): boolean {
  if (root.scrollHeight > root.clientHeight + 1) return true;
  return [...root.querySelectorAll<HTMLElement>('[data-tv-fit]')].some((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
}

export function TvFit({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      if (window.innerWidth < 768) {
        el.style.fontSize = '';
        return;
      }
      let size = Math.max(MIN_PX, Math.min(MAX_PX, Math.floor(window.innerHeight * 0.03)));
      el.style.fontSize = `${size}px`;
      while (size > MIN_PX && spills(el)) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Again once the display font has loaded (its letters are wider than the fallback's), and whenever the window changes size.
    document.fonts?.ready.then(fit).catch(() => {});
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div ref={ref} className="text-xl md:min-h-0 md:flex-1 md:overflow-hidden">
      {children}
    </div>
  );
}
