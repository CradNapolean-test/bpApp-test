import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GYM_CHANGED_MESSAGE, gymMatches } from '@/lib/data/gymGuard';
import { IMPORT_BATCH_SIZE, createAccountWithRollback, isValidEmail, normaliseEmail, type ImportRow } from '@/lib/accountCreation';
import { authSteps, makePasswordSetLink, requestOrigin } from '@/lib/accountsServer';

// Bulk version of create-client/route.ts's single-account flow -- same steps, looped, with per-row success/failure instead of failing the
// whole batch on one bad row (a coach pasting 40 emails from a spreadsheet shouldn't lose the other 39 because one already exists).
//
// A request handles at most one batch (IMPORT_BATCH_SIZE addresses). Creating 200 logins one by one inside one request could run out of time
// partway, leaving accounts that exist with no link to give out; the screen sends the list in batches and shows progress (CM2).
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
  // The page sends the gym it was drawn for; a tab left open on an old gym must not add the members to the new one (R28).
  if (!gymMatches(body?.expectedGymId, callerProfile.gym_id)) {
    return NextResponse.json({ error: GYM_CHANGED_MESSAGE }, { status: 409 });
  }
  const emails: unknown = body?.emails;
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: 'emails must be a non-empty array' }, { status: 400 });
  }
  if (emails.length > IMPORT_BATCH_SIZE) {
    return NextResponse.json({ error: `Send at most ${IMPORT_BATCH_SIZE} emails at a time` }, { status: 400 });
  }

  const admin = createAdminClient();
  const origin = requestOrigin(request);

  const { data: defaultTemplate } = await admin
    .from('form_templates')
    .select('id, name')
    .eq('gym_id', callerProfile.gym_id)
    .eq('is_default_onboarding', true)
    .maybeSingle();

  const results: ImportRow[] = [];
  const seen = new Set<string>();

  for (const raw of emails as unknown[]) {
    const email = normaliseEmail(raw);
    if (!isValidEmail(email)) {
      results.push({ email: typeof raw === 'string' ? raw.trim() : '', error: 'Not a valid email' });
      continue;
    }
    if (seen.has(email)) {
      results.push({ email, error: 'Listed twice' });
      continue;
    }
    seen.add(email);

    const created = await createAccountWithRollback(
      authSteps(admin, async (id) => {
        const { error } = await admin.from('profiles').insert({ id, role: 'client', coach_id: user.id, gym_id: callerProfile.gym_id, email });
        if (error) {
          Sentry.captureException(new Error(`import-clients profile insert: ${error.message}`), { tags: { area: 'accounts' } });
          return { error: 'Could not set up the account' };
        }
        return null;
      }),
      email
    );
    if (!created.ok) {
      results.push({ email, error: created.error });
      continue;
    }

    if (defaultTemplate) {
      await admin.from('form_assignments').insert({ template_id: defaultTemplate.id, client_id: created.id });
      await admin
        .from('notifications')
        .insert({ client_id: created.id, message: `Welcome! Please fill out: ${defaultTemplate.name}` });
    }

    const link = await makePasswordSetLink(admin, email, origin);
    results.push('error' in link ? { email, error: 'Added, but the sign-in link failed. Use "Send password reset link" on the member\'s page.' } : { email, link: link.link });
  }

  return NextResponse.json({ results });
}
