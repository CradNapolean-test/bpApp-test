import { describe, expect, it } from 'vitest';
import { bookedRecipients, canMessageSession, membersWord, sessionMessageConfirm, sessionMessageProblem, SESSION_MESSAGE_MAX } from './sessionMessage';

describe('"Message everyone booked" (BK16)', () => {
  it('reaches booked members only: not the waitlist, not anyone cancelled or removed', () => {
    const roster = [
      { clientId: 'a', status: 'booked' },
      { clientId: 'b', status: 'waitlist' },
      { clientId: 'c', status: 'cancelled' }, // cancelled by the member, or removed by a coach
      { clientId: 'd', status: 'booked' },
    ];
    expect(bookedRecipients(roster)).toEqual(['a', 'd']);
    expect(bookedRecipients([])).toEqual([]);
    expect(bookedRecipients([{ clientId: 'b', status: 'waitlist' }])).toEqual([]);
  });

  it('sends one message per member', () => {
    expect(bookedRecipients([{ clientId: 'a', status: 'booked' }, { clientId: 'a', status: 'booked' }])).toEqual(['a']);
  });

  it('the confirm says how many members it goes to', () => {
    const c = sessionMessageConfirm(6, '6:00pm Strength on Wednesday 25 November');
    expect(c.title).toBe('Send this to 6 members?');
    expect(c.confirmLabel).toBe('Send to 6 members');
    expect(c.body).toContain('Not the waitlist');
    expect(sessionMessageConfirm(1, 'x').title).toBe('Send this to 1 member?');
    expect(membersWord(0)).toBe('0 members');
  });

  it('needs words, within the chat limit', () => {
    expect(sessionMessageProblem('   ')).toBe('Write a message first.');
    expect(sessionMessageProblem('Car park closed tonight, use the side gate')).toBeNull();
    expect(sessionMessageProblem('x'.repeat(SESSION_MESSAGE_MAX))).toBeNull();
    expect(sessionMessageProblem('x'.repeat(SESSION_MESSAGE_MAX + 1))).toMatch(/too long/);
  });

  it('is offered for a session from yesterday on, as the database allows (review finding 5)', () => {
    expect(canMessageSession('2026-11-26', '2026-11-27')).toBe(true);
    expect(canMessageSession('2026-11-27', '2026-11-27')).toBe(true);
    expect(canMessageSession('2026-12-03', '2026-11-27')).toBe(true);
    expect(canMessageSession('2026-11-25', '2026-11-27')).toBe(false);
    // Across a month end.
    expect(canMessageSession('2026-11-30', '2026-12-01')).toBe(true);
    expect(SESSION_MESSAGE_MAX).toBeLessThanOrEqual(4000 - 60);
  });
});
