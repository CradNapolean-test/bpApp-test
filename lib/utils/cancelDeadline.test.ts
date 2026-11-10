import { describe, expect, it } from 'vitest';
import { bookSheetNote, cancelDeadline, cancelNote } from './cancelDeadline';

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

// BK21: the booking sheet stopped saying "Cancel by 11pm the night before" at 2:30am, when that time had already passed.
describe('bookSheetNote', () => {
  const deadline = cancelDeadline('2026-11-06', '06:00', 3, '23:00', '05:00'); // 11pm on the 5th
  const at = (iso: string) => Date.parse(iso + ':00Z');
  it('gives the cancel-by time while there is still time', () => {
    expect(bookSheetNote(deadline, at('2026-11-05T22:59'))).toEqual({ text: 'Cancel by 11pm the night before to keep your credit', late: false });
  });
  it("warns that the credit won't come back once the deadline has passed", () => {
    const note = bookSheetNote(deadline, at('2026-11-06T02:30'));
    expect(note.late).toBe(true);
    expect(note.text).toBe("The cancel deadline (11pm the night before) has passed. If you book now and can't come, your credit won't be refunded.");
  });
});
