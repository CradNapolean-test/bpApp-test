import { describe, expect, it } from 'vitest';
import { followUpFor, hasReason, isGoneQuiet, loggingBand, QUIET_DAYS, sortFollowUps, type FollowUpInput } from './followUp';

// Wednesday 11 Nov 2026: this week starts Mon 9 Nov, last week is 2-8 Nov, the 28-day window starts 14 Oct.
const today = '2026-11-11';
const base: FollowUpInput = {
  todayIso: today,
  createdAt: '2026-06-01T09:00:00Z',
  onboarded: true,
  onHold: false,
  reminderDays: 3,
  logs: [
    { date: '2026-11-10', bodyweight: null },
    { date: '2026-11-04', bodyweight: null },
  ],
  balance: 4,
  weeklyCredits: false,
  bookings: [],
};
const kinds = (m: Partial<FollowUpInput>) => followUpFor({ ...base, ...m })?.reasons.map((r) => r.kind) ?? [];

describe('gone quiet (D11): 5 days without logging, one rule', () => {
  it('is quiet from 5 days after the last log, not before', () => {
    expect(QUIET_DAYS).toBe(5);
    const at = (lastLog: string) => isGoneQuiet({ onboarded: true, onHold: false, reminderDays: 3, lastLog, createdAt: '2026-01-01', todayIso: today });
    expect(at('2026-11-07')).toBe(false); // 4 days
    expect(at('2026-11-06')).toBe(true); // 5 days
  });

  it('does not depend on the reminder days, except 0 (not monitored)', () => {
    const quiet = (reminderDays: number | null) =>
      isGoneQuiet({ onboarded: true, onHold: false, reminderDays, lastLog: '2026-11-05', createdAt: '2026-01-01', todayIso: today });
    expect(quiet(1)).toBe(true);
    expect(quiet(3)).toBe(true);
    expect(quiet(10)).toBe(true);
    expect(quiet(null)).toBe(true);
    expect(quiet(0)).toBe(false);
  });

  it('leaves out members on hold and members still setting up', () => {
    const m = { reminderDays: 3, lastLog: '2026-10-01', createdAt: '2026-01-01', todayIso: today };
    expect(isGoneQuiet({ ...m, onboarded: true, onHold: true })).toBe(false);
    expect(isGoneQuiet({ ...m, onboarded: false, onHold: false })).toBe(false);
  });

  it('counts a member who never logged from sign-up', () => {
    const never = (createdAt: string) => isGoneQuiet({ onboarded: true, onHold: false, reminderDays: 3, lastLog: null, createdAt, todayIso: today });
    expect(never('2026-11-08T10:00:00Z')).toBe(false);
    expect(never('2026-11-06T10:00:00Z')).toBe(true);
  });

  it('labels the days, never logged, or nothing in the four weeks read', () => {
    expect(followUpFor({ ...base, logs: [{ date: '2026-11-03', bodyweight: null }] })?.reasons[0]).toEqual({ kind: 'quiet', label: '8 days quiet' });
    expect(followUpFor({ ...base, logs: [{ date: '2026-11-03', bodyweight: null }] })?.detail).toBe('Last log Tue 3 Nov');
    expect(followUpFor({ ...base, logs: [], createdAt: '2026-11-01T10:00:00Z' })?.reasons[0].label).toBe('Never logged');
    // Joined before the window and nothing in it: they may have logged long ago, so it does not say "Never logged" (CW7).
    expect(followUpFor({ ...base, logs: [] })?.reasons[0].label).toBe('Quiet 4+ weeks');
  });

  it('is the Logging colour red; amber at 3 and 4 days', () => {
    expect([0, 1, 2, 3, 4, 5, 30].map(loggingBand)).toEqual(['green', 'green', 'green', 'amber', 'amber', 'red', 'red']);
  });
});

describe('the other logging reasons', () => {
  it('flags a week with nothing logged for a member here over 2 weeks', () => {
    expect(kinds({ logs: [{ date: '2026-11-10', bodyweight: null }] })).toEqual(['missed']);
    expect(kinds({ logs: [{ date: '2026-11-10', bodyweight: null }], createdAt: '2026-11-01T00:00:00Z' })).toEqual([]);
  });

  it('does not say missed last week as well as gone quiet', () => {
    expect(kinds({ logs: [{ date: '2026-11-01', bodyweight: null }] })).toEqual(['quiet']);
  });

  it('flags six weigh-ins with no change', () => {
    const logs = ['10-20', '10-24', '10-28', '11-02', '11-06', '11-10'].map((d) => ({ date: `2026-${d}`, bodyweight: 80.1 }));
    expect(kinds({ logs })).toEqual(['stalled']);
    expect(kinds({ logs: logs.map((l, i) => ({ ...l, bodyweight: 80 - i * 0.4 })) })).toEqual([]);
  });

  it('skips every logging reason when reminders are off or they have not set up', () => {
    expect(kinds({ logs: [], reminderDays: 0 })).toEqual([]);
    expect(kinds({ logs: [], onboarded: false })).toEqual([]);
  });
});

describe('class reasons (D28)', () => {
  it('flags 2 or more no-shows in the last 2 weeks', () => {
    const noShow = (date: string) => ({ date, noShow: true });
    expect(kinds({ bookings: [noShow('2026-11-02')] })).toEqual([]);
    expect(kinds({ bookings: [noShow('2026-11-02'), noShow('2026-11-09')] })).toEqual(['classes']);
    expect(followUpFor({ ...base, bookings: [noShow('2026-11-02'), noShow('2026-11-09')] })?.reasons[0].label).toBe('Missed 2 classes');
    // Older than 2 weeks does not count.
    expect(kinds({ bookings: [noShow('2026-10-20'), noShow('2026-11-09')] })).toEqual([]);
  });

  it('flags out of credits with nothing booked this week or later', () => {
    const lastWeek = { date: '2026-11-04', noShow: false };
    expect(kinds({ balance: 0, bookings: [lastWeek] })).toEqual(['credits']);
    expect(kinds({ balance: -1, bookings: [lastWeek] })).toEqual(['credits']);
    expect(followUpFor({ ...base, balance: 0, bookings: [lastWeek] })?.reasons[0].label).toBe('Out of credits, not booked');
  });

  it('does not flag a plan member at 0 who has booked their week (CL19, RO5)', () => {
    expect(kinds({ balance: 0, weeklyCredits: true, bookings: [{ date: '2026-11-09', noShow: false }] })).toEqual([]);
    expect(kinds({ balance: 0, weeklyCredits: true, bookings: [{ date: '2026-11-13', noShow: false }] })).toEqual([]);
    // ...but does flag one at 0 with nothing booked.
    expect(kinds({ balance: 0, weeklyCredits: true, bookings: [] })).toEqual(['credits']);
  });

  it('does not flag someone who does not go to classes, or whose balance cannot be read', () => {
    expect(kinds({ balance: 0, weeklyCredits: false, bookings: [] })).toEqual([]);
    expect(kinds({ balance: null, weeklyCredits: true, bookings: [] })).toEqual([]);
    expect(kinds({ balance: 1, weeklyCredits: true, bookings: [] })).toEqual([]);
  });

  it('applies to members still setting up, but not to members on hold', () => {
    expect(kinds({ onboarded: false, balance: 0, weeklyCredits: true })).toEqual(['credits']);
    expect(kinds({ onHold: true, balance: 0, weeklyCredits: true })).toEqual([]);
  });
});

describe('the list', () => {
  it('lists reasons in a fixed order, with the first one as the detail', () => {
    const f = followUpFor({ ...base, logs: [], balance: 0, weeklyCredits: true, bookings: [{ date: '2026-11-02', noShow: true }, { date: '2026-11-03', noShow: true }] });
    expect(f?.reasons.map((r) => r.kind)).toEqual(['quiet', 'classes', 'credits']);
    expect(f?.detail).toBe('Nothing logged in 4 weeks');
    expect(hasReason(f, 'credits')).toBe(true);
    expect(hasReason(f, 'stalled')).toBe(false);
  });

  it('sorts most reasons first, then gone quiet first, then by name', () => {
    const r = (kind: 'quiet' | 'credits' | 'stalled') => ({ kind, label: kind });
    const sorted = sortFollowUps([
      { name: 'Zoe', reasons: [r('stalled')] },
      { name: 'Amy', reasons: [r('credits')] },
      { name: 'Bob', reasons: [r('quiet')] },
      { name: 'Cat', reasons: [r('quiet'), r('credits')] },
      { name: 'Abe', reasons: [r('quiet')] },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(['Cat', 'Abe', 'Bob', 'Amy', 'Zoe']);
  });
});
