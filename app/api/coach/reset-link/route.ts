import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBroadcastEmail } from '@/lib/email';
import { mayMakeResetLink } from '@/lib/gymAccess';
import { makePasswordSetLink, requestOrigin } from '@/lib/accountsServer';
import { LINK_NOT_RECORDED, recordSignInLink } from '@/lib/signInLinks';

// A coach makes a one-time "choose a new password" link for one of their members (CL6) and, when email is set up, emails it to the member.
// The coach gets the link too, to copy, because email is not always set up and a member who has lost access may not see it.
// Every link is recorded (D22, sign_in_links, migration 0171) before it is shown or emailed; one that cannot be recorded is not given out.
//
// body: { clientId: string }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { clientId?: unknown } | null;
  const clientId = typeof body?.clientId === 'string' ? body.clientId : '';
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'coach') return NextResponse.json({ error: 'Only coaches can do this' }, { status: 403 });

  // The member as the caller can see them (row level security); anything they cannot read is "not found".
  const { data: member } = await supabase.from('profiles').select('id, email, role, coach_id, gym_id').eq('id', clientId).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const { data: membership } = member.gym_id
    ? await supabase.from('coach_gym_memberships').select('is_gym_admin').eq('coach_id', user.id).eq('gym_id', member.gym_id).maybeSingle()
    : { data: null };
  const allowed = mayMakeResetLink({
    callerId: user.id,
    callerIsAdminOfMemberGym: membership?.is_gym_admin === true,
    member: { role: (member.role as string | null) ?? null, coachId: (member.coach_id as string | null) ?? null },
  });
  if (!allowed) return NextResponse.json({ error: 'Only their coach or a gym admin can do this' }, { status: 403 });
  if (!member.email) return NextResponse.json({ error: 'This member has no email address on file' }, { status: 409 });

  const admin = createAdminClient();
  const link = await makePasswordSetLink(admin, member.email as string, requestOrigin(request));
  if ('error' in link) {
    Sentry.captureMessage('reset-link: could not make a link', { level: 'warning', tags: { area: 'accounts' } });
    return NextResponse.json({ error: link.error }, { status: 500 });
  }

  const recorded = await recordSignInLink(admin, {
    gymId: (member.gym_id as string | null) ?? null,
    madeBy: user.id,
    madeFor: member.id as string,
    kind: 'member',
  });
  if (!recorded) {
    Sentry.captureMessage('reset-link: could not record a link', { level: 'error', tags: { area: 'accounts' } });
    return NextResponse.json({ error: LINK_NOT_RECORDED }, { status: 500 });
  }

  const href = link.link.replace(/&/g, '&amp;');
  const emailed = await sendBroadcastEmail(
    [{ email: member.email as string }],
    'Choose a new password',
    `<p>Hi,</p><p>Your coach sent you a link to choose a new password for your Ballistic login.</p><p><a href="${href}">Choose a new password</a></p><p>The link works once and runs out after about an hour. If you did not expect this, you can ignore this email.</p>`
  ).catch(() => ({ sent: 0, skipped: false }));

  return NextResponse.json({ link: link.link, email: member.email, emailed: emailed.sent > 0, emailSkipped: emailed.skipped });
}
