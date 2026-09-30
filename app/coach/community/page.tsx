import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getRecentFeedback, getUpcomingEvents } from '@/lib/data/community';
import { CommunityShell } from './_components/CommunityShell';

export default async function CoachCommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [events, feedback, chatOverview] = await Promise.all([
    getUpcomingEvents(null),
    getRecentFeedback(),
    getCoachChatOverview(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return <CommunityShell events={events} feedback={feedback} unreadCount={unreadCount} />;
}
