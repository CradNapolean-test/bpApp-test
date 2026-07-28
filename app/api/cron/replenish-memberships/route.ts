import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Triggered daily by Vercel Cron (see vercel.json). Deliberately daily rather than
// weekly: the underlying RPC only resets memberships whose last_reset_week isn't the
// current ISO week, so a missed run just catches up on the next one instead of silently
// skipping a week or double-resetting.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('replenish_due_memberships');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ resetCount: data });
}
