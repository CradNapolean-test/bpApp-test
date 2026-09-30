'use client';

import { CalendarDays, House, MessagesSquare, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ClientTab = 'Home' | 'Book' | 'Coach' | 'Profile';

const TABS: { tab: ClientTab; label: string; icon: LucideIcon }[] = [
  { tab: 'Home', label: 'Home', icon: House },
  { tab: 'Book', label: 'Book', icon: CalendarDays },
  { tab: 'Coach', label: 'Coach', icon: MessagesSquare },
  { tab: 'Profile', label: 'Profile', icon: User },
];

// Member-facing mobile nav from the owner's BP mockups (Home / Book / Coach / Profile).
// The coach's own view of a client keeps the original five-category BottomTabBar.
export function ClientBottomTabBar({
  active,
  onSelect,
  coachUnread = false,
}: {
  active: ClientTab;
  onSelect: (t: ClientTab) => void;
  // Unread coach messages -- shown as a dot on the Coach tab (replaces the old header chat icon).
  coachUnread?: boolean;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-black/10 bg-[var(--background)] md:hidden dark:border-white/10">
      {TABS.map(({ tab, label, icon: Icon }) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              isActive ? 'text-accent' : 'text-zinc-500'
            }`}
          >
            <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-accent-soft' : ''}`}>
              <Icon className="h-5 w-5" />
              {tab === 'Coach' && coachUnread && (
                <span className="absolute right-2 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-danger" />
              )}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
