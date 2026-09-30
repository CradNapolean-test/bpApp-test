import { CalendarDays, Dumbbell, LayoutDashboard, MessageSquare, PartyPopper, Settings, Users } from 'lucide-react';

// One list of coach destinations, used by both the desktop top nav and the phone's bottom bar
// so the two can never drift apart. On a phone the first MOBILE_PRIMARY_COUNT sit on the bar and
// the rest live under "More".
export const COACH_NAV = [
  { href: '/coach', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', Icon: Users },
  { href: '/coach/classes', label: 'Classes', Icon: CalendarDays },
  { href: '/coach/messages', label: 'Messages', Icon: MessageSquare },
  { href: '/coach/library', label: 'Library', Icon: Dumbbell },
  { href: '/coach/community', label: 'Community', Icon: PartyPopper },
  { href: '/coach/settings', label: 'Settings', Icon: Settings },
] as const;

export const MOBILE_PRIMARY_COUNT = 4;

export function isCoachNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/coach') return pathname === '/coach';
  return pathname === href || pathname.startsWith(`${href}/`);
}
