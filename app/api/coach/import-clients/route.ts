import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GYM_CHANGED_MESSAGE, gymMatches } from '@/lib/data/gymGuard';
import { IMPORT_BATCH_SIZE, createAccountWithRollback, isValidEmail, normaliseEmail, type ImportRow } from '@/lib/accountCreation';
import { authSteps, makePasswordSetLink, requestOrigin } from '@/lib/accountsServer';
import { recordSignInLink } from '@/lib/signInLinks';

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
  let unrecorded = 0;

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
    if ('error' in link) {
      results.push({ email, error: 'Added, but the sign-in link failed. Use "Send password reset link" on the member\'s page.' });
      continue;
    }
    // Every sign-in link is recorded before it goes into the coach's file (D22, sign_in_links, migration 0171). The member is added
    // either way; a link that cannot be recorded is left out of the file.
    const recorded = await recordSignInLink(admin, { gymId: callerProfile.gym_id, madeBy: user.id, madeFor: created.id, kind: 'member' });
    if (!recorded) {
      unrecorded += 1;
      results.push({ email, error: 'Added, but the sign-in link could not be recorded, so it is not in the file. Use "Send password reset link" on the member\'s page.' });
      continue;
    }
    results.push({ email, link: link.link });
  }

  if (unrecorded > 0) {
    Sentry.captureMessage(`import-clients: could not record ${unrecorded} sign-in link(s)`, { level: 'error', tags: { area: 'accounts' } });
  }
  return NextResponse.json({ results });
}
