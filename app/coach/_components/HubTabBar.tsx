'use client';

import { useEffect, useRef, useState } from 'react';
import { handleTabListKeys } from '@/app/_components/tabKeys';

// The board's segmented control (the November 2026 mock-ups): white on a grey track. It was an underlined row.
// Shared by the coach hub shells (Classes, Library, Business, Messages) --
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
  label = 'Sections',
}: {
  tabs: readonly T[];
  active: T;
  onSelect: (tab: T) => void;
  // What the row is for, announced with the tab list ("Sections" unless a screen says better).
  label?: string;
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
      role="tablist"
      aria-label={label}
      onKeyDown={handleTabListKeys}
      onScroll={measure}
      style={moreRight ? { maskImage: 'linear-gradient(to right, black calc(100% - 36px), transparent)' } : undefined}
      className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-black/[.06] p-1 [scrollbar-width:none] dark:bg-white/10 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-active={isActive}
            onClick={() => onSelect(tab)}
            className={`min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-sm font-bold transition-colors ${
              isActive ? 'bg-card text-black shadow-sm dark:text-zinc-50' : 'text-zinc-600 hover:text-black dark:text-zinc-300 dark:hover:text-white'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
