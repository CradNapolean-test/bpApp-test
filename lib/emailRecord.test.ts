import { describe, expect, it, vi } from 'vitest';
import { recordEmailOutcome } from './emailRecord';

const NOW = '2026-10-16T05:00:00.000Z';

function fakeClient(firstError: { code?: string; message?: string } | null = null) {
  const calls: Record<string, unknown>[] = [];
  let first = true;
  const client = {
    from: vi.fn(() => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          calls.push(values);
          const error = first ? firstError : null;
          first = false;
          return { error };
        },
      }),
    })),
  };
  return { client, calls };
}

describe('recordEmailOutcome', () => {
  it('writes the counts and stamps only when something went', async () => {
    const { client, calls } = fakeClient();
    await recordEmailOutcome(client, 'c1', { sent: 4, failed: 1, skipped: false, error: 'x' }, 0, NOW);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ email_sent_at: NOW, email_sent_count: 4, email_failed_count: 1 });
  });

  it('does not stamp a broadcast whose emails all failed', async () => {
    const { client, calls } = fakeClient();
    await recordEmailOutcome(client, 'c1', { sent: 0, failed: 6, skipped: false, error: 'bad sender' }, 0, NOW);
    expect(calls[0].email_sent_at).toBeUndefined();
    expect(calls[0]).toMatchObject({ email_failed_count: 6, email_attempts: 1 });
  });

  it('falls back to the old column when migration 0139 is not applied, but still only for a real send', async () => {
    const missing = { code: '42703', message: 'column "email_sent_count" of relation "scheduled_communications" does not exist' };
    const sent = fakeClient(missing);
    await recordEmailOutcome(sent.client, 'c1', { sent: 3, failed: 0, skipped: false }, 0, NOW);
    expect(sent.calls).toHaveLength(2);
    expect(sent.calls[1]).toEqual({ email_sent_at: NOW });

    const failed = fakeClient(missing);
    await recordEmailOutcome(failed.client, 'c1', { sent: 0, failed: 3, skipped: false }, 0, NOW);
    expect(failed.calls).toHaveLength(1);
  });
});
