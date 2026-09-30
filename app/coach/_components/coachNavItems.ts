import { Briefcase, CalendarDays, Dumbbell, LayoutDashboard, MessageSquare, Users } from 'lucide-react';

// One list of coach destinations, used by both the desktop top nav and the phone's bottom bar
// so the two can never drift apart. On a phone the first MOBILE_PRIMARY_COUNT sit on the bar and
// the rest live under "More".
//
// Six items, deliberately. Settings is not one of them -- it is the account avatar in every page
// header. Business folds what used to be separate Memberships and Community pages (plans, credit
// packs, events, rewards, feedback) into one place.
export const COACH_NAV = [
  { href: '/coach', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', Icon: Users },
  { href: '/coach/classes', label: 'Classes', Icon: CalendarDays },
  { href: '/coach/messages', label: 'Messages', Icon: MessageSquare },
  { href: '/coach/library', label: 'Library', Icon: Dumbbell },
  { href: '/coach/business', label: 'Business', Icon: Briefcase },
] as const;

export const MOBILE_PRIMARY_COUNT = 4;

export function isCoachNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/coach') return pathname === '/coach';
  return pathname === href || pathname.startsWith(`${href}/`);
}
