import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Triggered daily by Vercel Cron (see vercel.json). The underlying RPC throttles repeat
// reminders to each client's own checkin_reminder_days cadence via last_checkin_reminder_at,
// so a daily trigger doesn't mean daily notifications once someone goes quiet.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('send_checkin_reminders');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ remindersSent: data });
}
