import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClasses, getScheduleOccurrences } from '@/lib/data/classes';
import { getCreditPacks, getPackages } from '@/lib/data/memberships';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getCoachReport } from '@/lib/data/reports';
import { ClassesHubShell } from './_components/ClassesHubShell';

export default async function CoachClassesPage() {
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

  const [classes, occurrences, packages, creditPacks, chatOverview, report] = await Promise.all([
    getClasses(),
    getScheduleOccurrences(),
    getPackages(),
    getCreditPacks(),
    getCoachChatOverview(),
    getCoachReport(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <ClassesHubShell
      initialClasses={classes}
      occurrences={occurrences}
      initialPackages={packages}
      initialCreditPacks={creditPacks}
      report={report}
      unreadCount={unreadCount}
      email={user.email ?? 'Coach'}
    />
  );
}
