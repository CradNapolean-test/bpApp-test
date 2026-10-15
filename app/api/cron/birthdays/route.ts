import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPersonalisedEmails } from '@/lib/email';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import { BIRTHDAY_MESSAGE, BIRTHDAY_SUBJECT, birthdayMessage, isBirthdayToday } from '@/lib/birthdays';
import { loadBirthdayCandidates, type BirthdayCandidate } from '@/lib/birthdaysQuery';
import { recordJobRun } from '@/lib/jobRuns';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';

// Triggered daily by Vercel Cron (see vercel.json). Sends a birthday email (and a push) to each member
// whose birthday is today in their own timezone. birthday_emails_sent (one row per member per year)
// makes a re-run harmless. Members who turned email notifications off get the push only, and members
// who turned notifications off get the email only.
//
// Members are read page by page (CM6): the database returns at most 1,000 rows per request, so one query used to miss everyone after
// row 1,000.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { rows: clients, error, truncated } = await loadBirthdayCandidates((from, to) =>
    admin
      .from('client_profiles')
      .select('client_id, name, date_of_birth, timezone, email_notifications_enabled, notifications_enabled')
      .not('date_of_birth', 'is', null)
      .order('client_id')
      .range(from, to) as unknown as PromiseLike<{ data: BirthdayCandidate[] | null; error: { message?: string } | null }>
  );
  if (error) {
    await recordJobRun('birthdays', false, `read failed: ${error.message ?? 'unknown'}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = clients.filter((c) => isBirthdayToday(c.date_of_birth, todayIsoInTz(c.timezone ?? DEFAULT_TIMEZONE)));
  if (due.length === 0) {
    await recordJobRun('birthdays', true, `0 due of ${clients.length} members${truncated ? ' (list cut short)' : ''}`);
    return NextResponse.json({ birthdays: 0, emailsSent: 0 });
  }

  const year = Number(todayIsoInTz(DEFAULT_TIMEZONE).slice(0, 4));
  const ids = due.map((c) => c.client_id);
  const { data: already } = await admin.from('birthday_emails_sent').select('client_id').eq('year', year).in('client_id', ids);
  const done = new Set((already ?? []).map((r) => r.client_id as string));
  const todo = due.filter((c) => !done.has(c.client_id));
  if (todo.length === 0) {
    await recordJobRun('birthdays', true, `${due.length} due, all already sent`);
    return NextResponse.json({ birthdays: due.length, emailsSent: 0 });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email')
    .in('id', todo.map((c) => c.client_id));
  const emailBy = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));

  const recipients = todo
    .filter((c) => c.email_notifications_enabled !== false && emailBy.get(c.client_id))
    .map((c) => ({ email: emailBy.get(c.client_id) as string, name: c.name, memberId: c.client_id }));
  const emailResult = await sendPersonalisedEmails(recipients, BIRTHDAY_MESSAGE, BIRTHDAY_SUBJECT);

  let pushSent = 0;
  let pushFailed = 0;
  await Promise.all(
    todo
      .filter((c) => c.notifications_enabled !== false)
      .map(async (c) => {
        const result = await pushQuietly('birthday', () =>
          sendPushToClient(c.client_id, { title: 'Happy birthday!', body: birthdayMessage(c.name).split('\n')[0], url: '/dashboard' })
        );
        pushSent += result?.sent ?? 0;
        pushFailed += result?.failed ?? (result ? 0 : 1);
      })
  );

  // Record the send only when email actually went (or there was nothing to email, or email is not
  // configured), so a failed email batch retries on the next run instead of being lost.
  if (emailResult.skipped || emailResult.sent > 0 || recipients.length === 0) {
    await admin.from('birthday_emails_sent').upsert(
      todo.map((c) => ({ client_id: c.client_id, year })),
      { onConflict: 'client_id,year' }
    );
  }

  const detail = `${due.length} due, emails sent ${emailResult.sent} failed ${emailResult.failed}${emailResult.skipped ? ' (email not set up)' : ''}, push sent ${pushSent} failed ${pushFailed}${truncated ? ', member list cut short' : ''}`;
  await recordJobRun('birthdays', !(emailResult.failed > 0 && emailResult.sent === 0), detail);
  return NextResponse.json({ birthdays: due.length, emailsSent: emailResult.sent, emailsFailed: emailResult.failed });
}
