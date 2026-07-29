'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/coach', label: 'Coaching' },
  { href: '/coach/classes', label: 'Classes' },
  { href: '/coach/reports', label: 'Reports' },
] as const;

export function CoachNav() {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-foreground text-background'
        : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
    }`;

  return (
    <div className="flex gap-1 rounded-lg border border-black/10 p-1 dark:border-white/10">
      {LINKS.map(({ href, label }) => {
        const active =
          href === '/coach' ? pathname === '/coach' || pathname?.startsWith('/coach/clients') : pathname?.startsWith(href);
        return (
          <Link key={href} href={href} className={linkCls(Boolean(active))}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
