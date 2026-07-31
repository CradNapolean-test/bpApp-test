'use client';

import { CATEGORY_ICON, CATEGORY_ORDER, screensForCategory } from './categories';
import type { Category, Screen } from './categories';

export function CategoryNav({
  category,
  screen,
  isCoachView,
  onSelectCategory,
  onSelectScreen,
}: {
  category: Category;
  screen: Screen;
  isCoachView: boolean;
  onSelectCategory: (c: Category) => void;
  onSelectScreen: (s: Screen) => void;
}) {
  return (
    <nav className="space-y-1">
      {CATEGORY_ORDER.map((c) => {
        const screens = screensForCategory(c, isCoachView);
        const active = category === c;
        const Icon = CATEGORY_ICON[c];
        return (
          <div key={c}>
            <button
              onClick={() => onSelectCategory(c)}
              className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-zinc-600 hover:bg-black/5 hover:text-black dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-300'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  active ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              {c}
            </button>
            {active && screens.length > 1 && (
              <div className="ml-3 mt-2 space-y-0.5 border-l-2 border-accent/30 pl-3.5">
                {screens.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSelectScreen(s)}
                    className={`block w-full rounded-md px-2 py-1 text-left text-sm transition-colors ${
                      screen === s
                        ? 'font-medium text-black dark:text-zinc-50'
                        : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
