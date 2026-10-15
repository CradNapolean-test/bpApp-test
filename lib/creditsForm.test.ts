import { describe, expect, it } from 'vitest';
import {
  creditKind,
  expiryToIso,
  extraSessionConfirmation,
  friendlyCreditReason,
  extraSessionExpiry,
  packConfirmation,
  parseCreditAmount,
} from './creditsForm';

describe('parseCreditAmount', () => {
  it('accepts a whole number from 1 to 50', () => {
    expect(parseCreditAmount('1')).toEqual({ ok: true, amount: 1 });
    expect(parseCreditAmount(' 12 ')).toEqual({ ok: true, amount: 12 });
    expect(parseCreditAmount('50')).toEqual({ ok: true, amount: 50 });
  });

  it('lets the box be empty while typing, and says what is wrong', () => {
    expect(parseCreditAmount('')).toEqual({ ok: false, error: 'Enter how many credits.' });
    expect(parseCreditAmount('   ').ok).toBe(false);
  });

  it('refuses zero, too many, decimals, negatives and words', () => {
    expect(parseCreditAmount('0').ok).toBe(false);
    expect(parseCreditAmount('51')).toEqual({ ok: false, error: 'Use a number from 1 to 50.' });
    expect(parseCreditAmount('1.5').ok).toBe(false);
    expect(parseCreditAmount('-3').ok).toBe(false);
    expect(parseCreditAmount('two').ok).toBe(false);
  });
});

describe('expiryToIso', () => {
  const now = new Date('2026-10-15T12:00:00Z');

  it('means the end of that day at the gym, not in the browser', () => {
    // 23:59 on the 20th in Auckland (UTC+13 in October) is 10:59 UTC the same day; in London (UTC+1) it is 22:59 UTC.
    expect(expiryToIso('2026-10-20', 'Pacific/Auckland', now)).toEqual({ ok: true, iso: '2026-10-20T10:59:00.000Z' });
    expect(expiryToIso('2026-10-20', 'Europe/London', now)).toEqual({ ok: true, iso: '2026-10-20T22:59:00.000Z' });
  });

  it('means "never" when blank', () => {
    expect(expiryToIso('', 'Europe/London', now)).toEqual({ ok: true, iso: null });
  });

  it('refuses a day that has already ended at the gym', () => {
    expect(expiryToIso('2026-10-14', 'Europe/London', now)).toEqual({ ok: false, error: 'The expiry date must be in the future.' });
  });

  it('still allows today while the gym day is not over', () => {
    expect(expiryToIso('2026-10-15', 'Europe/London', now).ok).toBe(true);
  });

  it('refuses text that is not a date', () => {
    expect(expiryToIso('soon', 'Europe/London', now)).toEqual({ ok: false, error: 'That is not a date.' });
  });
});

describe('extraSessionExpiry', () => {
  it('is a week from now', () => {
    expect(extraSessionExpiry(new Date('2026-10-15T09:00:00Z'))).toBe('2026-10-22T09:00:00.000Z');
  });
});

describe('creditKind', () => {
  it('tells bookings, manual changes and automatic rows apart', () => {
    expect(creditKind({ booking_id: 'b1', granted_by: null })).toBe('booking');
    expect(creditKind({ booking_id: 'b1', granted_by: 'coach' })).toBe('booking');
    expect(creditKind({ booking_id: null, granted_by: 'coach' })).toBe('manual');
    expect(creditKind({ booking_id: null, granted_by: null })).toBe('automatic');
  });
});

describe('confirmation wording', () => {
  it('names the member and what will be added', () => {
    expect(extraSessionConfirmation('Sam').title).toBe('Add an extra session for Sam?');
    expect(extraSessionConfirmation('Sam').body).toMatch(/1 credit that expires in 7 days/);
    const pack = packConfirmation('Sam', { name: 'Ten pack', credits: 10, expires_after_days: 90 });
    expect(pack.title).toBe('Give Sam the "Ten pack" pack?');
    expect(pack.body).toMatch(/10 credits, valid for 90 days/);
    expect(packConfirmation('Sam', { name: 'Drop-in', credits: 1, expires_after_days: null }).body).toMatch(/1 credit, with no expiry/);
  });
});

describe('friendlyCreditReason (CC1)', () => {
  it('words the weekly reset rows for a person', () => {
    expect(friendlyCreditReason('membership reset: week of 2026-10-12')).toBe('Weekly allowance reset · week of 12 Oct');
  });
  it('leaves any other reason as written', () => {
    expect(friendlyCreditReason('Pack: Ten pack')).toBe('Pack: Ten pack');
    expect(friendlyCreditReason('Extra session')).toBe('Extra session');
  });
});
