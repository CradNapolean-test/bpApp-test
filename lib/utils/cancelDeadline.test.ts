import { describe, expect, it } from 'vitest';
import { cancelDeadline, cancelNote } from './cancelDeadline';

const note = (start: string, cutoff = 3) => cancelNote(cancelDeadline('2026-06-03', start, cutoff, '23:00', '05:00'));

describe('cancelDeadline with an 11pm-5am blackout and 3h cutoff', () => {
  it('gives a plain deadline for daytime and evening sessions', () => {
    expect(note('16:30')).toBe('Cancel by 1:30pm to keep your credit');
    expect(note('19:30')).toBe('Cancel by 4:30pm to keep your credit');
    expect(note('12:00')).toBe('Cancel by 9am to keep your credit');
  });
  it('moves an early-morning deadline back to 11pm the night before', () => {
    expect(note('06:00')).toBe('Cancel by 11pm the night before to keep your credit');
    expect(note('06:45')).toBe('Cancel by 11pm the night before to keep your credit');
    expect(note('07:30')).toBe('Cancel by 11pm the night before to keep your credit');
    expect(note('07:00')).toBe('Cancel by 11pm the night before to keep your credit');
  });
  it('allows a normal deadline once it lands at or after 5am', () => {
    expect(note('08:00')).toBe('Cancel by 5am to keep your credit');
    expect(note('09:30')).toBe('Cancel by 6:30am to keep your credit');
    expect(note('10:15')).toBe('Cancel by 7:15am to keep your credit');
  });
  it('places the late-night deadline on the previous day', () => {
    const d = cancelDeadline('2026-06-03', '06:00', 3, '23:00', '05:00');
    expect(d.dayBefore).toBe(true);
    expect(new Date(d.deadlineMs).toISOString()).toBe('2026-06-02T23:00:00.000Z');
  });
  it('behaves like a plain cutoff with no blackout', () => {
    expect(cancelNote(cancelDeadline('2026-06-03', '06:00', 3, null, null))).toBe('Cancel by 3am to keep your credit');
  });
});
