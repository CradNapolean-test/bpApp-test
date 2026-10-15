import { describe, expect, it } from 'vitest';
import { fetchAllPages, remainingAfter, showMore, visibleCount } from './paging';

// A fake table of n rows that answers .range(from, to) like the database does.
function table(n: number, failAt?: number) {
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    if (failAt !== undefined && from >= failAt) return { data: null, error: { message: 'boom' } };
    const data = Array.from({ length: Math.max(0, Math.min(n - 1, to) - from + 1) }, (_, i) => from + i);
    return { data, error: null };
  };
  return { fetchPage, calls };
}

describe('fetchAllPages', () => {
  it('reads past the 1,000-row ceiling', async () => {
    const t = table(2350);
    const result = await fetchAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(2350);
    expect(result.rows[2349]).toBe(2349);
    expect(result.truncated).toBe(false);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops after one request when everything fits', async () => {
    const t = table(90);
    const result = await fetchAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(90);
    expect(t.calls).toHaveLength(1);
  });

  it('asks once more when the last page is exactly full, then finds it empty', async () => {
    const t = table(2000);
    const result = await fetchAllPages(t.fetchPage);
    expect(result.rows).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
  });

  it('returns the error and what it had read', async () => {
    const t = table(5000, 2000);
    const result = await fetchAllPages(t.fetchPage);
    expect(result.error?.message).toBe('boom');
    expect(result.rows).toHaveLength(2000);
  });

  it('says so when it hit the cap rather than pretending the list is complete', async () => {
    const t = table(10_000);
    const result = await fetchAllPages(t.fetchPage, { pageSize: 100, maxRows: 300 });
    expect(result.rows).toHaveLength(300);
    expect(result.truncated).toBe(true);
  });

  it('is empty for an empty table', async () => {
    const result = await fetchAllPages(table(0).fetchPage);
    expect(result).toEqual({ rows: [], error: null, truncated: false });
  });
});

describe('showing a list a step at a time', () => {
  it('shows the first 50 of 90, then all of them', () => {
    expect(visibleCount(90, 0)).toBe(50);
    expect(showMore(50, 90)).toBe(90);
    expect(remainingAfter(90, 50)).toBe(40);
    expect(remainingAfter(90, 90)).toBe(0);
  });

  it('never shows more than there are', () => {
    expect(visibleCount(12, 0)).toBe(12);
    expect(showMore(12, 12)).toBe(12);
    expect(remainingAfter(12, 50)).toBe(0);
  });

  it('keeps what was already shown when the list is filtered shorter and longer again', () => {
    expect(visibleCount(30, 100)).toBe(30);
    expect(visibleCount(500, 100)).toBe(100);
  });
});
