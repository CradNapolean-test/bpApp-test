import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCreditPacks, getPackages, getPackUsage, getPlanMemberCounts } from '@/lib/data/memberships';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getPastEvents, getRecentFeedback, getUpcomingEvents } from '@/lib/data/community';
import { getRewardOverview } from '@/lib/data/rewards';
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

  const [packages, creditPacks, events, pastEvents, feedback, rewards, chatOverview, overview, planCountsById, packUsage] = await Promise.all([
    getPackages(),
    getCreditPacks(),
    getUpcomingEvents(null),
    getPastEvents(10),
    getRecentFeedback(),
    getRewardOverview(),
    getCoachChatOverview(),
    getBusinessOverview().catch(() => null),
    getPlanMemberCounts(),
    getPackUsage(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

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
      overview={overview}
      unreadCount={unreadCount}
      email={user.email ?? 'Coach'}
    />
  );
}
