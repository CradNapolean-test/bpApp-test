'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Dumbbell, LayoutDashboard, Users } from 'lucide-react';

const TABS = [
  { href: '/coach', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', Icon: Users },
  { href: '/coach/classes', label: 'Classes', Icon: CalendarDays },
  { href: '/coach/library', label: 'Library', Icon: Dumbbell },
] as const;

// Coach-side mobile nav -- replaces the hamburger drawer on small screens (see AppShell's
// bottomBar prop), mirroring BottomTabBar.tsx's client-dashboard pattern. Unlike that one,
// these are real routes (Link + usePathname), not in-page category state. Account/Settings
// is deliberately not one of these tabs -- same reasoning as BottomTabBar.tsx's client-side
// equivalent -- it's already reachable at every width via the header avatar (CoachHeaderExtras
// links it to /coach/settings), so a 5th tab here would just duplicate that.
export function CoachBottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-black/10 bg-[var(--background)] md:hidden dark:border-white/10">
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === '/coach'
            ? pathname === '/coach'
            : href === '/coach/clients'
              ? pathname === '/coach/clients' || pathname?.startsWith('/coach/clients/')
              : pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
              active ? 'text-accent' : 'text-zinc-500'
            }`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-accent-soft' : ''}`}>
              <Icon className="h-5 w-5" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
