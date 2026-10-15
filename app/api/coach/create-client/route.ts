import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GYM_CHANGED_MESSAGE, gymMatches } from '@/lib/data/gymGuard';
import { createAccountWithRollback, isValidEmail, normaliseEmail } from '@/lib/accountCreation';
import { authSteps, makePasswordSetLink, requestOrigin } from '@/lib/accountsServer';

// A coach adds one member (CM2). No password is made up and shown: the login is created with a random password nobody sees, and the coach
// is given a one-time link the member opens to choose their own. If the profile cannot be written the login is deleted again.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, gym_id')
    .eq('id', user.id)
    .single();

  if (callerProfile?.role !== 'coach') {
    return NextResponse.json({ error: 'Only coaches can add clients' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  // The page sends the gym it was drawn for; a tab left open on an old gym must not add the member to the new one (R28).
  if (!gymMatches(body?.expectedGymId, callerProfile.gym_id)) {
    return NextResponse.json({ error: GYM_CHANGED_MESSAGE }, { status: 409 });
  }
  const email = normaliseEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const admin = createAdminClient();
  let clientId = '';

  const created = await createAccountWithRollback(
    authSteps(admin, async (id) => {
      clientId = id;
      const { error } = await admin.from('profiles').insert({ id, role: 'client', coach_id: user.id, gym_id: callerProfile.gym_id, email });
      if (error) {
        Sentry.captureException(new Error(`create-client profile insert: ${error.message}`), { tags: { area: 'accounts' } });
        return { error: 'We could not set up that account. Nothing was created. Please try again.' };
      }
      return null;
    }),
    email
  );
  if (!created.ok) {
    if (!created.rolledBack && created.reason === 'failed' && clientId) {
      Sentry.captureMessage('create-client: a login could not be removed after a failed profile insert', { level: 'error', tags: { area: 'accounts' } });
    }
    return NextResponse.json({ error: created.error }, { status: created.reason === 'taken' ? 409 : 500 });
  }

  // Auto-assign the gym's default onboarding form, if one is set -- form_templates is
  // gym-shared (0054), so "default" means one per gym, not per creating coach. Same admin
  // client, bypasses RLS the same way the profiles insert above does.
  const { data: defaultTemplate } = await admin
    .from('form_templates')
    .select('id, name')
    .eq('gym_id', callerProfile.gym_id)
    .eq('is_default_onboarding', true)
    .maybeSingle();

  if (defaultTemplate) {
    await admin
      .from('form_assignments')
      .insert({ template_id: defaultTemplate.id, client_id: created.id });
    await admin
      .from('notifications')
      .insert({ client_id: created.id, message: `Welcome! Please fill out: ${defaultTemplate.name}` });
  }

  const link = await makePasswordSetLink(admin, email, requestOrigin(request));
  if ('error' in link) {
    // The account exists and cannot be used yet: the coach can make a link from the member's page ("Send password reset link").
    return NextResponse.json({ email, clientId: created.id, link: null, warning: link.error });
  }
  return NextResponse.json({ email, clientId: created.id, link: link.link });
}
