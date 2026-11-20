import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getMyCoachProfile } from '@/lib/supabase/currentUser';
import { getCoachDashboard } from '@/lib/data/coachDashboard';
import { activityFeedNames } from '@/lib/coachDashboardRules';
import { getCoachUnreadTotal } from '@/lib/data/coach';
import type { DashboardScope } from '@/lib/data/coachDashboard';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { CoachNav } from './_components/CoachNav';
import { CoachSidebar } from './_components/CoachSidebar';
import { CoachBottomTabBar } from './_components/CoachBottomTabBar';
import { CoachBrand } from './_components/CoachBrand';
import { CoachHeaderExtras } from './_components/CoachHeaderExtras';
import { ActivityFeed } from './_components/ActivityFeed';
import { CoachDashboard } from './_components/CoachDashboard';
import { CoachMobileBrand } from './_components/CoachMobileBrand';

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ scope?: string; coach?: string }> }) {
  const { scope: scopeParam, coach: coachParam } = await searchParams;
  const supabase = await createClient();
  // Shared with getCoachDashboard (one trip to the auth server per page, not two in a row before the members are read).
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const requested: DashboardScope = scopeParam === 'gym' || scopeParam === 'coach' ? scopeParam : 'mine';
  // The dashboard's reads and the header's unread total start now, alongside the "is this a coach?" check below, not after it (item 9).
  // Nothing of them is shown unless the check passes: someone else is sent away and their reads, which the database limits to their own
  // rows anyway, are dropped (the handlers stop a failed one being reported as unhandled). The header's message badge is always the
  // coach's own unread, whichever view is showing.
  const dashboardRead = getCoachDashboard(requested, coachParam ?? null);
  dashboardRead.catch(() => {});
  const unreadRead = getCoachUnreadTotal(supabase).catch(() => 0);

  // maybeSingle, not single -- and redirect to '/' (which explicitly handles a missing
  // profile), not straight to '/dashboard' -- redirecting directly between the two role pages
  // is what turned "no profile exists yet" into an actual infinite loop. See app/page.tsx.
  // The same read of the coach's own row as getCoachDashboard's (one trip, shared).
  const profile = await getMyCoachProfile();
  if (!profile || profile.role !== 'coach') redirect('/');

  const [data, unreadCount] = await Promise.all([dashboardRead, unreadRead]);

  // The activity feed is gym-wide, so it includes members of other coaches too; their names come from the dashboard's own lookup where
  // it has them, otherwise their profile names (read by the dashboard alongside its members).
  const names = activityFeedNames(data.nameById, data.activityNames);

  return (
    <ClientOnly fallback={<PageSkeleton />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      mobileHeader={<CoachMobileBrand />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
      coachSidebar={<CoachSidebar unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
    >
      <CoachDashboard data={data} activity={<ActivityFeed events={data.activity} clients={[]} extraNames={names} />} />
    </AppShell>
    </ClientOnly>
  );
}
