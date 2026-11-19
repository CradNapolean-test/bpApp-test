'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COACH_NAV, isCoachNavActive } from './coachNavItems';
import { useCoachLogoUrl, useCoachName } from './CoachBrandingContext';
import { GymSwitcherMenu } from './GymSwitcherMenu';
import { SignOutButton } from '@/app/_components/SignOutButton';

// The coach's desktop navigation (the November 2026 mock-ups): a black column down the left with the wordmark, the six sections, and the
// coach at the foot opening Settings. From the laptop width up only; a phone keeps the bottom bar and a tablet the row along the top
// (CoachBottomTabBar, CoachNav), which list the same pages from coachNavItems.ts.
type NavItem = { href: string; label: string; Icon: typeof COACH_NAV[number]['Icon'] };

export function CoachSidebar({
  unreadCount = 0,
  email,
  nav,
  roleLabel = 'Coach',
  settingsHref = '/coach/settings',
  homeHref = '/coach',
}: {
  unreadCount?: number;
  email?: string;
  // Other sections (the owner's pages); the coach's six by default.
  nav?: readonly NavItem[];
  roleLabel?: string;
  settingsHref?: string;
  homeHref?: string;
}) {
  const pathname = usePathname();
  const items: readonly NavItem[] = nav ?? COACH_NAV;
  // The coach's own rule for their sections; for others, the longest section address the page is under.
  const activeHref = nav
    ? [...nav]
        .filter((n) => pathname === n.href || pathname?.startsWith(`${n.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href
    : COACH_NAV.find((n) => isCoachNavActive(pathname, n.href))?.href;
  const logoUrl = useCoachLogoUrl();
  const name = useCoachName() ?? email ?? 'Coach';
  const initial = name.trim().charAt(0).toUpperCase() || 'C';
  const onSettings = pathname?.startsWith(settingsHref) ?? false;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col gap-6 overflow-y-auto bg-[#1d1d1b] px-4 py-6 text-zinc-100 lg:flex">
      <Link href={homeHref} className="flex flex-col gap-0.5 px-2 leading-none" aria-label="Ballistic Performance, home">
        {logoUrl ? (
          <Image src={logoUrl} alt="" width={120} height={36} unoptimized className="h-9 w-auto self-start rounded" />
        ) : (
          <>
            <span aria-hidden className="text-lg font-black tracking-[0.08em]">BALLISTIC</span>
            <span aria-hidden className="mt-1 text-[11px] font-bold tracking-[0.22em] text-[#5fd6d6]">PERFORMANCE</span>
          </>
        )}
      </Link>
      {/* Only shows for a coach in more than one gym. Light text and a light pill on the black column; the list of sites is drawn
          outside this box (GymSwitcherMenu), so these rules no longer reach it. */}
      <div className="-mt-3 px-2 empty:hidden [&_button:hover]:!bg-white/15 [&_button]:!bg-white/10 [&_span]:!text-zinc-300">
        <GymSwitcherMenu />
      </div>

      <nav aria-label="Coach" className="flex flex-col gap-1">
        {items.map(({ href, label, Icon }) => {
          const active = href === activeHref;
          const unread = href === '/coach/messages' && unreadCount > 0 ? unreadCount : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                active ? 'bg-[#19adb1]/[.18] font-bold text-[#5fd6d6]' : 'font-semibold text-[#c9c9cf] hover:bg-white/[.06] hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {unread > 0 && (
                <span
                  aria-label={`${unread} unread`}
                  className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#f59e0b] px-1.5 text-xs font-extrabold text-[#1d1d1b]"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1">
        <Link
          href={settingsHref}
          aria-current={onSettings ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors ${onSettings ? 'bg-white/[.08]' : 'hover:bg-white/[.06]'}`}
        >
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#19adb1] text-[15px] font-extrabold text-[#041f1f]">
            {initial}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{name}</span>
            <span className="text-xs text-zinc-400">{roleLabel} · {nav ? 'Account' : 'Settings'}</span>
          </span>
        </Link>
        <SignOutButton className="w-full !border-white/15 !bg-transparent !text-zinc-300 hover:!bg-white/[.06] hover:!text-white" />
      </div>
    </aside>
  );
}
