import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LOGIN_OFF, LOGIN_ON, mayDisableLogin, mayEnableLogin, mayManageGym } from '@/lib/gymAccess';

// Switches a coach's login off after they were removed from their last gym (CH1), or back on. Removing a coach from a gym only changes
// the database; this is what stops the password working. It can only be used on a coach the database has already marked as having no
// gym left (remove_coach_from_gym sets profiles.deactivated_at), by a gym admin of the gym they were removed from, or by the owner of
// that gym's organisation, so a request that names any other account does nothing.
//
// body: { gymId, coachId, action?: 'deactivate' | 'reactivate' }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { gymId?: unknown; coachId?: unknown; action?: unknown } | null;
  const gymId = typeof body?.gymId === 'string' ? body.gymId : '';
  const coachId = typeof body?.coachId === 'string' ? body.coachId : '';
  const action = body?.action === 'reactivate' ? 'reactivate' : 'deactivate';
  if (!gymId || !coachId) return NextResponse.json({ error: 'gymId and coachId are required' }, { status: 400 });

  // Who is asking, read through their own session (row level security): their role and organisation, whether they are an admin of this gym.
  const [{ data: me }, { data: gym }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('role, organisation_id').eq('id', user.id).maybeSingle(),
    supabase.from('gyms').select('organisation_id').eq('id', gymId).maybeSingle(),
    supabase.from('coach_gym_memberships').select('is_gym_admin').eq('coach_id', user.id).eq('gym_id', gymId).maybeSingle(),
  ]);
  const allowed = mayManageGym({
    role: (me?.role as string | null | undefined) ?? null,
    myOrganisationId: (me?.organisation_id as string | null | undefined) ?? null,
    gymOrganisationId: (gym?.organisation_id as string | null | undefined) ?? null,
    isAdminOfGym: membership?.is_gym_admin === true,
  });
  if (!allowed) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: target }, { count }] = await Promise.all([
    admin.from('profiles').select('role, deactivated_at').eq('id', coachId).maybeSingle(),
    admin.from('coach_gym_memberships').select('coach_id', { count: 'exact', head: true }).eq('coach_id', coachId),
  ]);
  const facts = {
    role: (target?.role as string | null | undefined) ?? null,
    deactivatedAt: (target?.deactivated_at as string | null | undefined) ?? null,
    gymCount: count ?? 0,
  };
  const verdict = action === 'reactivate' ? mayEnableLogin(facts) : mayDisableLogin(facts, user.id, coachId);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 409 });

  const { error: authError } = await admin.auth.admin.updateUserById(coachId, { ban_duration: action === 'reactivate' ? LOGIN_ON : LOGIN_OFF });
  if (authError) {
    Sentry.captureException(new Error(`deactivate-coach: ${authError.message}`), { tags: { area: 'owner' } });
    return NextResponse.json({ error: 'Could not change that login. Please try again.' }, { status: 500 });
  }

  if (action === 'reactivate') {
    const { error } = await admin.from('profiles').update({ deactivated_at: null }).eq('id', coachId);
    if (error) {
      Sentry.captureException(new Error(`deactivate-coach (clear flag): ${error.message}`), { tags: { area: 'owner' } });
      return NextResponse.json({ error: 'The login is back on, but we could not clear the removed flag. Try again.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, active: action === 'reactivate' });
}
