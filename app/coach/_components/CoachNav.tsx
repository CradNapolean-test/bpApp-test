'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CoachNav() {
  const pathname = usePathname();
  const isClasses = pathname?.startsWith('/coach/classes');

  const linkCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-foreground text-background'
        : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
    }`;

  return (
    <div className="flex gap-1 rounded-lg border border-black/10 p-1 dark:border-white/10">
      <Link href="/coach" className={linkCls(!isClasses)}>
        Coaching
      </Link>
      <Link href="/coach/classes" className={linkCls(Boolean(isClasses))}>
        Classes
      </Link>
    </div>
  );
}
