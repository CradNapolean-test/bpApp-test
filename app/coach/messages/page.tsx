import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
import { getAudienceCounts, getCommunications } from '@/lib/data/communications';
import { getMessageTemplates } from '@/lib/data/messageTemplates';
import { senderCheck } from '@/lib/email';
import { MessagesHubShell } from './_components/MessagesHubShell';

export default async function CoachMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, gym:gym_id(timezone)')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');
  const gym = Array.isArray(profile.gym) ? profile.gym[0] : profile.gym;

  const [overview, groups, communications, templates, counts] = await Promise.all([
    getCoachChatOverview(),
    getGroups(),
    getCommunications(),
    getMessageTemplates(),
    getAudienceCounts(),
  ]);
  // Why email cannot go right now, or null when it can: Broadcasts says so next to "Send as" (MS28).
  const sender = senderCheck();

  return (
    <MessagesHubShell
      overview={overview}
      currentUserId={user.id}
      groups={groups}
      communications={communications}
      templates={templates}
      counts={counts}
      timezone={gym?.timezone ?? null}
      email={user.email ?? 'Coach'}
      emailOff={sender.ok ? null : sender.reason}
    />
  );
}
