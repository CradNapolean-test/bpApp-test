import { describe, expect, it } from 'vitest';
import { affectedMembers, classCancelPayload, clockLabel, sessionLabel } from './classCancelPush';

describe('clockLabel', () => {
  it('writes a time the way people say it', () => {
    expect(clockLabel('18:00:00')).toBe('6 pm');
    expect(clockLabel('07:30')).toBe('7:30 am');
    expect(clockLabel('12:00:00')).toBe('12 pm');
    expect(clockLabel('00:15:00')).toBe('12:15 am');
    expect(clockLabel('09:00')).toBe('9 am');
  });

  it('leaves something it does not understand alone', () => {
    expect(clockLabel('late')).toBe('late');
  });
});

describe('sessionLabel', () => {
  it('names the class, the weekday and the time', () => {
    // 2026-10-16 is a Friday
    expect(sessionLabel('Strength & Conditioning', '2026-10-16', '18:00:00')).toBe('Strength & Conditioning on Friday 6 pm');
  });

  it('copes with no start time', () => {
    expect(sessionLabel('Yoga', '2026-10-17', null)).toBe('Yoga on Saturday');
  });
});

describe('classCancelPayload', () => {
  it('tells a booked member the class is cancelled and their credit came back', () => {
    const p = classCancelPayload({ className: 'Strength & Conditioning', date: '2026-10-16', startTime: '18:00:00', refunded: true });
    expect(p.title).toBe('Class cancelled');
    expect(p.body).toBe('Strength & Conditioning on Friday 6 pm is cancelled; your credit was refunded.');
    expect(p.url).toBe('/dashboard?open=book');
  });

  it('does not promise a refund to someone who was only on the waiting list', () => {
    const p = classCancelPayload({ className: 'Yoga', date: '2026-10-16', startTime: '07:00', refunded: false });
    expect(p.body).toBe('Yoga on Friday 7 am is cancelled.');
    expect(p.body).not.toMatch(/credit/);
  });

  it('adds the coach\'s reason, shortened', () => {
    const p = classCancelPayload({ className: 'Yoga', date: '2026-10-16', startTime: '07:00', refunded: true, reason: 'Coach is ill' });
    expect(p.body).toContain('Coach is ill');
    const long = classCancelPayload({ className: 'Yoga', date: '2026-10-16', startTime: '07:00', refunded: true, reason: 'x'.repeat(200) });
    expect(long.body.length).toBeLessThan(180);
  });

  it('uses a tag per session so a repeat replaces the first', () => {
    const a = classCancelPayload({ className: 'Yoga', date: '2026-10-16', startTime: null, refunded: true });
    const b = classCancelPayload({ className: 'Yoga', date: '2026-10-23', startTime: null, refunded: true });
    expect(a.tag).not.toBe(b.tag);
  });
});

describe('affectedMembers', () => {
  it('lists each member once and says who gets a refund', () => {
    const result = affectedMembers([
      { client_id: 'a', status: 'booked' },
      { client_id: 'b', status: 'waitlist' },
      { client_id: 'a', status: 'booked' },
      { client_id: 'c', status: 'cancelled' },
    ]);
    expect(result).toEqual([
      { clientId: 'a', refunded: true },
      { clientId: 'b', refunded: false },
    ]);
  });

  it('is empty when nobody is affected', () => {
    expect(affectedMembers([])).toEqual([]);
  });
});
