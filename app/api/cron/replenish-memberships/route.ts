import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/jobRuns';

// Triggered daily by Vercel Cron (see vercel.json). Deliberately daily rather than
// weekly: the underlying RPC only resets memberships whose last_reset_week isn't the
// current ISO week, so a missed run just catches up on the next one instead of silently
// skipping a week or double-resetting.
export async function GET(request: Request) {
  // Refuses everyone when the secret is not set (lib/cronAuth.ts), instead of accepting "Bearer undefined".
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('replenish_due_memberships');
  if (error) {
    await recordJobRun('replenish-memberships', false, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordJobRun('replenish-memberships', true, `reset: ${JSON.stringify(data)}`);
  return NextResponse.json({ resetCount: data });
}
