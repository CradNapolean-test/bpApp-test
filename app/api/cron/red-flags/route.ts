import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/jobRuns';

// Triggered daily by Vercel Cron (see vercel.json). Writes last week's Red Flag list for every gym so it is
// ready on Monday morning. Safe to run any number of times: a week that already exists is left exactly as it is.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('generate_all_red_flag_weeks');
  if (error) {
    await recordJobRun('red-flags', false, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await recordJobRun('red-flags', true, `entries written: ${JSON.stringify(data)}`);
  return NextResponse.json({ entriesWritten: data });
}
