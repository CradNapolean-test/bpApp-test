'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { messageToHtml, sendBroadcastEmail } from '@/lib/email';
import { fail, ok, type ActionResult } from './result';

// Buckets that hold a member's files. Every upload path starts with the member's id (`<id>/<file>`).
const MEMBER_BUCKETS = ['progress-photos', 'inbody-scans', 'food-photos', 'chat-photos', 'voice-notes'];

// Deletes the signed-in member's account and everything of theirs: their profile and every row hanging off it
// (logs, photos, messages, bookings, credits history, results...) go through the database's cascades, their files
// are removed from storage, and the login itself is deleted. It cannot be undone. Members only: coach and owner
// accounts own other people's records and are removed by an admin.
//
// This does NOT cancel a membership: the gym still handles that by phone, and the screen says so.
export async function deleteMyAccount(confirmation: string): Promise<ActionResult> {
  if (confirmation.trim().toUpperCase() !== 'DELETE') return { ok: false, error: 'Type DELETE to confirm' };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: 'Please sign in again' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'client') return { ok: false, error: 'Only member accounts can be deleted here. Ask the gym to remove this account.' };

  // Best effort: tell the coach before the data is gone (their name comes from the profile we are about to delete).
  try {
    const [{ data: coachEmail }, { data: cp }] = await Promise.all([
      supabase.rpc('get_my_coach_email'),
      supabase.from('client_profiles').select('name').eq('client_id', user.id).maybeSingle(),
    ]);
    if (coachEmail) {
      await sendBroadcastEmail(
        [{ email: coachEmail as string }],
        'A member deleted their account',
        messageToHtml(`${(cp?.name as string | null) ?? user.email ?? 'A member'} deleted their account and data from the app. If they also want their membership cancelled, that still goes through the gym.`)
      );
    }
  } catch {
    // Never blocks the deletion.
  }

  const admin = createAdminClient();

  // Files first, so nothing is left behind if the login deletion succeeds.
  for (const bucket of MEMBER_BUCKETS) {
    for (;;) {
      const { data: files, error } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
      if (error || !files || files.length === 0) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
      if (removeError) break; // do not loop forever on a stuck file; the account deletion below still goes ahead
    }
  }

  // Deleting the login deletes the profile (profiles.id references auth.users on delete cascade) and, through it,
  // the member's rows in every other table.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return fail(error, 'Could not delete your account. Please contact the gym.');
  return ok();
}
