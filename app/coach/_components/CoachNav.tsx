'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, Dumbbell, FileText, GraduationCap, MessageSquare, Users } from 'lucide-react';

const LINKS = [
  { href: '/coach', label: 'Coaching', Icon: Users },
  { href: '/coach/classes', label: 'Classes', Icon: CalendarDays },
  { href: '/coach/messages', label: 'Messages', Icon: MessageSquare },
  { href: '/coach/forms', label: 'Forms', Icon: FileText },
  { href: '/coach/library', label: 'Library', Icon: Dumbbell },
  { href: '/coach/education', label: 'Education', Icon: GraduationCap },
  { href: '/coach/reports', label: 'Reports', Icon: BarChart3 },
] as const;

export function CoachNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-accent text-accent-foreground shadow-sm'
        : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
    }`;

  return (
    <div className="flex w-max gap-1 rounded-2xl bg-black/[.02] p-1.5 dark:bg-white/[.03]">
      {LINKS.map(({ href, label, Icon }) => {
        const active =
          href === '/coach' ? pathname === '/coach' || pathname?.startsWith('/coach/clients') : pathname?.startsWith(href);
        return (
          <Link key={href} href={href} className={linkCls(Boolean(active))}>
            <Icon className="h-4 w-4" />
            {label}
            {href === '/coach/messages' && unreadCount > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
