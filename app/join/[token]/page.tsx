import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/app/_components/Logo';
import { LegalFooterLinks } from '@/app/_components/LegalFooterLinks';
import { JoinForm } from './JoinForm';

export const metadata = { title: 'Join Ballistic Performance' };

// Public page behind a coach's sign-up link. Looks the token up with the admin client (the
// onboarding_links table is coach-only under RLS) and only ever shows the coach's first name.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from('onboarding_links')
    .select('coach_id, active')
    .eq('token', token)
    .maybeSingle();

  let coachName: string | null = null;
  if (link?.active) {
    const { data: coach } = await admin.from('profiles').select('email, display_name').eq('id', link.coach_id).maybeSingle();
    coachName = (coach as { display_name?: string | null } | null)?.display_name?.split(' ')[0] ?? null;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 py-8 dark:bg-black">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="full" size={88} />
          {link?.active ? (
            <>
              <h1 className="text-xl font-bold text-black dark:text-zinc-50">Welcome to Ballistic Performance</h1>
              <p className="text-sm text-zinc-500">
                {coachName ? `${coachName} has invited you. ` : ''}Create your login, then answer a few quick questions and
                we&apos;ll set up your plan. It takes about 3 minutes.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-black dark:text-zinc-50">This link isn&apos;t active</h1>
              <p className="text-sm text-zinc-500">Ask your coach for a new sign-up link.</p>
            </>
          )}
        </div>
        {link?.active && <JoinForm token={token} />}
      </div>
      <LegalFooterLinks />
    </div>
  );
}
