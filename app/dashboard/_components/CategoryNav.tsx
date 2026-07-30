'use client';

import { Apple, CheckSquare, Dumbbell, House, Settings, TrendingUp } from 'lucide-react';
import { CATEGORY_ORDER, screensForCategory } from './categories';
import type { Category, Screen } from './categories';

const CATEGORY_ICON: Record<Category, typeof House> = {
  Home: House,
  Nutrition: Apple,
  Training: Dumbbell,
  Accountability: CheckSquare,
  Progress: TrendingUp,
  'Account Settings': Settings,
};

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
              className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {c}
            </button>
            {active && screens.length > 1 && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-black/10 pl-3 dark:border-white/10">
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
