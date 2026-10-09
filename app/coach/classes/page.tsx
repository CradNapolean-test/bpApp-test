import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClasses, getScheduleOccurrences } from '@/lib/data/classes';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getCoachReport } from '@/lib/data/reports';
import { getMyClients } from '@/lib/data/coach';
import { ClassesHubShell } from './_components/ClassesHubShell';

export default async function CoachClassesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Packages and credit packs moved to Business -- keep old links working.
  const { tab } = await searchParams;
  if (tab === 'packages' || tab === 'credit-packs') redirect(`/coach/business?tab=${tab === 'credit-packs' ? 'credit-packs' : 'plans'}`);

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

  const [classes, occurrences, chatOverview, report, clients] = await Promise.all([
    getClasses(),
    getScheduleOccurrences(3, 5, true),
    getCoachChatOverview(),
    getCoachReport(),
    getMyClients(supabase, user.id),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <ClassesHubShell
      initialClasses={classes}
      occurrences={occurrences}
      report={report}
      unreadCount={unreadCount}
      email={user.email ?? 'Coach'}
      clients={clients}
      timezone={gym?.timezone ?? null}
    />
  );
}
