import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPersonalisedEmails } from '@/lib/email';
import { sendPushToClient } from '@/lib/push';
import { BIRTHDAY_MESSAGE, BIRTHDAY_SUBJECT, birthdayMessage, isBirthdayToday } from '@/lib/birthdays';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';

// Triggered daily by Vercel Cron (see vercel.json). Sends a birthday email (and a push) to each member
// whose birthday is today in their own timezone. birthday_emails_sent (one row per member per year)
// makes a re-run harmless. Members who turned email notifications off get the push only.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: clients, error } = await admin
    .from('client_profiles')
    .select('client_id, name, date_of_birth, timezone, email_notifications_enabled, notifications_enabled')
    .not('date_of_birth', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (clients ?? []).filter((c) => isBirthdayToday(c.date_of_birth, todayIsoInTz(c.timezone ?? DEFAULT_TIMEZONE)));
  if (due.length === 0) return NextResponse.json({ birthdays: 0, emailsSent: 0 });

  const year = Number(todayIsoInTz(DEFAULT_TIMEZONE).slice(0, 4));
  const ids = due.map((c) => c.client_id as string);
  const { data: already } = await admin.from('birthday_emails_sent').select('client_id').eq('year', year).in('client_id', ids);
  const done = new Set((already ?? []).map((r) => r.client_id as string));
  const todo = due.filter((c) => !done.has(c.client_id as string));
  if (todo.length === 0) return NextResponse.json({ birthdays: due.length, emailsSent: 0 });

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email')
    .in('id', todo.map((c) => c.client_id as string));
  const emailBy = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  const recipients = todo
    .filter((c) => c.email_notifications_enabled !== false && emailBy.get(c.client_id as string))
    .map((c) => ({ email: emailBy.get(c.client_id as string) as string, name: (c.name as string | null) ?? null }));
  const emailResult = await sendPersonalisedEmails(recipients, BIRTHDAY_MESSAGE, BIRTHDAY_SUBJECT);

  await Promise.all(
    todo
      .filter((c) => c.notifications_enabled !== false)
      .map((c) =>
        sendPushToClient(c.client_id as string, {
          title: 'Happy birthday!',
          body: birthdayMessage(c.name as string | null).split('\n')[0],
          url: '/dashboard',
        }).catch(() => {})
      )
  );

  // Record the send only when email actually went (or there was nothing to email, or email is not
  // configured), so a failed email batch retries on the next run instead of being lost.
  if (emailResult.skipped || emailResult.sent > 0 || recipients.length === 0) {
    await admin.from('birthday_emails_sent').upsert(
      todo.map((c) => ({ client_id: c.client_id, year })),
      { onConflict: 'client_id,year' }
    );
  }

  return NextResponse.json({ birthdays: due.length, emailsSent: emailResult.sent });
}
