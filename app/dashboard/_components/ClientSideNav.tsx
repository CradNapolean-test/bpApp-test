'use client';

import type { LucideIcon } from 'lucide-react';
import { Apple, BookOpen, CalendarDays, CheckSquare, Dumbbell, House, MessageSquare, MessagesSquare, TrendingUp, User } from 'lucide-react';
import type { Category, Screen } from './categories';
import type { ClientTab } from './ClientBottomTabBar';

// Desktop navigation for members -- the same four destinations as the phone's bottom bar
// (Home / Book / Coach / Profile), so there is one menu structure at every screen size. The
// Coach entry expands to the coaching areas.

const COACH_LINKS: { category: Category; label: string; icon: LucideIcon }[] = [
  { category: 'Messages', label: 'Message your coach', icon: MessageSquare },
  { category: 'Nutrition', label: 'Nutrition', icon: Apple },
  { category: 'Training', label: 'Training', icon: Dumbbell },
  { category: 'Accountability', label: 'Check-in', icon: CheckSquare },
  { category: 'Progress', label: 'Progress & results', icon: TrendingUp },
  { category: 'Learn', label: 'Learn', icon: BookOpen },
];

export function ClientSideNav({
  activeTab,
  category,
  disabledCategories,
  onSelectTab,
  onNavigate,
}: {
  activeTab: ClientTab;
  category: Category;
  // Categories whose every screen is switched off for this member (hidden from the menu).
  disabledCategories: Set<Category>;
  onSelectTab: (t: ClientTab) => void;
  onNavigate: (category: Category, screen?: Screen) => void;
}) {
  const tabs: { tab: ClientTab; label: string; icon: LucideIcon }[] = [
    { tab: 'Home', label: 'Home', icon: House },
    { tab: 'Book', label: 'Book', icon: CalendarDays },
    { tab: 'Coach', label: 'Coach', icon: MessagesSquare },
    { tab: 'Profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="space-y-1" aria-label="Main">
      {tabs.map(({ tab, label, icon: Icon }) => {
        const active = activeTab === tab;
        return (
          <div key={tab}>
            <button
              type="button"
              onClick={() => onSelectTab(tab)}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-zinc-600 hover:bg-black/5 hover:text-black dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  active ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              {label}
            </button>
            {tab === 'Coach' && active && (
              <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-accent/30 pl-3">
                {COACH_LINKS.filter((l) => !disabledCategories.has(l.category)).map(({ category: c, label: l, icon: LinkIcon }) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onNavigate(c)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      category === c
                        ? 'font-semibold text-black dark:text-zinc-50'
                        : 'text-zinc-500 hover:text-black dark:hover:text-zinc-200'
                    }`}
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    {l}
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
