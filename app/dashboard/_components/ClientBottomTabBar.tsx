'use client';

import { useRef } from 'react';
import { CalendarDays, House, MessagesSquare, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { gsap, prefersReducedMotion, useGSAP } from '@/app/_components/motion/gsap';

export type ClientTab = 'Home' | 'Book' | 'Coach' | 'Profile';

const TABS: { tab: ClientTab; label: string; icon: LucideIcon }[] = [
  { tab: 'Home', label: 'Home', icon: House },
  { tab: 'Book', label: 'Book', icon: CalendarDays },
  { tab: 'Coach', label: 'Coach', icon: MessagesSquare },
  { tab: 'Profile', label: 'Profile', icon: User },
];

// Member-facing mobile nav from the owner's BP mockups (Home / Book / Coach / Profile): a black pill that floats above the bottom of
// the screen. The teal highlight is one shape that slides to the tab you pick (GSAP); with reduced motion it jumps there.
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
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useGSAP(
    () => {
      const bar = nav.current;
      const shape = pill.current;
      const button = bar?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!bar || !shape || !button) return;
      const to = { x: button.offsetLeft, width: button.offsetWidth };
      // The first placement, a resize, or reduced motion: put it there. A change of tab: slide.
      if (!placed.current || prefersReducedMotion()) {
        gsap.set(shape, to);
        placed.current = true;
      } else {
        gsap.to(shape, { ...to, duration: 0.42, ease: 'power3.out', overwrite: true });
      }
      const follow = new ResizeObserver(() => {
        const now = bar.querySelector<HTMLElement>('[aria-current="page"]');
        if (now) gsap.set(shape, { x: now.offsetLeft, width: now.offsetWidth });
      });
      follow.observe(bar);
      return () => follow.disconnect();
    },
    { dependencies: [active], scope: nav }
  );

  return (
    <nav
      ref={nav}
      aria-label="Main"
      className="fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-md grid-cols-4 gap-1 rounded-3xl bg-[#1d1d1b] p-1.5 shadow-lg shadow-black/25 md:hidden dark:border dark:border-white/10"
    >
      {/* The sliding highlight, behind the buttons. Its left edge is the nav's padding box, which is where offsetLeft counts from. */}
      <span ref={pill} aria-hidden className="pointer-events-none absolute left-0 top-1.5 h-[52px] w-0 rounded-[18px] bg-accent" />
      {TABS.map(({ tab, label, icon: Icon }) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            aria-current={isActive ? 'page' : undefined}
            // Near-black on the teal: white on this teal is too faint to read.
            className={`relative z-[1] flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-[11px] font-bold transition-colors duration-300 ${
              isActive ? 'text-[#041f1f]' : 'text-zinc-300 hover:bg-white/10'
            }`}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {tab === 'Coach' && coachUnread && (
                <span className={`absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-warning ${isActive ? 'border-accent' : 'border-[#1d1d1b]'}`} />
              )}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
