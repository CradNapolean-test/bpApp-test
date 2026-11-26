'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyAfterMessage } from '@/lib/chatNotify';
import { sessionMessageProblem } from '@/lib/sessionMessage';
import { rpcFailure } from './migrationCheck';

// "Message everyone booked" on a session (BK16). The database writes the messages (message_session_booked, migration 0178): it checks the
// caller is a coach at the session's gym and writes one message into the chat of each member booked into that session on that date, and
// no one else. A coach can't post into a colleague's member's chat themselves (the chat's insert rule is the member's own coach only),
// which is why it is a database function. Each member is then pinged the way a coach's chat message always pings them (lib/chatNotify.ts,
// after the response has gone), only for the messages actually written.
//
// Before migration 0178 is applied it says so and sends nothing.
export async function messageEveryoneBooked(
  classId: string,
  date: string,
  text: string
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const problem = sessionMessageProblem(text);
  if (problem) return { ok: false, error: problem };
  const body = text.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const { data, error } = await supabase.rpc('message_session_booked', { p_class_id: classId, p_date: date, p_text: body });
  if (error) {
    const failed = rpcFailure(error, '0178', 'Could not send the message');
    return { ok: false, error: failed.ok ? 'Could not send the message' : failed.error };
  }
  const rows = (Array.isArray(data) ? data : []) as { member_id: string; message_id: string; sent_at: string }[];
  after(() =>
    Promise.allSettled(rows.map((r) => notifyAfterMessage({ senderId: user.id, clientId: r.member_id, preview: body, createdAt: r.sent_at })))
  );
  return { ok: true, sent: rows.length };
}
