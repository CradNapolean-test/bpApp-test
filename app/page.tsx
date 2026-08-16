import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/app/_components/SignOutButton';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // maybeSingle, not single -- a user created directly in Supabase Auth (bypassing the app's
  // own account-creation flows, which always insert this row) has no profiles row at all.
  // single() throws on zero rows; the old code ignored that error and fell through to a
  // guessed role, which /dashboard and /coach would then also reject and redirect away from
  // -- with no explicit "no profile" terminal state anywhere, that produced an actual infinite
  // redirect loop between /dashboard and /coach. This is the one place that guess gets made,
  // so it's the one place that needs to stop and say so instead of guessing.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-black dark:text-zinc-50">Account setup isn&apos;t complete</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          Your login works, but there&apos;s no profile set up for this account yet. Contact your coach to finish
          setting it up.
        </p>
        <SignOutButton />
      </div>
    );
  }

  redirect(profile.role === 'coach' ? '/coach' : '/dashboard');
}
