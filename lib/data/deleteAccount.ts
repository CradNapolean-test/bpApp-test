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

  const error = await removeMember(user.id);
  if (error) return fail(error, 'Could not delete your account. Please contact the gym.');
  return ok();
}

// The coach deletes one of their own members, with no request from the member: someone who has left, a duplicate,
// a test account. Same clean-up as deleteMyAccount (files, login, every row through the cascades) and just as final.
// Only the member's own coach may do it; a colleague at the same gym only has read access to the member, and coach
// or owner accounts can never be deleted here. Every check is made again on the server with the service-role
// client, so a tampered request for someone else's member, or for a coach, is refused.
//
// The member is not emailed and their membership is not cancelled: the coach handles both with them directly.
export async function deleteMemberAsCoach(clientId: string, confirmation: string): Promise<ActionResult> {
  if (confirmation.trim().toUpperCase() !== 'DELETE') return { ok: false, error: 'Type DELETE to confirm' };
  if (typeof clientId !== 'string' || clientId.length === 0) return { ok: false, error: 'Member not found' };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: 'Please sign in again' };
  if (clientId === user.id) return { ok: false, error: 'You cannot delete your own account here.' };

  const admin = createAdminClient();
  const [{ data: caller }, { data: target }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('profiles').select('role, coach_id').eq('id', clientId).maybeSingle(),
  ]);
  if (caller?.role !== 'coach') return { ok: false, error: 'Only coaches can delete members.' };
  if (!target || target.role !== 'client') return { ok: false, error: 'Member not found' };
  if (target.coach_id !== user.id) return { ok: false, error: "Only this member's own coach can delete them." };

  const error = await removeMember(clientId);
  if (error) return fail(error, 'Could not delete this member. Please try again.');
  return ok();
}

// Removes a member's files from storage, then their login. Deleting the login deletes the profile (profiles.id
// references auth.users on delete cascade) and, through it, the member's rows in every other table. Returns the
// error from deleting the login, or null when the member is gone.
async function removeMember(memberId: string): Promise<{ message?: string } | null> {
  const admin = createAdminClient();

  // Files first, so nothing is left behind if the login deletion succeeds.
  for (const bucket of MEMBER_BUCKETS) {
    for (;;) {
      const { data: files, error } = await admin.storage.from(bucket).list(memberId, { limit: 100 });
      if (error || !files || files.length === 0) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(files.map((f) => `${memberId}/${f.name}`));
      if (removeError) break; // do not loop forever on a stuck file; the account deletion below still goes ahead
    }
  }

  const { error } = await admin.auth.admin.deleteUser(memberId);
  return error ?? null;
}
