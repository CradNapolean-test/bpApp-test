import { describe, expect, it } from 'vitest';

import { equivalentMinutesForActivity } from '../calculations';
import { categoryOf, splitName, swapRows, validateMinutesPer1000, walkingMinutes } from './activity';

const acts = [
  { id: '1', name: 'walking, 3.5 mph (17 min/mile)', met: 4.3 },
  { id: '2', name: 'running, 6 mph (10 min/mile)', met: 9.8 },
  { id: '3', name: 'bicycling, 12-13.9 mph', met: 8 },
  { id: '4', name: 'swimming laps, moderate', met: 5.8 },
  { id: '5', name: 'weight lifting, vigorous', met: 6 },
];

describe('categoryOf and splitName', () => {
  it('groups by the first word', () => {
    expect(acts.map((a) => categoryOf(a.name))).toEqual(['Walking', 'Running', 'Cycling', 'Swimming', 'Gym']);
  });
  it('splits a title from its detail', () => {
    expect(splitName('running, 10 mph (6 min/mile) / 16.1 kph')).toEqual({ title: 'Running', detail: '10 mph (6 min/mile) / 16.1 kph' });
    expect(splitName('bicycling, 12-13.9 mph')).toEqual({ title: 'Cycling', detail: '12-13.9 mph' });
    expect(splitName('yoga')).toEqual({ title: 'Yoga', detail: null });
  });
});

describe('swapRows', () => {
  it('uses the validated calculation, shortest first', () => {
    const rows = swapRows(acts, 8000, 10, 80, 'All', '');
    expect(rows.map((r) => r.id)).toEqual(['2', '3', '5', '4', '1']);
    const run = rows.find((r) => r.id === '2')!;
    expect(run.minutes).toBe(equivalentMinutesForActivity(8000, 10, 80, 9.8));
  });
  it('does not depend on the bodyweight shown (it cancels out) and defaults to 70 kg when unknown', () => {
    const a = swapRows(acts, 8000, 10, null, 'All', '');
    const b = swapRows(acts, 8000, 10, 120, 'All', '');
    expect(a.map((r) => Math.round(r.minutes))).toEqual(b.map((r) => Math.round(r.minutes)));
  });
  it('filters by category and by search text', () => {
    expect(swapRows(acts, 8000, 10, 80, 'Running', '').map((r) => r.id)).toEqual(['2']);
    expect(swapRows(acts, 8000, 10, 80, 'All', 'LIFT').map((r) => r.id)).toEqual(['5']);
    expect(swapRows(acts, 8000, 10, 80, 'Swimming', 'run')).toEqual([]);
  });
});

describe('minutes per 1,000 steps', () => {
  it('accepts above zero and up to 60', () => {
    expect(validateMinutesPer1000(10)).toBeNull();
    expect(validateMinutesPer1000(60)).toBeNull();
    expect(validateMinutesPer1000(0)).toMatch(/more than 0/);
    expect(validateMinutesPer1000(61)).toMatch(/60/);
    expect(validateMinutesPer1000(NaN)).toMatch(/more than 0/);
  });
  it('works out the walking time for a step target', () => {
    expect(walkingMinutes(8000, 10)).toBe(80);
    expect(walkingMinutes(8000, 12.5)).toBe(100);
  });
});
