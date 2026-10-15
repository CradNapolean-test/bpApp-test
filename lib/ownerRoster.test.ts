import { describe, expect, it } from 'vitest';
import {
  ROSTER_FILTERS,
  ROSTER_FILTER_LABELS,
  hasNextPage,
  hasPreviousPage,
  lastActiveLabel,
  parseRosterFilter,
  previousOffset,
  rangeLabel,
  rosterHref,
} from './ownerRoster';

describe('parseRosterFilter', () => {
  it('accepts the filters the database knows', () => {
    for (const f of ROSTER_FILTERS) expect(parseRosterFilter(f)).toBe(f);
  });

  it('treats anything else as everyone', () => {
    expect(parseRosterFilter('drop table')).toBeNull();
    expect(parseRosterFilter('')).toBeNull();
    expect(parseRosterFilter(undefined)).toBeNull();
    expect(parseRosterFilter(null)).toBeNull();
  });

  it('takes the first of a repeated parameter', () => {
    expect(parseRosterFilter(['no_plan', 'flagged'])).toBe('no_plan');
  });

  it('every filter has a label', () => {
    for (const f of ROSTER_FILTERS) expect(ROSTER_FILTER_LABELS[f].length).toBeGreaterThan(0);
  });
});

describe('rosterHref', () => {
  it('links an Overview number to the matching list', () => {
    expect(rosterHref('g1')).toBe('/owner/gyms/g1');
    expect(rosterHref('g1', 'no_plan')).toBe('/owner/gyms/g1?filter=no_plan');
  });
});

describe('paging', () => {
  it('describes the range shown', () => {
    expect(rangeLabel(114, 50, 0)).toBe('1 to 50 of 114');
    expect(rangeLabel(114, 50, 100)).toBe('101 to 114 of 114');
    expect(rangeLabel(0, 50, 0)).toBe('No members');
  });

  it('knows when there is another page', () => {
    expect(hasNextPage(114, 50, 0)).toBe(true);
    expect(hasNextPage(114, 50, 100)).toBe(false);
    expect(hasNextPage(100, 50, 50)).toBe(false);
    expect(hasPreviousPage(0)).toBe(false);
    expect(hasPreviousPage(50)).toBe(true);
    expect(previousOffset(50, 100)).toBe(50);
    expect(previousOffset(50, 20)).toBe(0);
  });
});

describe('lastActiveLabel', () => {
  const today = new Date('2026-10-15T12:00:00Z');

  it('says how long ago a member last logged anything', () => {
    expect(lastActiveLabel('2026-10-15', today)).toBe('Today');
    expect(lastActiveLabel('2026-10-14', today)).toBe('Yesterday');
    expect(lastActiveLabel('2026-10-10', today)).toBe('5 days ago');
    expect(lastActiveLabel('2026-06-15', today)).toBe('4 months ago');
  });

  it('says Never for a member who has not logged', () => {
    expect(lastActiveLabel(null, today)).toBe('Never');
    expect(lastActiveLabel(undefined, today)).toBe('Never');
    expect(lastActiveLabel('not a date', today)).toBe('Never');
  });
});
