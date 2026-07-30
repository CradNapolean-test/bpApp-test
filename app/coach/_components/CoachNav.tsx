'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, Dumbbell, FileText, Users } from 'lucide-react';

const LINKS = [
  { href: '/coach', label: 'Coaching', Icon: Users },
  { href: '/coach/classes', label: 'Classes', Icon: CalendarDays },
  { href: '/coach/forms', label: 'Forms', Icon: FileText },
  { href: '/coach/library', label: 'Library', Icon: Dumbbell },
  { href: '/coach/reports', label: 'Reports', Icon: BarChart3 },
] as const;

export function CoachNav() {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-accent text-accent-foreground'
        : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
    }`;

  return (
    <div className="flex w-max gap-1 rounded-lg border border-black/10 p-1 dark:border-white/10">
      {LINKS.map(({ href, label, Icon }) => {
        const active =
          href === '/coach' ? pathname === '/coach' || pathname?.startsWith('/coach/clients') : pathname?.startsWith(href);
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
