import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMemberListActivity, getMemberListNutrition, getMyClients, searchGymClients } from '@/lib/data/coach';
import { getFollowUps } from '@/lib/data/followUps';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
import { getActiveHoldClientIds } from '@/lib/data/redFlags';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { CoachNav } from '../_components/CoachNav';
import { CoachSidebar } from '../_components/CoachSidebar';
import { CoachPageHeader } from '../_components/CoachUi';
import { CoachBottomTabBar } from '../_components/CoachBottomTabBar';
import { CoachMobileBrand } from '../_components/CoachMobileBrand';
import { CoachBrand } from '../_components/CoachBrand';
import { CoachHeaderExtras } from '../_components/CoachHeaderExtras';
import { AddClientButton } from '../_components/AddClientButton';
import { ClientsPageMenu } from '../_components/ClientsPageMenu';
import { MembersPageActionsProvider } from '../_components/MembersPageActions';
import { ClientTable, type QuickFilter } from '../_components/ClientTable';
import { ReviewQueue } from '../_components/ReviewQueue';
import { getClientsNeedingReview } from '@/lib/data/onboarding';

// ?filter= opens a quick filter (the dashboard's "Members to check in on" links to filter=check).
const FILTERS: QuickFilter[] = ['review', 'check', 'quiet', 'credits', 'noplan'];

export default async function CoachClientsPage({ searchParams }: { searchParams: Promise<{ plan?: string; scope?: string; filter?: string }> }) {
  const { plan: initialPlan, scope: initialScope, filter } = await searchParams;
  const initialQuick = FILTERS.find((f) => f === filter) ?? 'all';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, gym_id, gym:gym_id(name, timezone)')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');
  const gym = Array.isArray(profile.gym) ? profile.gym[0] : profile.gym;

  // The gym's today, as on the dashboard, so both build the same follow-up list.
  const todayIso = todayIsoInTz(gym?.timezone || DEFAULT_TIMEZONE);
  const [clients, gymClients, healthStatuses, chatOverview, groups, reviewQueue, holdIds, followUps, activity, nutrition] = await Promise.all([
    getMyClients(supabase, user.id),
    searchGymClients(supabase, profile.gym_id, user.id),
    getClientHealthStatuses(supabase, { coachId: user.id, gymId: profile.gym_id }),
    getCoachChatOverview(),
    getGroups(),
    getClientsNeedingReview(profile.gym_id),
    getActiveHoldClientIds().catch(() => [] as string[]),
    getFollowUps(supabase, { coachId: user.id, gymId: profile.gym_id }, todayIso),
    // The Check-in and Last class columns (CL6). If they cannot be read the list still shows, says so, and has "—" in them (null).
    getMemberListActivity(supabase, { coachId: user.id, gymId: profile.gym_id }, todayIso).catch((err) => {
      console.error('Members list: check-ins and last classes could not be read', err);
      return null;
    }),
    // The Food column (NU30): how each member tracks food and this week's average calories against their target, in one read for the
    // whole list. If it cannot be read the list still shows, with "—" in it.
    getMemberListNutrition(supabase, { coachId: user.id, gymId: profile.gym_id }, todayIso).catch((err) => {
      console.error('Members list: food could not be read', err);
      return null;
    }),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const unreadByClient: Record<string, number> = {};
  for (const c of chatOverview) if (c.unread_count > 0) unreadByClient[c.client_id] = c.unread_count;

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
      <MembersPageActionsProvider>
      <CoachPageHeader
        // On a phone this line is left out so Add member and the menu fit beside the title; the counts are on My members / Whole gym (CL3).
        eyebrow={
          <span className="max-sm:hidden">{`${clients.length} member${clients.length === 1 ? '' : 's'} with you${gymClients ? `, ${gymClients.length} in the gym` : ''}`}</span>
        }
        title="Clients"
        actions={
          <>
            <AddClientButton />
            <ClientsPageMenu />
          </>
        }
      />
      <div className="mt-4 space-y-4 sm:mt-6">
        <ReviewQueue items={reviewQueue} gymName={gym?.name ?? 'the gym'} />
        <ClientTable
          clients={clients}
          gymClients={gymClients}
          gymName={gym?.name ?? 'your gym'}
          statuses={healthStatuses}
          groups={groups}
          holdIds={holdIds}
          initialPlan={initialPlan ?? ''}
          initialScope={initialScope === 'gym' ? 'gym' : 'mine'}
          initialQuick={initialQuick}
          unreadByClient={unreadByClient}
          followUps={followUps.byClient}
          notSetUpIds={followUps.notSetUp}
          activity={activity}
          nutrition={nutrition}
          todayIso={todayIso}
        />
      </div>
      </MembersPageActionsProvider>
    </AppShell>
    </ClientOnly>
  );
}
