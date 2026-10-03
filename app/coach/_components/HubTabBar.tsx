'use client';

import { useEffect, useRef, useState } from 'react';

// Underline-style sub-tab bar shared by the coach hub shells (Classes, Library, Business, Messages) --
// in-page state, not routes, same as WorkspaceTabBar one level down at the per-client workspace.
// Explicit teal underline rather than border-accent: these pages set no data-view, so
// border-accent would already resolve to teal here, but staying explicit keeps this
// component's look independent of that context-driven reskin (see WorkspaceTabBar.tsx's note
// on the same choice, made there because its page *does* set data-view="coach").
//
// On a phone the tabs can be wider than the screen: the row scrolls, fades out at the edge when there is
// more to see, and keeps the selected tab in view.
export function HubTabBar<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly T[];
  active: T;
  onSelect: (tab: T) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  function measure() {
    const el = rowRef.current;
    if (el) setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }

  useEffect(() => {
    measure();
    const el = rowRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, tabs]);

  return (
    <div
      ref={rowRef}
      onScroll={measure}
      style={moreRight ? { maskImage: 'linear-gradient(to right, black calc(100% - 36px), transparent)' } : undefined}
      className="mb-4 flex w-full gap-4 overflow-x-auto border-b border-black/[.06] sm:gap-5 [scrollbar-width:none] dark:border-white/10 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            data-active={isActive}
            onClick={() => onSelect(tab)}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors ${
              isActive
                ? 'border-accent font-bold text-black dark:text-zinc-50'
                : 'border-transparent font-medium text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
