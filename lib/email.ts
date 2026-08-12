import { Resend } from 'resend';

// Server-only, mirrors lib/ai/estimateFoodPhoto.ts's graceful-degradation contract: reads
// RESEND_API_KEY the same way lib/supabase/admin.ts reads SUPABASE_SERVICE_ROLE_KEY (server-only,
// never NEXT_PUBLIC_), and a missing key means "skip sending" rather than throwing -- callers
// (composeCommunication, the send-communications cron route) already have working in-app-message
// delivery, so a broadcast shouldn't fail outright just because email isn't configured yet.
//
// RESEND_FROM_EMAIL defaults to Resend's shared sandbox address, which sends without a verified
// domain but only actually delivers to the Resend account's own verified address -- fine for
// getting this wired up, but real client delivery needs a verified sending domain + a real
// RESEND_FROM_EMAIL set in Vercel.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Ballistic Performance <onboarding@resend.dev>';
const BATCH_SIZE = 100; // Resend's batch endpoint caps at 100 emails per call.

export interface BroadcastEmailResult {
  sent: number;
  skipped: boolean; // true when RESEND_API_KEY isn't set -- nothing was attempted
}

// Shared by both call sites (composeCommunication's immediate-send path and the cron route's
// scheduled-send pass) -- no explicit subject field on the compose form, so it's derived from
// the message itself, same "don't ask for input the message already implies" call as elsewhere
// this session.
export function subjectFromMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) return 'A message from your coach';
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

export function messageToHtml(message: string): string {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br />')}</p>`;
}

export async function sendBroadcastEmail(
  recipients: { email: string }[],
  subject: string,
  html: string
): Promise<BroadcastEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || recipients.length === 0) {
    return { sent: 0, skipped: !apiKey };
  }

  const resend = new Resend(apiKey);
  let sent = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await resend.batch.send(
        chunk.map((r) => ({ from: FROM_EMAIL, to: r.email, subject, html }))
      );
      if (!error) sent += chunk.length;
    } catch {
      // Best-effort: one failed chunk shouldn't stop the rest, or block the in-app message
      // channel that already succeeded by the time this is called.
    }
  }

  return { sent, skipped: false };
}
