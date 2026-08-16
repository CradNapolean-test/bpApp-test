import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    .insert({ id: newUser.user.id, role: 'client', coach_id: user.id, gym_id: callerProfile.gym_id, email });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
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
      .insert({ template_id: defaultTemplate.id, client_id: newUser.user.id });
    await admin
      .from('notifications')
      .insert({ client_id: newUser.user.id, message: `Welcome! Please fill out: ${defaultTemplate.name}` });
  }

  return NextResponse.json({ email, password, clientId: newUser.user.id });
}
