'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COACH_NAV, isCoachNavActive } from './coachNavItems';

// Desktop top nav. The destinations come from coachNavItems.ts, shared with the phone bottom bar
// (CoachBottomTabBar) so the two always list the same pages.
export function CoachNav() {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-[#141414] text-white shadow-sm'
        : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
    }`;

  return (
    <div className="hidden w-max gap-1 rounded-2xl bg-black/[.02] p-1.5 md:flex dark:bg-white/[.03]">
      {COACH_NAV.map(({ href, label, Icon }) => {
        const active = isCoachNavActive(pathname, href);
        return (
          <Link key={href} href={href} className={linkCls(Boolean(active))}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
