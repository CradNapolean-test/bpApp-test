import { describe, expect, it, vi } from 'vitest';
import { JOB_RUN_KEEP_DAYS, jobRunCutoff, recordJobRun } from './jobRuns';

function fakeClient(insertError: unknown = null) {
  const inserted: unknown[] = [];
  const pruned: string[] = [];
  const client = {
    from: vi.fn(() => ({
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: insertError };
      },
      delete: () => ({
        lt: async (_column: 'ran_at', value: string) => {
          pruned.push(value);
          return { error: null };
        },
      }),
    })),
  };
  return { client, inserted, pruned };
}

describe('recordJobRun', () => {
  const now = new Date('2026-10-16T05:00:00Z');

  it('writes one row and prunes anything older than 60 days', async () => {
    const { client, inserted, pruned } = fakeClient();
    await recordJobRun('birthdays', true, '3 due', client, now);
    expect(inserted).toEqual([{ job: 'birthdays', ok: true, detail: '3 due' }]);
    expect(pruned).toEqual([jobRunCutoff(now)]);
    expect(JOB_RUN_KEEP_DAYS).toBe(60);
    expect(new Date(pruned[0]).toISOString()).toBe('2026-08-17T05:00:00.000Z');
  });

  it('records a failure with its reason', async () => {
    const { client, inserted } = fakeClient();
    await recordJobRun('expire-credits', false, 'rpc failed', client, now);
    expect(inserted).toEqual([{ job: 'expire-credits', ok: false, detail: 'rpc failed' }]);
  });

  it('never stores an email address', async () => {
    const { client, inserted } = fakeClient();
    await recordJobRun('send-communications', false, 'failed for alex@example.com in batch 2', client, now);
    expect(JSON.stringify(inserted)).not.toContain('alex@example.com');
    expect(JSON.stringify(inserted)).toContain('[address]');
  });

  it('stores nothing for a missing detail, and keeps long ones short', async () => {
    const { client, inserted } = fakeClient();
    await recordJobRun('a', true, undefined, client, now);
    await recordJobRun('b', true, 'x'.repeat(2000), client, now);
    expect((inserted[0] as { detail: unknown }).detail).toBeNull();
    expect(((inserted[1] as { detail: string }).detail).length).toBe(500);
  });

  it('does nothing more when the table is not there yet, and never throws', async () => {
    const missing = fakeClient({ code: '42P01', message: 'relation "job_runs" does not exist' });
    await expect(recordJobRun('a', true, 'x', missing.client, now)).resolves.toBeUndefined();
    expect(missing.pruned).toEqual([]);

    const exploding = { from: () => { throw new Error('network'); } };
    await expect(recordJobRun('a', true, 'x', exploding as never, now)).resolves.toBeUndefined();
  });
});
