import { describe, expect, it } from 'vitest';
import { loadBirthdayCandidates, type BirthdayCandidate } from './birthdaysQuery';

const member = (i: number): BirthdayCandidate => ({
  client_id: `m-${String(i).padStart(5, '0')}`,
  name: `Member ${i}`,
  date_of_birth: '1990-10-16',
  timezone: 'Europe/London',
  email_notifications_enabled: true,
  notifications_enabled: true,
});

// A table of `total` members that, like the real database, returns at most 1,000 rows per request.
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => member(i));
  const ranges: [number, number][] = [];
  const page = async (from: number, to: number) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null };
  };
  return { page, ranges };
}

describe('loadBirthdayCandidates', () => {
  it('reads every member, including the ones past row 1,000 that used to be missed', async () => {
    const { page, ranges } = fakeTable(2350);
    const result = await loadBirthdayCandidates(page);
    expect(result.rows).toHaveLength(2350);
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    // the last member is there
    expect(result.rows[2349].client_id).toBe('m-02349');
  });

  it('does not repeat or skip anyone between pages', async () => {
    const { page } = fakeTable(1500);
    const result = await loadBirthdayCandidates(page);
    expect(new Set(result.rows.map((r) => r.client_id)).size).toBe(1500);
  });

  it('is one request for a small gym', async () => {
    const { page, ranges } = fakeTable(40);
    const result = await loadBirthdayCandidates(page);
    expect(result.rows).toHaveLength(40);
    expect(ranges).toHaveLength(1);
  });

  it('stops and reports an error from the database', async () => {
    const result = await loadBirthdayCandidates(async () => ({ data: null, error: { message: 'boom' } }));
    expect(result.error).toEqual({ message: 'boom' });
    expect(result.rows).toEqual([]);
  });
});
