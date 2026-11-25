'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// A row that scrolls sideways when it is wider than the screen, with its edges fading out where there is more to see (CL3: the Members
// list's quick filters were cut off at the screen's edge, "Low c…", with nothing to say the row went on). The fade is a mask, so the chips
// themselves are untouched; with nothing hidden there is no fade. On a phone the row runs to the screen's edges, so a chip scrolls out of
// sight there rather than at the page's margin.
export function FadeScrollRow({ label, children, activeKey }: { label: string; children: ReactNode; activeKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // The chosen chip is brought into view, for a list opened on a filter that sits off the edge ("Out of credits" from the dashboard).
  useEffect(() => {
    const chip = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!chip || !ref.current) return;
    const row = ref.current;
    const off = chip.offsetLeft + chip.offsetWidth - (row.scrollLeft + row.clientWidth);
    if (off > 0) row.scrollLeft += off + 24;
    else if (chip.offsetLeft < row.scrollLeft) row.scrollLeft = Math.max(0, chip.offsetLeft - 24);
    measure();
  }, [activeKey, measure]);

  const fade = 28;
  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? `transparent 0, #000 ${fade}px` : '#000 0'}, ${edges.right ? `#000 calc(100% - ${fade}px), transparent 100%` : '#000 100%'})`
      : undefined;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      onScroll={measure}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
