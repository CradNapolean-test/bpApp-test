import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// web-push, the database and Sentry are replaced: nothing here can send a real push.
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a), setVapidDetails: (...a: unknown[]) => setVapidDetails(...a) } }));

const captureMessage = vi.fn();
const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a), captureException: (...a: unknown[]) => captureException(...a) }));

let subscriptions: { endpoint: string; p256dh: string; auth: string }[] = [];
const deletedEndpoints: string[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: subscriptions, error: null }) }),
      delete: () => ({
        eq: async (_column: string, endpoint: string) => {
          deletedEndpoints.push(endpoint);
          return { error: null };
        },
      }),
    }),
  }),
}));

import { pushQuietly, reportPushResult, sendPushToClient, sendPushToCoach } from './push';

const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'SUPPORT_EMAIL'];
const env = process.env as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};

const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, p256dh: 'p', auth: 'a' });

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = env[k];
  for (const k of ENV_KEYS) delete env[k];
  env.VAPID_PUBLIC_KEY = 'pub';
  env.VAPID_PRIVATE_KEY = 'priv';
  env.SUPPORT_EMAIL = 'help@example.com';
  subscriptions = [sub(1), sub(2)];
  deletedEndpoints.length = 0;
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  captureMessage.mockReset();
  captureException.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe('configuration', () => {
  it('uses SUPPORT_EMAIL as the contact and never a personal default', async () => {
    sendNotification.mockResolvedValue({});
    await sendPushToClient('c1', { title: 't', body: 'b' });
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:help@example.com', 'pub', 'priv');
    expect(JSON.stringify(setVapidDetails.mock.calls)).not.toMatch(/gmail/i);
  });

  it('with no contact it sends nothing, says so, and warns Sentry', async () => {
    delete env.SUPPORT_EMAIL;
    const result = await sendPushToClient('c1', { title: 't', body: 'b' });
    expect(result).toEqual({ sent: 0, failed: 0, skipped: true, reason: 'no-contact', reasons: {} });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(captureMessage.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('with no keys it sends nothing', async () => {
    delete env.VAPID_PRIVATE_KEY;
    expect(await sendPushToClient('c1', { title: 't', body: 'b' })).toMatchObject({ skipped: true, reason: 'not-configured' });
  });
});

describe('sending', () => {
  it('counts what went, to a coach too', async () => {
    sendNotification.mockResolvedValue({});
    expect(await sendPushToClient('c1', { title: 't', body: 'b' })).toEqual({ sent: 2, failed: 0, skipped: false, reasons: {} });
    expect(await sendPushToCoach('coach1', { title: 't', body: 'b' })).toMatchObject({ sent: 2 });
  });

  it('puts the tag in the payload so a phone replaces earlier notifications', async () => {
    sendNotification.mockResolvedValue({});
    await sendPushToCoach('coach1', { title: 'New message from Alex', body: 'Open the app to read it', url: '/x', tag: 'chat-1' });
    const body = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(body).toEqual({ title: 'New message from Alex', body: 'Open the app to read it', url: '/x', tag: 'chat-1' });
  });

  it('counts failures by HTTP status, never by endpoint', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 429 }).mockRejectedValueOnce(new Error('socket hang up'));
    const result = await sendPushToClient('c1', { title: 't', body: 'b' });
    expect(result).toEqual({ sent: 0, failed: 2, skipped: false, reasons: { '429': 1, network: 1 } });
    expect(JSON.stringify(result)).not.toContain('push.example');
  });

  it('prunes a subscription the push service says is gone', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 410 }).mockResolvedValueOnce({});
    const result = await sendPushToClient('c1', { title: 't', body: 'b' });
    expect(result).toMatchObject({ sent: 1, failed: 1, reasons: { '410': 1 } });
    expect(deletedEndpoints).toEqual(['https://push.example/1']);
  });

  it('has nothing to do for someone with no devices', async () => {
    subscriptions = [];
    expect(await sendPushToClient('c1', { title: 't', body: 'b' })).toEqual({ sent: 0, failed: 0, skipped: false, reasons: {} });
  });
});

describe('reporting failures', () => {
  it('reports real failures with counts and statuses and no endpoints', () => {
    reportPushResult('chat', { sent: 1, failed: 2, skipped: false, reasons: { '429': 2 } });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const reported = JSON.stringify(captureMessage.mock.calls[0]);
    expect(reported).toContain('"429":2');
    expect(reported).not.toContain('https://');
  });

  it('does not report a dead subscription being cleaned up, or a clean send', () => {
    reportPushResult('chat', { sent: 1, failed: 1, skipped: false, reasons: { '410': 1 } });
    reportPushResult('chat', { sent: 3, failed: 0, skipped: false, reasons: {} });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('pushQuietly returns the result, reports, and never throws', async () => {
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const result = await pushQuietly('cron', () => sendPushToClient('c1', { title: 't', body: 'b' }));
    expect(result).toMatchObject({ failed: 2 });
    expect(captureMessage).toHaveBeenCalled();

    const crashed = await pushQuietly('cron', async () => {
      throw new Error('db down');
    });
    expect(crashed).toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
