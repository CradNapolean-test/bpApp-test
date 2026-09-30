'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ellipsis } from 'lucide-react';
import { COACH_NAV, MOBILE_PRIMARY_COUNT, isCoachNavActive } from './coachNavItems';

// Coach-side mobile nav -- replaces the hamburger drawer on small screens (see AppShell's
// bottomBar prop). Real routes (Link + usePathname), not in-page state. The first few
// destinations sit on the bar; the rest (Library, Community, Settings) are under "More", so
// every page reachable on desktop is reachable here too.
export function CoachBottomTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = COACH_NAV.slice(0, MOBILE_PRIMARY_COUNT);
  const overflow = COACH_NAV.slice(MOBILE_PRIMARY_COUNT);
  const overflowActive = overflow.some((n) => isCoachNavActive(pathname, n.href));

  const tabCls = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors ${active ? 'text-accent' : 'text-zinc-500'}`;
  const chipCls = (active: boolean) =>
    `flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-accent-soft' : ''}`;

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-3 bottom-[4.5rem] rounded-2xl border border-black/10 bg-card p-2 shadow-xl dark:border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {overflow.map(({ href, label, Icon }) => {
              const active = isCoachNavActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${
                    active ? 'bg-accent-soft text-accent' : 'text-black dark:text-zinc-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-black/10 bg-[var(--background)] md:hidden dark:border-white/10">
        {primary.map(({ href, label, Icon }) => {
          const active = isCoachNavActive(pathname, href);
          return (
            <Link key={href} href={href} onClick={() => setMoreOpen(false)} className={tabCls(active)}>
              <span className={chipCls(active)}>
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className={tabCls(moreOpen || overflowActive)}>
          <span className={chipCls(moreOpen || overflowActive)}>
            <Ellipsis className="h-5 w-5" />
          </span>
          More
        </button>
      </nav>
    </>
  );
}
