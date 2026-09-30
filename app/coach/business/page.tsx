import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCreditPacks, getPackages } from '@/lib/data/memberships';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getRecentFeedback, getUpcomingEvents } from '@/lib/data/community';
import { getRewardOverview } from '@/lib/data/rewards';
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

  const [packages, creditPacks, events, feedback, rewards, chatOverview] = await Promise.all([
    getPackages(),
    getCreditPacks(),
    getUpcomingEvents(null),
    getRecentFeedback(),
    getRewardOverview(),
    getCoachChatOverview(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <BusinessShell
      packages={packages}
      creditPacks={creditPacks}
      events={events}
      feedback={feedback}
      rewards={rewards}
      unreadCount={unreadCount}
      email={user.email ?? 'Coach'}
    />
  );
}
