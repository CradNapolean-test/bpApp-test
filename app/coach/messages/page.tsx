import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
import { getCommunications } from '@/lib/data/communications';
import { MessagesHubShell } from './_components/MessagesHubShell';

export default async function CoachMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [overview, groups, communications] = await Promise.all([
    getCoachChatOverview(),
    getGroups(),
    getCommunications(),
  ]);

  return (
    <MessagesHubShell
      overview={overview}
      currentUserId={user.id}
      groups={groups}
      communications={communications}
      email={user.email ?? 'Coach'}
    />
  );
}
