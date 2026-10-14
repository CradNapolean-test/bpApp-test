'use server';

import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendCoachEmail } from '@/lib/email';

const MAX_PER_DAY = 5;
const MAX_SUBJECT = 120;
const MAX_MESSAGE = 4000;

// A member emails their own coach from the app. The coach's address is looked up with the existing
// get_my_coach_email() (0048) so the member never sees it. At most 5 a day per member (coach_email_log,
// written with the service role since members have no access to that table).
export async function emailMyCoach(subject: string, message: string): Promise<ActionResult> {
  const text = message.trim();
  const title = subject.trim() || 'A message from the app';
  if (text.length === 0) return { ok: false, error: 'Write a message first' };
  if (text.length > MAX_MESSAGE || title.length > MAX_SUBJECT) return { ok: false, error: 'That message is too long' };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) return { ok: false, error: 'Please sign in again' };

  const [{ data: coachEmail }, { data: profile }] = await Promise.all([
    supabase.rpc('get_my_coach_email'),
    supabase.from('client_profiles').select('name').eq('client_id', user.id).maybeSingle(),
  ]);
  if (!coachEmail) return { ok: false, error: 'You do not have a coach set up yet' };

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('coach_email_log')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', user.id)
    .gte('sent_at', since);
  if (countError) return fail(countError, 'Could not send your email');
  if ((count ?? 0) >= MAX_PER_DAY) return { ok: false, error: 'You have sent a few emails today. Try the chat, or wait until tomorrow.' };

  const result = await sendCoachEmail({
    to: coachEmail as string,
    replyTo: user.email,
    memberName: (profile?.name as string | null) ?? user.email,
    subject: title,
    message: text,
  });
  if (result.skipped) return { ok: false, error: 'Email is not set up yet. Please use the chat for now.' };
  if (!result.sent) return { ok: false, error: 'The email did not go through. Please try again, or use the chat.' };

  await admin.from('coach_email_log').insert({ client_id: user.id });
  return ok();
}
