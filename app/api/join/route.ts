import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Public endpoint behind a coach's sign-up link: creates a member login attached to that coach
// and their gym. It needs the link's token (the secret) and grants nothing beyond a bare account:
// no membership, credits or access to anyone else's data. The browser then signs in with the
// password it just chose.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token: string | undefined = body?.token;
  const email: string = String(body?.email ?? '').trim().toLowerCase();
  const password: string = String(body?.password ?? '');

  if (!token) return NextResponse.json({ error: 'This sign-up link is not valid.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your password needs at least 8 characters.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('onboarding_links')
    .select('coach_id, active')
    .eq('token', token)
    .maybeSingle();
  if (!link || !link.active) {
    return NextResponse.json({ error: 'This sign-up link is no longer active. Ask your coach for a new one.' }, { status: 400 });
  }

  const { data: coach } = await admin.from('profiles').select('gym_id').eq('id', link.coach_id).maybeSingle();

  const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createUserError) {
    const exists = /already|registered|exists/i.test(createUserError.message);
    return NextResponse.json(
      { error: exists ? 'There is already an account with that email. Try logging in instead.' : createUserError.message },
      { status: exists ? 409 : 400 }
    );
  }

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: newUser.user.id, role: 'client', coach_id: link.coach_id, gym_id: coach?.gym_id ?? null, email });
  if (profileError) {
    // Don't leave an orphan login that can't be used.
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: 'Could not set up your account. Please try again.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
