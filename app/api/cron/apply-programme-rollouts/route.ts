import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/jobRuns';

// Triggered daily by Vercel Cron (see vercel.json). Gives every scheduled programme rollout whose
// start date has arrived to the members it covers; the work happens in Postgres
// (apply_due_programme_rollouts), which uses each gym's own timezone to decide what is due.
export async function GET(request: Request) {
  // Refuses everyone when the secret is not set (lib/cronAuth.ts), instead of accepting "Bearer undefined".
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('apply_due_programme_rollouts');
  if (error) {
    await recordJobRun('apply-programme-rollouts', false, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await recordJobRun('apply-programme-rollouts', true, `programmes started: ${JSON.stringify(data)}`);
  return NextResponse.json({ programmesStarted: data });
}
