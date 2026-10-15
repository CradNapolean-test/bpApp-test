import { describe, expect, it } from 'vitest';
import { eventCancelledMessage, eventChangeMessage, startsInThePast, type EventSnapshot } from './eventChange';

const walk: EventSnapshot = { title: 'Spring walk', starts_at: '2026-10-24T09:00:00.000Z', location: 'Salford Quays' };
const TZ = 'Europe/London';

describe('eventChangeMessage (EV2)', () => {
  it('says nothing when only the details changed', () => {
    expect(eventChangeMessage(walk, { ...walk }, TZ)).toBeNull();
    expect(eventChangeMessage(walk, { ...walk, location: ' Salford Quays ' }, TZ)).toBeNull();
  });

  it('says the new time and the old one, in the gym timezone', () => {
    const msg = eventChangeMessage(walk, { ...walk, starts_at: '2026-10-24T10:30:00.000Z' }, TZ);
    expect(msg).toBe('Event update: "Spring walk" is now Sat 24 Oct, 11:30 (it was Sat 24 Oct, 10:00).');
  });

  it('says the new place', () => {
    const msg = eventChangeMessage(walk, { ...walk, location: 'Worsley Woods' }, TZ);
    expect(msg).toBe('Event update: "Spring walk" has moved to Worsley Woods (it was Salford Quays).');
  });

  it('says both when both changed, and copes with a place being added or removed', () => {
    const both = eventChangeMessage(walk, { ...walk, starts_at: '2026-10-25T09:00:00.000Z', location: null }, TZ);
    expect(both).toMatch(/is now .* and has moved to no location set \(it was Salford Quays\)\.$/);
    expect(eventChangeMessage({ ...walk, location: null }, { ...walk, location: 'Park' }, TZ)).toMatch(/\(it was no location set\)/);
  });

  it('never goes past 300 characters', () => {
    const long = 'x'.repeat(400);
    expect(eventChangeMessage(walk, { ...walk, title: long, location: 'Elsewhere' }, TZ)?.length).toBeLessThanOrEqual(300);
    expect(eventCancelledMessage({ ...walk, title: long }, TZ).length).toBeLessThanOrEqual(300);
  });
});

describe('eventCancelledMessage', () => {
  it('names the event and when it was', () => {
    expect(eventCancelledMessage(walk, TZ)).toBe('Event cancelled: "Spring walk" on Sat 24 Oct, 10:00 has been cancelled.');
  });
});

describe('startsInThePast', () => {
  it('refuses a past start and allows now or later', () => {
    const now = Date.UTC(2026, 9, 14, 12, 0);
    expect(startsInThePast('2026-10-14T11:59:00.000Z', now)).toBe(true);
    expect(startsInThePast('2026-10-14T12:00:00.000Z', now)).toBe(false);
    expect(startsInThePast('2026-10-15T09:00:00.000Z', now)).toBe(false);
  });
});
