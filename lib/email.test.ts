import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Resend and Sentry are replaced: nothing here can send a real email.
const batchSend = vi.fn();
const emailSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { batch: { send: batchSend }, emails: { send: emailSend } };
  }),
}));
const captureMessage = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }));

import { appOrigin, scrubAddresses, sendBroadcastEmail, sendCoachEmail, sendPersonalisedEmails } from './email';

const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'NODE_ENV', 'UNSUBSCRIBE_SECRET', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'];
const saved: Record<string, string | undefined> = {};
const env = process.env as Record<string, string | undefined>;

function people(n: number) {
  return Array.from({ length: n }, (_, i) => ({ email: `member${i}@example.com`, name: `Member ${i}`, memberId: `id-${i}` }));
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = env[k];
  for (const k of ENV_KEYS) delete env[k];
  env.RESEND_API_KEY = 'test-key';
  env.RESEND_FROM_EMAIL = 'Gym <hello@example.com>';
  env.NODE_ENV = 'production';
  batchSend.mockReset();
  emailSend.mockReset();
  captureMessage.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe('sender not configured', () => {
  it('in production with no sender, nothing is sent and the reason is returned', async () => {
    delete env.RESEND_FROM_EMAIL;
    const result = await sendPersonalisedEmails(people(3), 'Hi {first name}');
    expect(result).toEqual({ sent: 0, failed: 0, skipped: true, reason: 'sender-not-configured' });
    expect(batchSend).not.toHaveBeenCalled();
  });

  it('with no key, nothing is sent', async () => {
    delete env.RESEND_API_KEY;
    expect(await sendPersonalisedEmails(people(1), 'Hi')).toMatchObject({ skipped: true, reason: 'no-key' });
    expect(await sendBroadcastEmail([{ email: 'a@example.com' }], 's', '<p>x</p>')).toMatchObject({ skipped: true, reason: 'no-key' });
    expect(await sendCoachEmail({ to: 'c@example.com', replyTo: 'm@example.com', memberName: 'M', subject: 's', message: 'x' })).toMatchObject({ sent: false, skipped: true });
  });

  it('outside production the sandbox sender still works for a developer', async () => {
    delete env.RESEND_FROM_EMAIL;
    env.NODE_ENV = 'development';
    batchSend.mockResolvedValue({ data: {}, error: null });
    const result = await sendPersonalisedEmails(people(1), 'Hi');
    expect(result).toMatchObject({ sent: 1, failed: 0, skipped: false });
    expect(batchSend.mock.calls[0][0][0].from).toMatch(/onboarding@resend\.dev/);
  });
});

describe('per-batch counting', () => {
  it('counts every email as sent when every batch works', async () => {
    batchSend.mockResolvedValue({ data: {}, error: null });
    const result = await sendPersonalisedEmails(people(250), 'Hi');
    expect(batchSend).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ sent: 250, failed: 0, skipped: false });
  });

  it('counts a failed batch as failed and carries on with the rest', async () => {
    batchSend
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Rate limit exceeded' } })
      .mockResolvedValueOnce({ data: {}, error: null });
    const result = await sendPersonalisedEmails(people(250), 'Hi');
    expect(result).toMatchObject({ sent: 150, failed: 100, skipped: false, error: 'Rate limit exceeded' });
  });

  it('a thrown error fails that batch the same way', async () => {
    batchSend.mockRejectedValue(new Error('network down'));
    const result = await sendPersonalisedEmails(people(5), 'Hi');
    expect(result).toMatchObject({ sent: 0, failed: 5, error: 'network down' });
  });

  it('reports failures to Sentry with counts and no addresses', async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: 'The address member1@example.com is not allowed' } });
    const result = await sendPersonalisedEmails(people(2), 'Hi');
    expect(result.error).toBe('The address [address] is not allowed');
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const reported = JSON.stringify(captureMessage.mock.calls[0]);
    expect(reported).not.toContain('member1@example.com');
    expect(reported).toContain('"emails":2');
  });

  it('sends nothing for an empty list and says so without calling the provider', async () => {
    expect(await sendPersonalisedEmails([], 'Hi')).toEqual({ sent: 0, failed: 0, skipped: false });
    expect(batchSend).not.toHaveBeenCalled();
  });
});

describe('unsubscribe link and reply-to', () => {
  it('adds List-Unsubscribe headers, the one-click form and a footer link when it can sign one', async () => {
    env.UNSUBSCRIBE_SECRET = 'a-test-secret';
    env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com/';
    batchSend.mockResolvedValue({ data: {}, error: null });
    await sendPersonalisedEmails(people(1), 'Hello {first name}', undefined, { replyTo: 'coach@example.com' });
    const email = batchSend.mock.calls[0][0][0];
    expect(email.headers['List-Unsubscribe']).toMatch(/^<https:\/\/app\.example\.com\/unsubscribe\?t=.+>$/);
    expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(email.html).toContain('/unsubscribe?t=');
    expect(email.replyTo).toBe('coach@example.com');
  });

  it('each member gets their own link', async () => {
    env.UNSUBSCRIBE_SECRET = 'a-test-secret';
    env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
    batchSend.mockResolvedValue({ data: {}, error: null });
    await sendPersonalisedEmails(people(2), 'Hi');
    const [a, b] = batchSend.mock.calls[0][0];
    expect(a.headers['List-Unsubscribe']).not.toBe(b.headers['List-Unsubscribe']);
  });

  it('without a secret there is no link and no header, and the email still goes', async () => {
    env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
    batchSend.mockResolvedValue({ data: {}, error: null });
    const result = await sendPersonalisedEmails(people(1), 'Hi');
    const email = batchSend.mock.calls[0][0][0];
    expect(email.headers).toBeUndefined();
    expect(email.html).not.toContain('unsubscribe');
    expect(result.sent).toBe(1);
  });
});

describe('coach email', () => {
  it('reports a provider error as not sent', async () => {
    emailSend.mockResolvedValue({ data: null, error: { message: 'bad' } });
    expect(await sendCoachEmail({ to: 'c@example.com', replyTo: 'm@example.com', memberName: 'M', subject: 's', message: 'x' })).toEqual({ sent: false, skipped: false });
  });

  it('reports success', async () => {
    emailSend.mockResolvedValue({ data: {}, error: null });
    expect(await sendCoachEmail({ to: 'c@example.com', replyTo: 'm@example.com', memberName: 'M', subject: 's', message: 'x' })).toEqual({ sent: true, skipped: false });
  });
});

describe('helpers', () => {
  it('scrubAddresses removes addresses and shortens', () => {
    expect(scrubAddresses('Invalid to: a.b+c@sub.example.co.uk, other')).toBe('Invalid to: [address], other');
    expect(scrubAddresses('x'.repeat(500))).toHaveLength(200);
  });

  it('appOrigin prefers the configured site, then Vercel\'s production address', () => {
    expect(appOrigin()).toBeNull();
    env.VERCEL_URL = 'preview-abc.vercel.app';
    expect(appOrigin()).toBe('https://preview-abc.vercel.app');
    env.VERCEL_PROJECT_PRODUCTION_URL = 'app.example.com';
    expect(appOrigin()).toBe('https://app.example.com');
    env.NEXT_PUBLIC_SITE_URL = 'https://custom.example.com/';
    expect(appOrigin()).toBe('https://custom.example.com');
  });
});
