import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Mirrors app/api/coach/create-client/route.ts, one level up: a gym admin creating a new
// coach account for their own gym instead of a coach creating a client. Gated on
// is_gym_admin rather than role='coach' -- a plain coach can't provision other coaches.
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
    .select('role, gym_id, is_gym_admin')
    .eq('id', user.id)
    .single();

  if (callerProfile?.role !== 'coach' || !callerProfile.is_gym_admin) {
    return NextResponse.json({ error: 'Only a gym admin can add coaches' }, { status: 403 });
  }

  const body = await request.json();
  const email: string | undefined = body?.email;
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  const password: string = body?.password || randomBytes(9).toString('base64url');

  const admin = createAdminClient();

  const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createUserError) {
    return NextResponse.json({ error: createUserError.message }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: newUser.user.id, role: 'coach', gym_id: callerProfile.gym_id, email });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ email, password, coachId: newUser.user.id });
}
