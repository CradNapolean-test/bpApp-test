import { describe, expect, it } from 'vitest';
import { fillPercent, slotPopularity, type PopularityBooking, type PopularityClass } from './slotPopularity';

// 2 Nov 2026 is a Monday. The period below is Mon 2 to Sun 15 Nov: two Mondays and two Tuesdays.
const FROM = '2026-11-02';
const TO = '2026-11-15';

const cls = (over: Partial<PopularityClass> & { id: string }): PopularityClass => ({ day_of_week: 1, specific_date: null, capacity: 10, retired_at: null, ...over });
const bk = (over: Partial<PopularityBooking> & { class_id: string; booking_date: string }): PopularityBooking => ({ status: 'booked', attended: false, no_show: false, ...over });
const label = (id: string) => id;

describe('slotPopularity', () => {
  it('fills are places taken over places offered by every session that ran, empty ones too (CS15)', () => {
    const [mon] = slotPopularity([cls({ id: 'mon' })], [bk({ class_id: 'mon', booking_date: '2026-11-02' }), bk({ class_id: 'mon', booking_date: '2026-11-02' })], new Set(), FROM, TO, label);
    expect(mon).toMatchObject({ sessions: 2, places: 20, bookingCount: 2 });
    expect(fillPercent(mon)).toBe(10);
  });

  it('ranks a small full slot above a big half-empty one', () => {
    const rows = slotPopularity(
      [cls({ id: 'big', capacity: 20 }), cls({ id: 'small', day_of_week: 2, capacity: 4 })],
      [
        ...Array.from({ length: 10 }, () => bk({ class_id: 'big', booking_date: '2026-11-02' })),
        ...Array.from({ length: 4 }, () => bk({ class_id: 'small', booking_date: '2026-11-03' })),
        ...Array.from({ length: 4 }, () => bk({ class_id: 'small', booking_date: '2026-11-10' })),
      ],
      new Set(),
      FROM,
      TO,
      label
    );
    expect(rows.map((r) => [r.className, fillPercent(r)])).toEqual([
      ['small', 100],
      ['big', 25],
    ]);
  });

  it('leaves out bookings after the last day counted, so upcoming ones never read as "didn\'t come" (CS28)', () => {
    const [mon] = slotPopularity(
      [cls({ id: 'mon' })],
      [bk({ class_id: 'mon', booking_date: '2026-11-09', attended: true }), bk({ class_id: 'mon', booking_date: '2026-11-16' }), bk({ class_id: 'mon', booking_date: '2026-11-23' })],
      new Set(),
      FROM,
      TO,
      label
    );
    expect(mon).toMatchObject({ bookingCount: 1, marked: 1, attended: 1 });
  });

  it('counts the waitlist as no place taken, and marked as attended or no-show', () => {
    const [mon] = slotPopularity(
      [cls({ id: 'mon' })],
      [
        bk({ class_id: 'mon', booking_date: '2026-11-02', attended: true }),
        bk({ class_id: 'mon', booking_date: '2026-11-02', no_show: true }),
        bk({ class_id: 'mon', booking_date: '2026-11-02' }),
        bk({ class_id: 'mon', booking_date: '2026-11-02', status: 'waitlist' }),
      ],
      new Set(),
      FROM,
      TO,
      label
    );
    expect(mon).toMatchObject({ bookingCount: 3, marked: 2, attended: 1 });
  });

  it('skips cancelled dates and dates after the slot was retired', () => {
    const [cancelledOnce] = slotPopularity([cls({ id: 'mon' })], [], new Set(['mon|2026-11-09']), FROM, TO, label);
    expect(cancelledOnce.sessions).toBe(1);
    const [retired] = slotPopularity([cls({ id: 'mon', retired_at: '2026-11-05T10:00:00Z' })], [], new Set(), FROM, TO, label);
    expect(retired.sessions).toBe(1);
  });

  it('counts a one-off only on its date, and leaves out slots with no session in the period', () => {
    const rows = slotPopularity(
      [cls({ id: 'oneoff', day_of_week: 3, specific_date: '2026-11-04' }), cls({ id: 'later', day_of_week: 3, specific_date: '2026-11-25' }), cls({ id: 'sunday', day_of_week: 0, retired_at: '2026-11-01T00:00:00Z' })],
      [],
      new Set(),
      FROM,
      TO,
      label
    );
    expect(rows.map((r) => [r.className, r.sessions])).toEqual([['oneoff', 1]]);
  });

  it('counts a date with places taken even if the slot has since moved to another day', () => {
    const [moved] = slotPopularity([cls({ id: 'mon', day_of_week: 2 })], [bk({ class_id: 'mon', booking_date: '2026-11-02' })], new Set(), FROM, TO, label);
    expect(moved.sessions).toBe(3);
  });

  it('counts nothing when the period has no finished day yet', () => {
    expect(slotPopularity([cls({ id: 'mon' })], [], new Set(), '2026-11-10', '2026-11-09', label)).toEqual([]);
  });
});
