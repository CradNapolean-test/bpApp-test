import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GYM_CHANGED_MESSAGE, gymMatches } from '@/lib/data/gymGuard';
import { ACCOUNT_NOT_ADDED, createAccountWithRollback, isValidEmail, normaliseEmail } from '@/lib/accountCreation';
import { authSteps, makePasswordSetLink, requestOrigin } from '@/lib/accountsServer';
import { LOGIN_ON, mayEnableLogin, mayManageGym } from '@/lib/gymAccess';
import { prettyName } from '@/lib/gymNames';

// Adds a coach to a gym: by a gym admin for their own gym, or by the organisation's owner for any of its gyms (body.gymId). An email that
// already belongs to a coach account is added to the gym (a dual-gym coach doesn't need a second login) and the answer says so, with their
// name, so nobody is attached silently; a new email gets a new login and a one-time password-set link, never a typed password (CM2).
//
// body: { email, expectedGymId?: string | null }            gym admin: the gym the page was drawn for
//       { email, gymId: string }                            owner: the gym being managed
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
    .select('role, gym_id, is_gym_admin, organisation_id')
    .eq('id', user.id)
    .single();

  const isOwner = callerProfile?.role === 'owner';
  const isGymAdmin = callerProfile?.role === 'coach' && callerProfile.is_gym_admin === true;
  if (!isOwner && !isGymAdmin) {
    return NextResponse.json({ error: 'Only a gym admin or the owner can add coaches' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = normaliseEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // Which gym: the owner names it (and must own it); a gym admin adds to the gym their page was drawn for.
  let gymId: string;
  if (isOwner) {
    gymId = typeof body?.gymId === 'string' ? body.gymId : '';
    const { data: gym } = gymId ? await supabase.from('gyms').select('organisation_id').eq('id', gymId).maybeSingle() : { data: null };
    const allowed = mayManageGym({
      role: 'owner',
      myOrganisationId: (callerProfile?.organisation_id as string | null | undefined) ?? null,
      gymOrganisationId: (gym?.organisation_id as string | null | undefined) ?? null,
      isAdminOfGym: false,
    });
    if (!allowed) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  } else {
    // The page sends the gym it was drawn for; a tab left open on an old gym must not add the coach to the new one (R28).
    if (!gymMatches(body?.expectedGymId, callerProfile?.gym_id ?? null)) {
      return NextResponse.json({ error: GYM_CHANGED_MESSAGE }, { status: 409 });
    }
    gymId = callerProfile?.gym_id ?? '';
    if (!gymId) return NextResponse.json({ error: 'You are not set up at a gym yet' }, { status: 400 });
  }

  const admin = createAdminClient();

  // An address already in use. Looked up through the admin client because the caller has no row level visibility into an account at a
  // different gym; the permission to attach it comes from the gym functions below, run as the caller. Wildcard characters are escaped so
  // an address with an underscore matches only itself.
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: existing } = await admin.from('profiles').select('id, role, display_name, deactivated_at').ilike('email', pattern).maybeSingle();

  if (existing) {
    // Whether it is a member, an owner or a coach elsewhere, the answer is the same sentence, so an address cannot be probed for what it is.
    if (existing.role !== 'coach') {
      return NextResponse.json({ error: ACCOUNT_NOT_ADDED }, { status: 409 });
    }
    if (existing.deactivated_at) {
      // A switched-off login comes back only through the owner (it was switched off because they were removed from their last gym).
      if (!isOwner) return NextResponse.json({ error: ACCOUNT_NOT_ADDED }, { status: 409 });
      const verdict = mayEnableLogin({ role: 'coach', deactivatedAt: existing.deactivated_at as string, gymCount: 0 });
      if (verdict.ok) {
        const { error: banError } = await admin.auth.admin.updateUserById(existing.id as string, { ban_duration: LOGIN_ON });
        if (banError) {
          Sentry.captureException(new Error(`create-coach reactivate: ${banError.message}`), { tags: { area: 'accounts' } });
          return NextResponse.json({ error: 'We could not switch that login back on. Please try again.' }, { status: 500 });
        }
        await admin.from('profiles').update({ deactivated_at: null }).eq('id', existing.id);
      }
    }
    const { error: membershipError } = isOwner
      ? await supabase.rpc('owner_add_coach_to_gym', { p_gym: gymId, p_coach: existing.id, p_is_admin: false })
      : await supabase.rpc('add_coach_to_gym', { p_coach_id: existing.id, p_is_admin: false });
    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }
    const name = (existing.display_name as string | null)?.trim() || prettyName(email);
    return NextResponse.json({ email, existingAccount: true, name });
  }

  let coachId = '';
  const created = await createAccountWithRollback(
    authSteps(admin, async (id) => {
      coachId = id;
      const { error: profileError } = await admin.from('profiles').insert({ id, role: 'coach', gym_id: gymId, email });
      if (profileError) {
        Sentry.captureException(new Error(`create-coach profile insert: ${profileError.message}`), { tags: { area: 'accounts' } });
        return { error: 'We could not set up that account. Nothing was created. Please try again.' };
      }
      const { error: membershipError } = await admin.from('coach_gym_memberships').insert({ coach_id: id, gym_id: gymId, is_gym_admin: false });
      if (membershipError) {
        Sentry.captureException(new Error(`create-coach membership insert: ${membershipError.message}`), { tags: { area: 'accounts' } });
        return { error: 'We could not set up that account. Nothing was created. Please try again.' };
      }
      return null;
    }),
    email
  );
  if (!created.ok) {
    if (!created.rolledBack && created.reason === 'failed' && coachId) {
      Sentry.captureMessage('create-coach: a login could not be removed after a failed setup', { level: 'error', tags: { area: 'accounts' } });
    }
    return NextResponse.json({ error: created.error }, { status: created.reason === 'taken' ? 409 : 500 });
  }

  const link = await makePasswordSetLink(admin, email, requestOrigin(request));
  if ('error' in link) {
    return NextResponse.json({ email, coachId: created.id, existingAccount: false, name: prettyName(email), link: null, warning: link.error });
  }
  return NextResponse.json({ email, coachId: created.id, existingAccount: false, name: prettyName(email), link: link.link });
}
