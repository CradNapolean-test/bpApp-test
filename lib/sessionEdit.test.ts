import { describe, expect, it } from 'vitest';
import { checkSessionEdit, isPastSessionDate, retireWording, type BookingSummary, type SessionFields } from './sessionEdit';

const slot: SessionFields = { dayOfWeek: 1, specificDate: null, startTime: '06:00:00', capacity: 12 };
const nobody: BookingSummary = { upcomingMembers: 0, mostBookedOnOneDate: 0, totalBookings: 0 };
const some = (over: Partial<BookingSummary> = {}): BookingSummary => ({ upcomingMembers: 5, mostBookedOnOneDate: 4, totalBookings: 30, ...over });

describe('checkSessionEdit (R26)', () => {
  it('says nothing when nobody is booked', () => {
    expect(checkSessionEdit(slot, { ...slot, startTime: '07:00', dayOfWeek: 3, capacity: 1 }, nobody)).toEqual({ kind: 'none' });
  });

  it('says nothing for a change that touches no booking (the note, the price)', () => {
    expect(checkSessionEdit(slot, { ...slot, startTime: '06:00' }, some())).toEqual({ kind: 'none' });
  });

  it('warns that booked members will be told when the time moves', () => {
    const r = checkSessionEdit(slot, { ...slot, startTime: '07:00' }, some());
    expect(r).toEqual({
      kind: 'notify',
      message: '5 members are booked on this session. They will be told it now starts at 07:00 (it was 06:00).',
    });
  });

  it('uses the singular for one member', () => {
    const r = checkSessionEdit(slot, { ...slot, startTime: '07:00' }, some({ upcomingMembers: 1 }));
    expect(r.kind === 'notify' && r.message).toMatch(/^1 member is booked/);
  });

  it('blocks a changed weekday while members are booked and says to retire and recreate', () => {
    const r = checkSessionEdit(slot, { ...slot, dayOfWeek: 3 }, some());
    expect(r.kind).toBe('blocked');
    expect(r.kind === 'blocked' && r.message).toMatch(/Retire this slot and create a new one/);
  });

  it('blocks moving a one-off to another date', () => {
    const once = { ...slot, dayOfWeek: 2, specificDate: '2026-10-20' };
    expect(checkSessionEdit(once, { ...once, specificDate: '2026-10-21' }, some()).kind).toBe('blocked');
  });

  it('blocks capacity below the most booked on any upcoming date, but allows exactly that', () => {
    expect(checkSessionEdit(slot, { ...slot, capacity: 3 }, some({ mostBookedOnOneDate: 4 })).kind).toBe('blocked');
    expect(checkSessionEdit(slot, { ...slot, capacity: 4 }, some({ mostBookedOnOneDate: 4 })).kind).toBe('none');
  });

  it('allows raising the capacity', () => {
    expect(checkSessionEdit(slot, { ...slot, capacity: 20 }, some()).kind).toBe('none');
  });
});

describe('retireWording (CH2)', () => {
  it('offers a plain delete for a session nobody ever booked', () => {
    const w = retireWording('Yoga', nobody);
    expect(w.action).toBe('delete');
    expect(w.confirmLabel).toBe('Delete');
  });

  it('retires a session with history and says how many members will be refunded and told', () => {
    const w = retireWording('Yoga', some({ upcomingMembers: 3 }));
    expect(w.action).toBe('retire');
    expect(w.body).toMatch(/3 members booked on upcoming dates will be refunded and told/);
    expect(w.body).toMatch(/Past bookings and attendance stay on file/);
  });

  it('says nobody needs refunding when only past bookings exist', () => {
    const w = retireWording('Yoga', some({ upcomingMembers: 0 }));
    expect(w.action).toBe('retire');
    expect(w.body).toMatch(/Nobody is booked on an upcoming date/);
  });

  it('uses the singular for one member', () => {
    expect(retireWording('Yoga', some({ upcomingMembers: 1 })).body).toMatch(/^1 member booked on upcoming dates/);
  });
});

describe('isPastSessionDate', () => {
  it('allows today and later, refuses yesterday', () => {
    expect(isPastSessionDate('2026-10-14', '2026-10-14')).toBe(false);
    expect(isPastSessionDate('2026-10-15', '2026-10-14')).toBe(false);
    expect(isPastSessionDate('2026-10-13', '2026-10-14')).toBe(true);
  });
});
