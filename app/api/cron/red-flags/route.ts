import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Triggered daily by Vercel Cron (see vercel.json). Writes last week's Red Flag list for every gym so it is
// ready on Monday morning. Safe to run any number of times: a week that already exists is left exactly as it is.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('generate_all_red_flag_weeks');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entriesWritten: data });
}
