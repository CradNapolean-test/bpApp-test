import { describe, expect, it } from 'vitest';
import { EMAIL_RETRY_WINDOW_MS, MAX_EMAIL_ATTEMPTS, emailNotice, emailRowPatch, emailStatusLabel, shouldRetryEmail } from './emailOutcome';

const NOW = '2026-10-16T05:00:00.000Z';
const NOW_MS = new Date(NOW).getTime();

describe('emailRowPatch (stamp only on success)', () => {
  it('stamps when at least one email went', () => {
    const patch = emailRowPatch({ sent: 10, failed: 0, skipped: false }, 0, NOW);
    expect(patch).toMatchObject({ email_sent_at: NOW, email_sent_count: 10, email_failed_count: 0, email_error: null, email_attempts: 1 });
  });

  it('stamps a half-sent broadcast and keeps the failure visible', () => {
    const patch = emailRowPatch({ sent: 8, failed: 2, skipped: false, error: 'rate limited' }, 0, NOW);
    expect(patch.email_sent_at).toBe(NOW);
    expect(patch).toMatchObject({ email_sent_count: 8, email_failed_count: 2, email_error: 'rate limited' });
  });

  it('does NOT stamp when every batch failed, and counts the attempt', () => {
    const patch = emailRowPatch({ sent: 0, failed: 12, skipped: false, error: 'invalid sender' }, 1, NOW);
    expect(patch.email_sent_at).toBeUndefined();
    expect(patch).toMatchObject({ email_sent_count: 0, email_failed_count: 12, email_error: 'invalid sender', email_attempts: 2 });
  });

  it('does NOT stamp when email is not configured, and does not use up an attempt', () => {
    const patch = emailRowPatch({ sent: 0, failed: 0, skipped: true, reason: 'sender-not-configured' }, 0, NOW);
    expect(patch.email_sent_at).toBeUndefined();
    expect(patch).toMatchObject({ email_error: 'sender-not-configured', email_attempts: 0 });
  });

  it('is finished when there was nobody to email', () => {
    const patch = emailRowPatch({ sent: 0, failed: 0, skipped: false }, 0, NOW);
    expect(patch.email_sent_at).toBe(NOW);
    expect(patch.email_error).toBeNull();
  });
});

describe('shouldRetryEmail', () => {
  const sentAt = new Date(NOW_MS - 3600_000).toISOString();

  it('retries a broadcast whose email never went', () => {
    expect(shouldRetryEmail({ sent_at: sentAt, email_sent_at: null, email_attempts: 0 }, NOW_MS)).toBe(true);
    expect(shouldRetryEmail({ sent_at: sentAt, email_sent_at: null, email_attempts: MAX_EMAIL_ATTEMPTS - 1 }, NOW_MS)).toBe(true);
  });

  it('stops after the attempt cap', () => {
    expect(shouldRetryEmail({ sent_at: sentAt, email_sent_at: null, email_attempts: MAX_EMAIL_ATTEMPTS }, NOW_MS)).toBe(false);
  });

  it('never re-sends one that already went, and ignores one not yet processed in the app', () => {
    expect(shouldRetryEmail({ sent_at: sentAt, email_sent_at: NOW, email_attempts: 0 }, NOW_MS)).toBe(false);
    expect(shouldRetryEmail({ sent_at: null, email_sent_at: null, email_attempts: 0 }, NOW_MS)).toBe(false);
  });

  it('does not email a stale broadcast late', () => {
    const old = new Date(NOW_MS - EMAIL_RETRY_WINDOW_MS - 1000).toISOString();
    expect(shouldRetryEmail({ sent_at: old, email_sent_at: null, email_attempts: 0 }, NOW_MS)).toBe(false);
  });

  it('treats a missing attempts count as none', () => {
    expect(shouldRetryEmail({ sent_at: sentAt, email_sent_at: null }, NOW_MS)).toBe(true);
  });
});

describe('emailNotice', () => {
  it('has nothing to say when everything went', () => {
    expect(emailNotice({ sent: 5, failed: 0, skipped: false })).toBeNull();
  });

  it('says email is not set up when the sender is missing', () => {
    expect(emailNotice({ sent: 0, failed: 0, skipped: true, reason: 'sender-not-configured' })).toMatch(/Email is not set up for this gym yet/);
  });

  it('says when none went, and when only some did', () => {
    expect(emailNotice({ sent: 0, failed: 5, skipped: false })).toMatch(/did not go through/);
    expect(emailNotice({ sent: 3, failed: 2, skipped: false })).toBe('Email: 3 sent, 2 failed.');
  });
});

describe('emailStatusLabel', () => {
  it('reads the history line honestly', () => {
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: NOW, email_sent_count: 12 })).toBe('email sent to 12');
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: NOW, email_sent_count: 10, email_failed_count: 2 })).toBe('email: 10 sent, 2 failed');
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: NOW })).toBe('email sent');
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: null, email_error: 'sender-not-configured' })).toBe('email not sent: not set up yet');
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: null, email_error: 'boom', email_attempts: 1 })).toBe('email not sent yet, will retry');
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: null, email_error: 'boom', email_attempts: MAX_EMAIL_ATTEMPTS, email_failed_count: 9 })).toBe('email failed (9 not delivered)');
    expect(emailStatusLabel({ sent_at: NOW, email_sent_at: null })).toBe('email waiting');
  });
});
