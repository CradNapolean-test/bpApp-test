'use client';

import { BOTTOM_TAB_CATEGORIES, CATEGORY_ICON } from './categories';
import type { Category } from './categories';

// Client-dashboard-only mobile nav -- replaces the hamburger drawer on small screens (see
// AppShell's bottomBar prop). Account Settings is deliberately not one of the 5 tabs; it's
// reachable from a header icon instead (see DashboardShell), matching common mobile-app
// conventions of keeping settings off the primary tab bar.
export function BottomTabBar({
  category,
  onSelectCategory,
}: {
  category: Category;
  onSelectCategory: (c: Category) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-black/10 bg-[var(--background)] md:hidden dark:border-white/10">
      {BOTTOM_TAB_CATEGORIES.map((c) => {
        const Icon = CATEGORY_ICON[c];
        const active = category === c;
        return (
          <button
            key={c}
            onClick={() => onSelectCategory(c)}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
              active ? 'text-accent' : 'text-zinc-500'
            }`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-accent-soft' : ''}`}>
              <Icon className="h-5 w-5" />
            </span>
            {c}
          </button>
        );
      })}
    </nav>
  );
}
