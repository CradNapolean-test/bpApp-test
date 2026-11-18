import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachDashboard } from '@/lib/data/coachDashboard';
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // maybeSingle, not single -- and redirect to '/' (which explicitly handles a missing
  // profile), not straight to '/dashboard' -- redirecting directly between the two role pages
  // is what turned "no profile exists yet" into an actual infinite loop. See app/page.tsx.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'coach') redirect('/');

  const requested: DashboardScope = scopeParam === 'gym' || scopeParam === 'coach' ? scopeParam : 'mine';
  const data = await getCoachDashboard(requested, coachParam ?? null);

  // The activity feed is gym-wide, so it includes members of other coaches too; their names come
  // from the dashboard's own lookup where we have them, otherwise a quick query.
  const names: Record<string, string> = { ...data.nameById };
  const unknownIds = [...new Set(data.activity.map((e) => e.client_id))].filter((id) => !names[id]);
  if (unknownIds.length) {
    const { data: extra } = await supabase.from('client_profiles').select('client_id, name').in('client_id', unknownIds);
    for (const p of extra ?? []) if (p.name) names[p.client_id] = p.name;
  }
  // The header's message badge is always the coach's own unread, whichever view is showing.
  const unreadCount = await getCoachUnreadTotal(supabase).catch(() => 0);

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
