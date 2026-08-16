import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ImportResult {
  email: string;
  password?: string;
  error?: string;
}

// Bulk version of create-client/route.ts's single-account flow -- same admin calls, looped,
// with per-row success/failure instead of failing the whole batch on one bad row (a coach
// pasting 40 emails from a spreadsheet shouldn't lose the other 39 because one already exists).
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
  const emails: unknown = body?.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: 'emails must be a non-empty array' }, { status: 400 });
  }
  if (emails.length > 200) {
    return NextResponse.json({ error: 'Import is limited to 200 emails at a time' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: defaultTemplate } = await admin
    .from('form_templates')
    .select('id, name')
    .eq('gym_id', callerProfile.gym_id)
    .eq('is_default_onboarding', true)
    .maybeSingle();

  const results: ImportResult[] = [];

  for (const raw of emails as unknown[]) {
    const email = typeof raw === 'string' ? raw.trim() : '';
    if (!email || !email.includes('@')) {
      results.push({ email: String(raw), error: 'Not a valid email' });
      continue;
    }

    const password = randomBytes(9).toString('base64url');
    const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createUserError) {
      results.push({ email, error: createUserError.message });
      continue;
    }

    const { error: profileError } = await admin
      .from('profiles')
      .insert({ id: newUser.user.id, role: 'client', coach_id: user.id, gym_id: callerProfile.gym_id, email });
    if (profileError) {
      results.push({ email, error: profileError.message });
      continue;
    }

    if (defaultTemplate) {
      await admin.from('form_assignments').insert({ template_id: defaultTemplate.id, client_id: newUser.user.id });
      await admin
        .from('notifications')
        .insert({ client_id: newUser.user.id, message: `Welcome! Please fill out: ${defaultTemplate.name}` });
    }

    results.push({ email, password });
  }

  return NextResponse.json({ results });
}
