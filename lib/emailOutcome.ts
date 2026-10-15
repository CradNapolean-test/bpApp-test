import { skipSentence, type EmailSkipReason } from './emailConfig';

// What happened to a broadcast's email, and what to do next (CM1). A broadcast is stamped "email sent" only when at least one email really
// went. When none did, the row says why and the daily job tries again a few times; a half-sent broadcast is never re-sent, because that
// would email the people who already got it twice.

export interface EmailResult {
  sent: number;
  failed: number;
  // true when nothing was attempted (no key, or no real sender in production); `reason` says which.
  skipped: boolean;
  reason?: EmailSkipReason;
  // The first provider error, with email addresses removed. Short.
  error?: string;
}

export const MAX_EMAIL_ATTEMPTS = 3;
// A broadcast older than this is not emailed late ("class tonight" three days on is worse than silence).
export const EMAIL_RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface EmailRowPatch {
  email_sent_at?: string;
  email_sent_count: number;
  email_failed_count: number;
  email_error: string | null;
  email_attempts: number;
  email_last_attempt_at: string;
}

// What to write on the broadcast row after an attempt.
export function emailRowPatch(result: EmailResult, previousAttempts: number, nowIso: string): EmailRowPatch {
  const base = { email_sent_count: result.sent, email_failed_count: result.failed, email_last_attempt_at: nowIso };
  if (result.skipped) {
    // Nothing was tried, so it does not use up an attempt: it goes when email is set up (inside the retry window).
    return { ...base, email_error: result.reason ?? 'not-configured', email_attempts: previousAttempts };
  }
  if (result.sent > 0) {
    return { ...base, email_sent_at: nowIso, email_error: result.failed > 0 ? (result.error ?? 'some emails failed') : null, email_attempts: previousAttempts + 1 };
  }
  if (result.failed > 0) {
    return { ...base, email_error: result.error ?? 'the emails failed', email_attempts: previousAttempts + 1 };
  }
  // Nobody to email (everyone opted out, or no addresses): finished.
  return { ...base, email_sent_at: nowIso, email_error: null, email_attempts: previousAttempts };
}

export interface RetryRow {
  sent_at: string | null;
  email_sent_at: string | null;
  email_attempts?: number | null;
}

// Whether the daily job should try this broadcast's email again.
export function shouldRetryEmail(row: RetryRow, nowMs: number): boolean {
  if (row.email_sent_at || !row.sent_at) return false;
  if ((row.email_attempts ?? 0) >= MAX_EMAIL_ATTEMPTS) return false;
  return nowMs - new Date(row.sent_at).getTime() <= EMAIL_RETRY_WINDOW_MS;
}

// A sentence for the coach straight after sending, or null when everything went.
export function emailNotice(result: EmailResult): string | null {
  if (result.skipped) return `${skipSentence(result.reason)} The message was sent in the app only.`;
  if (result.sent === 0 && result.failed > 0) return 'The email did not go through. The message was sent in the app; the email will be tried again.';
  if (result.failed > 0) return `Email: ${result.sent} sent, ${result.failed} failed.`;
  return null;
}

export interface StatusRow extends RetryRow {
  email_sent_count?: number | null;
  email_failed_count?: number | null;
  email_error?: string | null;
}

// The words next to a broadcast in the history list.
export function emailStatusLabel(row: StatusRow): string {
  const sent = row.email_sent_count ?? null;
  const failed = row.email_failed_count ?? 0;
  if (row.email_sent_at) {
    if (failed > 0) return `email: ${sent ?? 0} sent, ${failed} failed`;
    return sent != null ? `email sent to ${sent}` : 'email sent';
  }
  if (row.email_error === 'sender-not-configured' || row.email_error === 'no-key') return 'email not sent: not set up yet';
  if ((row.email_attempts ?? 0) >= MAX_EMAIL_ATTEMPTS) return `email failed (${failed} not delivered)`;
  if (row.email_error) return 'email not sent yet, will retry';
  return 'email waiting';
}
