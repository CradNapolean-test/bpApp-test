import { describe, expect, it } from 'vitest';
import { checkinToday, homeWeek } from './memberHome';

const b = (booking_date: string, attended = false, status = 'booked') => ({ booking_date, attended, status });

describe('homeWeek', () => {
  // Wednesday 11 November 2026.
  const today = '2026-11-11';

  it('runs Monday to Sunday of the week today is in', () => {
    const { days } = homeWeek([], today);
    expect(days.map((d) => d.iso)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days.find((d) => d.isToday)?.dayNum).toBe(11);
  });

  it('keeps Sunday in the week that started the Monday before', () => {
    const { days } = homeWeek([], '2026-11-15');
    expect(days[0].iso).toBe('2026-11-09');
    expect(days[6].isToday).toBe(true);
  });

  it('marks attended days as trained, today as today, and later bookings as booked', () => {
    const { days, caption } = homeWeek([b('2026-11-09', true), b('2026-11-11'), b('2026-11-13')], today);
    expect(days.map((d) => d.state)).toEqual(['trained', 'plain', 'today', 'plain', 'booked', 'plain', 'plain']);
    expect(caption).toBe('1 session done this week. Booked today and Friday.');
  });

  it('shows a session attended today as trained and no longer as booked', () => {
    const { days, caption } = homeWeek([b('2026-11-11', true)], today);
    expect(days[2].state).toBe('trained');
    expect(days[2].description).toBe('Wednesday 11, today, trained');
    expect(caption).toBe('1 session done this week. Nothing booked yet.');
  });

  it('ignores cancelled bookings, waitlist places and missed sessions earlier in the week', () => {
    const { days, caption } = homeWeek([b('2026-11-13', false, 'cancelled'), b('2026-11-14', false, 'waitlist'), b('2026-11-10')], today);
    expect(days.every((d) => d.state === 'plain' || d.state === 'today')).toBe(true);
    expect(caption).toBe('No sessions done yet this week. Nothing booked yet.');
  });

  it('lists three or more booked days with commas and "and"', () => {
    const { caption } = homeWeek([b('2026-11-09', true), b('2026-11-10', true), b('2026-11-11'), b('2026-11-12'), b('2026-11-14')], today);
    expect(caption).toBe('2 sessions done this week. Booked today, Thursday and Saturday.');
  });

  it('leaves out bookings in other weeks', () => {
    const { caption } = homeWeek([b('2026-11-16'), b('2026-11-06', true)], today);
    expect(caption).toBe('No sessions done yet this week. Nothing booked yet.');
  });
});

describe('checkinToday', () => {
  const log = (over: Partial<{ sleep: number | null; steps: number | null; water: number | null; bodyweight: number | null }>) => ({
    sleep: null,
    steps: null,
    water: null,
    bodyweight: null,
    ...over,
  });
  const all = ['sleep', 'steps', 'water'];

  it('is done when every tracker that is switched on is in', () => {
    expect(checkinToday(log({ sleep: 7.5, steps: 6500, water: 2, bodyweight: 82.4 }), all)).toEqual({ done: true, detail: 'Done. 82.4 kg.' });
    expect(checkinToday(log({ sleep: 7.5, steps: 6500, water: 2 }), all)).toEqual({ done: true, detail: 'Done for today.' });
    expect(checkinToday(log({ sleep: 7 }), ['sleep'])).toEqual({ done: true, detail: 'Done for today.' });
  });

  it('counts what is in so far', () => {
    expect(checkinToday(log({ sleep: 7.5 }), all)).toEqual({ done: false, detail: '1 of 3 in so far' });
  });

  it('names what to log when nothing is in', () => {
    expect(checkinToday(null, all)).toEqual({ done: false, detail: 'Sleep, steps and water for today' });
    expect(checkinToday(undefined, ['sleep', 'water'])).toEqual({ done: false, detail: 'Sleep and water for today' });
  });

  it('goes by bodyweight when sleep, steps and water are all switched off', () => {
    expect(checkinToday(log({ bodyweight: 82.4 }), [])).toEqual({ done: true, detail: 'Done. 82.4 kg.' });
    expect(checkinToday(log({}), [])).toEqual({ done: false, detail: "Today's weigh-in and how you feel" });
  });
});
