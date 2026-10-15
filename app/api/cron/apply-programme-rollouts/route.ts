import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/jobRuns';

// Triggered daily by Vercel Cron (see vercel.json). Gives every scheduled programme rollout whose
// start date has arrived to the members it covers; the work happens in Postgres
// (apply_due_programme_rollouts), which uses each gym's own timezone to decide what is due.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
