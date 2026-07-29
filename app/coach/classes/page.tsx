import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClasses, getScheduleOccurrences } from '@/lib/data/classes';
import { getPackages } from '@/lib/data/memberships';
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

  const [classes, occurrences, packages] = await Promise.all([
    getClasses(),
    getScheduleOccurrences(),
    getPackages(),
  ]);

  return <ClassesHubShell initialClasses={classes} occurrences={occurrences} initialPackages={packages} />;
}
