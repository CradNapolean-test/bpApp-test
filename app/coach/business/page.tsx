import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCreditPacks, getPackages, getPackUsage, getPlanMemberCounts } from '@/lib/data/memberships';
import { getCoachUnreadTotal } from '@/lib/data/coach';
import { getPastEvents, getRecentFeedback, getUpcomingEvents } from '@/lib/data/community';
import { getRewardOverview } from '@/lib/data/rewards';
import { getBigDogShirts } from '@/lib/data/bigDog';
import { getBusinessOverview } from '@/lib/data/coachDashboard';
import { BusinessShell } from './_components/BusinessShell';

// The gym's commercial side in one place: membership plans, credit packs, events, rewards and
// member feedback. (Replaces the separate Memberships and Community pages.)
export default async function CoachBusinessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [packages, creditPacks, events, pastEvents, feedback, rewards, unreadCount, overview, planCountsById, packUsage, shirts] = await Promise.all([
    getPackages(),
    getCreditPacks(),
    getUpcomingEvents(null),
    getPastEvents(10),
    getRecentFeedback(),
    getRewardOverview(),
    getCoachUnreadTotal(supabase),
    getBusinessOverview().catch(() => null),
    getPlanMemberCounts(),
    getPackUsage(),
    getBigDogShirts(),
  ]);

  return (
    <BusinessShell
      packages={packages}
      creditPacks={creditPacks}
      events={events}
      pastEvents={pastEvents}
      planCountsById={planCountsById}
      packUsage={packUsage}
      feedback={feedback}
      rewards={rewards}
      shirts={shirts}
      overview={overview}
      unreadCount={unreadCount}
      email={user.email ?? 'Coach'}
    />
  );
}
