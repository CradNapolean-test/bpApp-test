import { beforeEach, describe, expect, it, vi } from 'vitest';

// The database and the push sender are replaced: nothing here reaches a real project or phone.
type Rows = Record<string, unknown>;
let tables: { profiles: Rows | null; gyms: Rows | null; chat_messages: Rows[] | null; client_profiles: Rows | null };

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lt', 'order', 'limit']) q[m] = () => q;
  q.maybeSingle = async () => ({ data: result, error: null });
  q.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: keyof typeof tables) => chain(tables[table]) }),
}));

const sendPushToCoach = vi.fn();
const sendPushToClient = vi.fn();
vi.mock('@/lib/push', () => ({
  sendPushToCoach: (...a: unknown[]) => sendPushToCoach(...a),
  sendPushToClient: (...a: unknown[]) => sendPushToClient(...a),
  pushQuietly: async (_label: string, send: () => Promise<unknown>) => send(),
}));

import { notifyAfterMessage, pushCoachOfMemberMessage } from './chatNotify';

// A message is "now" for the quiet-hours rule, so fix the clock: midday in London (11:00 UTC in summer).
const NOON = new Date('2026-07-10T11:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  sendPushToCoach.mockReset().mockResolvedValue({ sent: 1, failed: 0, skipped: false, reasons: {} });
  sendPushToClient.mockReset().mockResolvedValue({ sent: 1, failed: 0, skipped: false, reasons: {} });
  tables = {
    profiles: { coach_id: 'coach-1', gym_id: 'gym-1' },
    gyms: { timezone: 'Europe/London' },
    chat_messages: [],
    client_profiles: { name: 'Alex Smith' },
  };
});

describe('a member writes', () => {
  it('tells their coach, naming the member and never carrying the message', async () => {
    await pushCoachOfMemberMessage('client-1', NOON.toISOString());
    expect(sendPushToCoach).toHaveBeenCalledTimes(1);
    const [coachId, payload] = sendPushToCoach.mock.calls[0];
    expect(coachId).toBe('coach-1');
    expect(payload).toMatchObject({ title: 'New message from Alex', body: 'Open the app to read it.', tag: 'chat-client-1', url: '/coach/clients/client-1?open=messages' });
  });

  it('says nothing in quiet hours (21:00 to 07:00 at the gym)', async () => {
    vi.setSystemTime(new Date('2026-07-10T21:30:00Z')); // 22:30 BST
    await pushCoachOfMemberMessage('client-1', new Date().toISOString());
    expect(sendPushToCoach).not.toHaveBeenCalled();
  });

  it('says nothing for a second message within 5 minutes of the first', async () => {
    tables.chat_messages = [{ created_at: new Date(NOON.getTime() - 2 * 60_000).toISOString() }];
    await pushCoachOfMemberMessage('client-1', NOON.toISOString());
    expect(sendPushToCoach).not.toHaveBeenCalled();
  });

  it('pushes again after 5 minutes of quiet', async () => {
    tables.chat_messages = [{ created_at: new Date(NOON.getTime() - 20 * 60_000).toISOString() }];
    await pushCoachOfMemberMessage('client-1', NOON.toISOString());
    expect(sendPushToCoach).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a member with no coach', async () => {
    tables.profiles = { coach_id: null, gym_id: 'gym-1' };
    await pushCoachOfMemberMessage('client-1', NOON.toISOString());
    expect(sendPushToCoach).not.toHaveBeenCalled();
  });

  it('never throws into the sender when the push breaks', async () => {
    sendPushToCoach.mockRejectedValue(new Error('push service down'));
    await expect(pushCoachOfMemberMessage('client-1', NOON.toISOString())).resolves.toBeUndefined();
  });
});

describe('notifyAfterMessage decides who is told by who wrote', () => {
  it('a coach\'s message goes to the member', async () => {
    await notifyAfterMessage({ senderId: 'coach-1', clientId: 'client-1', preview: 'Well done today' });
    expect(sendPushToClient).toHaveBeenCalledTimes(1);
    expect(sendPushToClient.mock.calls[0][1]).toMatchObject({ title: 'New message from your coach', body: 'Well done today' });
    expect(sendPushToCoach).not.toHaveBeenCalled();
  });

  it('a member\'s message goes to the coach', async () => {
    await notifyAfterMessage({ senderId: 'client-1', clientId: 'client-1', preview: 'private text', createdAt: NOON.toISOString() });
    expect(sendPushToCoach).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(sendPushToCoach.mock.calls[0])).not.toContain('private text');
    expect(sendPushToClient).not.toHaveBeenCalled();
  });

  it('shortens a long message preview for the member', async () => {
    await notifyAfterMessage({ senderId: 'coach-1', clientId: 'client-1', preview: 'x'.repeat(300) });
    expect((sendPushToClient.mock.calls[0][1] as { body: string }).body).toHaveLength(120);
  });
});
