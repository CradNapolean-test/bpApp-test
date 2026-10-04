'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Apple, CheckSquare, Dumbbell, House, TrendingUp, UserCog } from 'lucide-react';
import { screensForCategory } from './categories';
import type { Category, NutritionTrackingMode, Screen } from './categories';

// How a coach moves around one member's workspace: six sections, and inside a section a row of tabs.
//   Overview   Overview, Chat
//   Nutrition  Food tracking / meal planner / recipes (whichever the member's mode uses)
//   Training   Workout, Activity
//   Check-in   Daily check-in, Forms
//   Progress   Summary, Insights, Photos, Body scans, Big Dog
//   Profile    Details, Credits & plan, Notes, Courses
// The member's own app keeps its own categories; this only reshapes what the coach sees. Tabs point at
// the existing (category, screen) pairs, so everything that navigates by those keeps working.

export interface CoachTab {
  category: Category;
  screen: Screen;
  label: string;
}

export interface CoachGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  tabs: CoachTab[];
}

const SCREEN_LABEL: Partial<Record<Screen, string>> = {
  'Food Tracking': 'Food',
  'Meal Planner': 'Meal plan',
  'Photo Diary': 'Photo diary',
  Workout: 'Workout',
  Activity: 'Activity',
  'Weekly Log': 'Daily check-in',
  Forms: 'Forms',
};

export function coachGroups(disabled: Set<Screen>, nutritionMode: NutritionTrackingMode): CoachGroup[] {
  const tabsFor = (category: Category, labels?: Partial<Record<Screen, string>>): CoachTab[] =>
    screensForCategory(category, true, disabled, nutritionMode).map((screen) => ({
      category,
      screen,
      label: labels?.[screen] ?? SCREEN_LABEL[screen] ?? screen,
    }));

  return [
    {
      key: 'overview',
      label: 'Overview',
      icon: House,
      tabs: [...tabsFor('Home', { Today: 'Overview' }), ...tabsFor('Messages', { Messages: 'Chat' })],
    },
    { key: 'nutrition', label: 'Nutrition', icon: Apple, tabs: tabsFor('Nutrition') },
    { key: 'training', label: 'Training', icon: Dumbbell, tabs: tabsFor('Training') },
    { key: 'checkin', label: 'Check-in', icon: CheckSquare, tabs: tabsFor('Accountability') },
    {
      key: 'progress',
      label: 'Progress',
      icon: TrendingUp,
      tabs: [
        ...tabsFor('Progress', { Overview: 'Summary', Insights: 'Insights', 'Progress & Photos': 'Photos', 'Body Scans': 'Body scans' }),
        ...tabsFor('Achievements', { 'Big Dog': 'Big Dog' }),
      ],
    },
    {
      key: 'profile',
      label: 'Profile',
      icon: UserCog,
      tabs: [
        ...tabsFor('Account Settings', { Setup: 'Details', Credits: 'Credits & plan', Info: 'Notes' }),
        ...tabsFor('Learn', { Education: 'Courses' }),
      ],
    },
  ].filter((g) => g.tabs.length > 0);
}

// The section the member's current page belongs to.
export function activeCoachGroup(groups: CoachGroup[], category: Category, screen: Screen): CoachGroup | undefined {
  return (
    groups.find((g) => g.tabs.some((t) => t.category === category && t.screen === screen)) ??
    groups.find((g) => g.tabs.some((t) => t.category === category))
  );
}

type Select = (tab: CoachTab) => void;

// Desktop left menu: six sections; the open one lists its screens underneath.
export function CoachMemberSideNav({
  groups,
  active,
  category,
  screen,
  onSelect,
}: {
  groups: CoachGroup[];
  active: string | undefined;
  category: Category;
  screen: Screen;
  onSelect: Select;
}) {
  return (
    <nav className="space-y-1" aria-label="Member sections">
      {groups.map((g) => {
        const isActive = g.key === active;
        const Icon = g.icon;
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => onSelect(g.tabs[0])}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-zinc-600 hover:bg-black/5 hover:text-black dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                <Icon className="h-4 w-4" />
              </span>
              {g.label}
            </button>
            {isActive && g.tabs.length > 1 && (
              <div className="ml-3 mt-2 space-y-0.5 border-l-2 border-accent/30 pl-3.5">
                {g.tabs.map((t) => (
                  <button
                    key={`${t.category}:${t.screen}`}
                    type="button"
                    onClick={() => onSelect(t)}
                    className={`block w-full rounded-md px-2 py-1 text-left text-sm transition-colors ${
                      t.category === category && t.screen === screen
                        ? 'font-medium text-black dark:text-zinc-50'
                        : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
                    }`}
                  >
                    {t.label}
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

// Phone bottom bar: the first five sections (Profile is reached from the Overview's Manage list).
export function CoachMemberBottomNav({ groups, active, onSelect }: { groups: CoachGroup[]; active: string | undefined; onSelect: Select }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-black/10 bg-[var(--background)] md:hidden dark:border-white/10">
      {groups
        .filter((g) => g.key !== 'profile')
        .map((g) => {
          const isActive = g.key === active;
          const Icon = g.icon;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onSelect(g.tabs[0])}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${isActive ? 'text-accent' : 'text-zinc-500'}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-accent-soft' : ''}`}>
                <Icon className="h-5 w-5" />
              </span>
              {g.label}
            </button>
          );
        })}
    </nav>
  );
}

// The tabs inside the current section, along the top of the page on a phone (a desktop screen lists them in
// the left menu instead).
// Scrolls sideways if there are more than fit, with a fade at the edge, and keeps the chosen one in view.
export function CoachMemberTabs({
  tabs,
  category,
  screen,
  onSelect,
}: {
  tabs: CoachTab[];
  category: Category;
  screen: Screen;
  onSelect: Select;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  function measure() {
    const el = rowRef.current;
    if (el) setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }

  useEffect(() => {
    measure();
    rowRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [category, screen, tabs.length]);

  return (
    <div
      ref={rowRef}
      onScroll={measure}
      style={moreRight ? { maskImage: 'linear-gradient(to right, black calc(100% - 36px), transparent)' } : undefined}
      className="mb-4 flex w-full gap-5 overflow-x-auto border-b border-black/[.06] [scrollbar-width:none] dark:border-white/10 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const isActive = t.category === category && t.screen === screen;
        return (
          <button
            key={`${t.category}:${t.screen}`}
            type="button"
            data-active={isActive}
            onClick={() => onSelect(t)}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors ${
              isActive
                ? 'border-accent font-bold text-black dark:text-zinc-50'
                : 'border-transparent font-medium text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
