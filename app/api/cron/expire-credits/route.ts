import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/jobRuns';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import { expiryWarningDetail, sendExpiryWarnings } from '@/lib/creditExpiryWarning';

// Triggered daily by Vercel Cron (see vercel.json). Mirrors replenish-memberships/route.ts:
// expire_bonus_credits is idempotent and catch-up safe (only processes grants past their
// expires_at that haven't already been swept), so a missed run just catches up next time.
// Then the warnings for bonus credits that expire in the next few days (RO16, migration 0177): once per grant, recorded by the
// database, so running the job again (the same day or any day after) never warns twice. Expiry runs first, so nothing already swept is
// warned about. Without the migration the warnings are skipped and the expiry still counts as done.
export async function GET(request: Request) {
  // Refuses everyone when the secret is not set (lib/cronAuth.ts), instead of accepting "Bearer undefined".
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('expire_bonus_credits');
  if (error) {
    await recordJobRun('expire-credits', false, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const warnings = await sendExpiryWarnings(admin, (memberId, payload) =>
    pushQuietly('credits expiring', () => sendPushToClient(memberId, payload))
  );
  await recordJobRun('expire-credits', warnings.state !== 'failed', `swept: ${JSON.stringify(data)}; ${expiryWarningDetail(warnings)}`);
  return NextResponse.json({ sweptCount: data, warned: warnings.state === 'sent' ? warnings.warned : 0 });
}
