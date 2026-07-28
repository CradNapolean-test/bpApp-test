import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getClasses } from '@/lib/data/classes';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { ClassManager } from './_components/ClassManager';

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

  const classes = await getClasses();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Classes</h1>
          <Link href="/coach" className="text-sm text-zinc-500 hover:underline">
            &larr; Back to clients
          </Link>
        </div>
        <SignOutButton />
      </div>
      <div className="mt-6">
        <ClassManager initialClasses={classes} />
      </div>
    </div>
  );
}
