import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClasses, getScheduleOccurrences } from '@/lib/data/classes';
import { getPackages } from '@/lib/data/memberships';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { CoachNav } from '@/app/coach/_components/CoachNav';
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

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Classes</h1>
        <SignOutButton />
      </div>
      <div className="mt-4">
        <CoachNav />
      </div>
      <div className="mt-6">
        <ClassesHubShell initialClasses={classes} occurrences={occurrences} initialPackages={packages} />
      </div>
    </div>
  );
}
