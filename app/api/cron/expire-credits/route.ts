import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Triggered daily by Vercel Cron (see vercel.json). Mirrors replenish-memberships/route.ts:
// expire_bonus_credits is idempotent and catch-up safe (only processes grants past their
// expires_at that haven't already been swept), so a missed run just catches up next time.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('expire_bonus_credits');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sweptCount: data });
}
