import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachDashboard } from '@/lib/data/coachDashboard';
import { getCoachChatOverview } from '@/lib/data/chat';
import type { DashboardScope } from '@/lib/data/coachDashboard';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { CoachNav } from './_components/CoachNav';
import { CoachBottomTabBar } from './_components/CoachBottomTabBar';
import { CoachBrand } from './_components/CoachBrand';
import { CoachHeaderExtras } from './_components/CoachHeaderExtras';
import { CoachTimeGreeting } from './_components/CoachGreeting';
import { AddClientForm } from './_components/AddClientForm';
import { ActivityFeed } from './_components/ActivityFeed';
import { CoachDashboard } from './_components/CoachDashboard';
import { CoachMobileBrand } from './_components/CoachMobileBrand';
import { Card } from '@/app/_components/ui';

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
  const unreadCount = (await getCoachChatOverview().catch(() => [])).reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      mobileHeader={<CoachMobileBrand />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
    >
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
          <CoachTimeGreeting name={data.firstName} />
        </h1>
        {/* Phone: one column -- today, attention, activity, habits. Wide screen: today and attention on
            the left, activity and "add client" on the right. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_24rem]">
          <CoachDashboard data={data} />
          <div className="space-y-4">
            <ActivityFeed events={data.activity} clients={[]} extraNames={names} />
            <div className="hidden lg:block">
              <Card>
                <h3 className="font-bold text-black dark:text-zinc-50">Add client</h3>
                <div className="mt-2">
                  <AddClientForm />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
    </ClientOnly>
  );
}
