'use client';

import { ClipboardList, Dumbbell, GraduationCap, LayoutList, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { handleTabListKeys } from '@/app/_components/tabKeys';

// The Library's sections as the board's row of tiles (the November 2026 mock-ups): each says what is in it, and the one open is black.
// Tabs underneath, so the arrow keys move between them as on the other hubs.
export interface LibraryTile<T extends string> {
  tab: T;
  label: string;
  value?: string | number;
  sub: string;
  // The sub-line in amber: something to do (exercises with no video).
  warn?: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  Exercises: Dumbbell,
  'Program templates': LayoutList,
  Education: GraduationCap,
  Forms: ClipboardList,
  Foods: Utensils,
};

export function LibraryTiles<T extends string>({ tiles, active, onSelect }: { tiles: LibraryTile<T>[]; active: T; onSelect: (tab: T) => void }) {
  return (
    <div role="tablist" aria-label="Library sections" onKeyDown={handleTabListKeys} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => {
        const on = t.tab === active;
        const Icon = ICONS[t.tab] ?? LayoutList;
        return (
          <button
            key={t.tab}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(t.tab)}
            className={`flex min-h-[104px] flex-col items-start gap-1 rounded-[20px] border p-4 text-left transition-colors ${
              on
                ? 'border-[#1d1d1b] bg-[#1d1d1b] text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-[#1d1d1b]'
                : 'border-black/[.08] bg-card text-black hover:bg-black/[.02] dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/[.03]'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <Icon className={`h-[18px] w-[18px] ${on ? 'text-[#5fd6d6] dark:text-[#0e6266]' : 'text-accent'}`} aria-hidden />
              {t.label}
            </span>
            {t.value != null && <span className="text-[26px] font-extrabold leading-tight">{t.value}</span>}
            <span className={`text-[13px] ${on ? 'opacity-75' : t.warn ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
