'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Dumbbell, LayoutDashboard, MessageSquare, Settings, Users } from 'lucide-react';

const LINKS = [
  { href: '/coach', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', Icon: Users },
  { href: '/coach/classes', label: 'Classes', Icon: CalendarDays },
  { href: '/coach/library', label: 'Library', Icon: Dumbbell },
  { href: '/coach/messages', label: 'Messages', Icon: MessageSquare },
  { href: '/coach/settings', label: 'Settings', Icon: Settings },
] as const;

// Desktop-only -- CoachBottomTabBar is the mobile equivalent (see AppShell's bottomBar
// prop), and stays at its own 4-item set (Coaching/Classes/Library/Account) -- this desktop
// nav is the only one that grew to 6 items with Clients and Messages split out as their own
// destinations (Messages also still has the quick-access CoachMessagesButton overlay).
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
      {LINKS.map(({ href, label, Icon }) => {
        const active =
          href === '/coach'
            ? pathname === '/coach'
            : href === '/coach/clients'
              ? pathname === '/coach/clients' || pathname?.startsWith('/coach/clients/')
              : pathname?.startsWith(href);
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
