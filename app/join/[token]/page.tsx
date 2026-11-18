import { createAdminClient } from '@/lib/supabase/admin';
import { AuthFrame, authCard } from '@/app/_components/AuthFrame';
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

  if (!link?.active) {
    return <AuthFrame title="This link isn't active" lead="Ask your coach for a new sign-up link." />;
  }
  return (
    <AuthFrame
      title="Join Ballistic"
      lead={
        <>
          {coachName ? `${coachName} has invited you. ` : ''}Create your login, then answer a few quick questions and we&apos;ll set up your
          plan. It takes about 3 minutes.
        </>
      }
    >
      <div className={authCard}>
        <JoinForm token={token} />
      </div>
    </AuthFrame>
  );
}
