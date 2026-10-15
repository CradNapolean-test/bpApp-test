import { isMissingColumnError } from '@/lib/onboarding';
import { emailRowPatch, type EmailResult } from '@/lib/emailOutcome';

// Writes what happened to a broadcast's email onto its row (CM1). Used by the immediate send and by the daily job, so both record the same
// way. If migration 0139 has not been applied the new columns are not there: it falls back to the one thing the old code did, but only when
// something really went, so a failed email is still never marked as sent.

type Updater = {
  from(table: 'scheduled_communications'): {
    update(values: object): { eq(column: 'id', value: string): PromiseLike<{ error: { code?: string; message?: string } | null }> };
  };
};

export async function recordEmailOutcome(client: Updater, id: string, result: EmailResult, previousAttempts: number, nowIso: string = new Date().toISOString()): Promise<void> {
  const patch = emailRowPatch(result, previousAttempts, nowIso);
  const { error } = await client.from('scheduled_communications').update(patch).eq('id', id);
  if (!error) return;
  if (isMissingColumnError(error, 'email_') && patch.email_sent_at) {
    await client.from('scheduled_communications').update({ email_sent_at: patch.email_sent_at }).eq('id', id);
  }
}
