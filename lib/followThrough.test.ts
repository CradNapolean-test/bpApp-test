import { describe, expect, it } from 'vitest';
import {
  durationLabel,
  isLongWait,
  median,
  reviewedLabel,
  stillWaiting,
  summariseFollowThrough,
  waitedLabel,
  type FollowThroughRaw,
} from './followThrough';

const raw = (over: Partial<FollowThroughRaw> = {}): FollowThroughRaw => ({
  gymId: 'g1',
  today: '2026-11-26',
  weeksFrom: '2026-10-26',
  weeks: 4,
  coaches: [
    { coachId: 'brad', name: 'brad@example.com', members: 14, checkinsDue: 9, checkinsReviewed: 7 },
    { coachId: 'adam', name: 'Adam', members: 3, checkinsDue: 0, checkinsReviewed: 0 },
  ],
  waiting: [],
  replies: [],
  ...over,
});

describe('median', () => {
  it('is the middle value of an odd count, whatever the order', () => {
    expect(median([300, 60, 86_400])).toBe(300);
  });

  it('is the mean of the two middle values of an even count', () => {
    expect(median([60, 120, 180, 100_000])).toBe(150);
  });

  it('is not pulled by one very late reply, as a mean would be', () => {
    const replies = [600, 900, 1200, 1500, 7 * 86_400];
    expect(median(replies)).toBe(1200);
    expect(replies.reduce((a, b) => a + b, 0) / replies.length).toBeGreaterThan(100_000);
  });

  it('is null with no values, and ignores values that are not numbers', () => {
    expect(median([])).toBeNull();
    expect(median([Number.NaN, 30])).toBe(30);
  });
});

describe('stillWaiting', () => {
  it('waits with no "No reply needed" mark', () => {
    expect(stillWaiting({ lastAt: '2026-11-25T10:00:00Z', noReplyAt: null })).toBe(true);
  });

  it('does not wait when the mark is at or after the member\'s newest message', () => {
    expect(stillWaiting({ lastAt: '2026-11-25T10:00:00Z', noReplyAt: '2026-11-25T10:00:00Z' })).toBe(false);
    expect(stillWaiting({ lastAt: '2026-11-25T10:00:00Z', noReplyAt: '2026-11-25T11:00:00Z' })).toBe(false);
  });

  it('waits again once the member writes after the mark', () => {
    expect(stillWaiting({ lastAt: '2026-11-25T12:00:00Z', noReplyAt: '2026-11-25T11:00:00Z' })).toBe(true);
  });
});

describe('summariseFollowThrough', () => {
  it('counts waiting conversations per coach, leaving out ones marked "No reply needed", and finds the oldest', () => {
    const out = summariseFollowThrough(
      raw({
        waiting: [
          { coachId: 'brad', since: '2026-11-24T09:00:00Z', lastAt: '2026-11-24T09:05:00Z', noReplyAt: null },
          { coachId: 'brad', since: '2026-11-20T09:00:00Z', lastAt: '2026-11-21T08:00:00Z', noReplyAt: null },
          // marked after the member's newest message: not waiting, and not the oldest
          { coachId: 'brad', since: '2026-11-01T09:00:00Z', lastAt: '2026-11-01T09:00:00Z', noReplyAt: '2026-11-02T00:00:00Z' },
          { coachId: 'adam', since: '2026-11-25T18:00:00Z', lastAt: '2026-11-25T18:00:00Z', noReplyAt: null },
        ],
      })
    );
    const brad = out.coaches.find((c) => c.coachId === 'brad')!;
    const adam = out.coaches.find((c) => c.coachId === 'adam')!;
    expect(brad.waiting).toBe(2);
    expect(brad.oldestWaitingSince).toBe('2026-11-20T09:00:00Z');
    expect(adam.waiting).toBe(1);
    expect(adam.oldestWaitingSince).toBe('2026-11-25T18:00:00Z');
  });

  it("gives each coach the median of their own replies and how many there were", () => {
    const out = summariseFollowThrough(
      raw({
        replies: [
          { coachId: 'brad', seconds: 3600 },
          { coachId: 'brad', seconds: 60 },
          { coachId: 'brad', seconds: 600 },
          { coachId: 'adam', seconds: 10 },
          // a reply by someone not in the team is nobody's figure
          { coachId: 'gone', seconds: 5 },
        ],
      })
    );
    expect(out.coaches.find((c) => c.coachId === 'brad')).toMatchObject({ medianReplySeconds: 600, replies: 3 });
    expect(out.coaches.find((c) => c.coachId === 'adam')).toMatchObject({ medianReplySeconds: 10, replies: 1 });
  });

  it('has nobody waiting and no reply time when there is nothing, and keeps the check-in counts', () => {
    const out = summariseFollowThrough(raw());
    expect(out.coaches[0]).toEqual({
      coachId: 'brad',
      name: 'brad@example.com',
      members: 14,
      checkinsDue: 9,
      checkinsReviewed: 7,
      waiting: 0,
      oldestWaitingSince: null,
      medianReplySeconds: null,
      replies: 0,
    });
    expect(out.weeks).toBe(4);
  });

  it('never says more were reviewed than were due', () => {
    const out = summariseFollowThrough(raw({ coaches: [{ coachId: 'x', name: 'X', members: 1, checkinsDue: 2, checkinsReviewed: 5 }] }));
    expect(out.coaches[0].checkinsReviewed).toBe(2);
  });
});

describe('labels', () => {
  it('says a duration the way a person would', () => {
    expect(durationLabel(20)).toBe('under a minute');
    expect(durationLabel(25 * 60)).toBe('25 min');
    expect(durationLabel(3 * 3600 + 600)).toBe('3 h');
    expect(durationLabel(47 * 3600)).toBe('47 h');
    expect(durationLabel(3 * 86_400)).toBe('3 days');
  });

  it('says how long the oldest message has waited, and flags more than two days', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    expect(waitedLabel('2026-11-23T12:00:00Z', now)).toBe('3 days');
    expect(isLongWait('2026-11-23T12:00:00Z', now)).toBe(true);
    expect(isLongWait('2026-11-25T12:00:00Z', now)).toBe(false);
    expect(isLongWait(null, now)).toBe(false);
  });

  it('shows reviewed against due, or a dash when nothing was due', () => {
    expect(reviewedLabel({ checkinsDue: 9, checkinsReviewed: 7 })).toBe('7 of 9');
    expect(reviewedLabel({ checkinsDue: 0, checkinsReviewed: 0 })).toBe('–');
  });
});
