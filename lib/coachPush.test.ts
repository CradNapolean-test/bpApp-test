import { describe, expect, it } from 'vitest';
import { BURST_WINDOW_MS, coachPushPayload, decideCoachPush, hourInZone, isQuietHour } from './coachPush';

const LONDON = 'Europe/London';
// 2026-07-10 is British Summer Time: London is UTC+1.
const at = (utc: string) => new Date(`2026-07-10T${utc}Z`);

describe('hourInZone', () => {
  it('reads the hour in the gym\'s timezone, not the server\'s', () => {
    expect(hourInZone(at('20:30:00'), LONDON)).toBe(21);
    expect(hourInZone(at('20:30:00'), 'UTC')).toBe(20);
    expect(hourInZone(at('23:30:00'), 'Pacific/Auckland')).toBe(11);
  });

  it('shows midnight as 0, not 24', () => {
    expect(hourInZone(at('23:10:00'), LONDON)).toBe(0);
  });

  it('falls back to UTC for a timezone it does not know', () => {
    expect(hourInZone(at('08:00:00'), 'Not/AZone')).toBe(8);
  });
});

describe('isQuietHour (21:00 to 07:00 gym time)', () => {
  it('is quiet in the evening, overnight and in the early morning', () => {
    expect(isQuietHour(at('20:00:00'), LONDON)).toBe(true); // 21:00 BST
    expect(isQuietHour(at('22:59:00'), LONDON)).toBe(true); // 23:59 BST
    expect(isQuietHour(at('03:00:00'), LONDON)).toBe(true); // 04:00 BST
    expect(isQuietHour(at('05:59:00'), LONDON)).toBe(true); // 06:59 BST
  });

  it('is not quiet from 07:00 until 21:00', () => {
    expect(isQuietHour(at('06:00:00'), LONDON)).toBe(false); // 07:00 BST
    expect(isQuietHour(at('12:00:00'), LONDON)).toBe(false);
    expect(isQuietHour(at('19:59:00'), LONDON)).toBe(false); // 20:59 BST
  });

  it('follows the gym, not the server', () => {
    // 20:30 UTC is 21:30 in London (quiet) but 08:30 the next morning in Auckland (not quiet).
    expect(isQuietHour(at('20:30:00'), LONDON)).toBe(true);
    expect(isQuietHour(at('20:30:00'), 'Pacific/Auckland')).toBe(false);
  });
});

describe('decideCoachPush', () => {
  const noon = at('11:00:00'); // 12:00 BST

  it('pushes the first message of the day', () => {
    expect(decideCoachPush({ now: noon, timeZone: LONDON, previousMemberMessageAt: null })).toEqual({ push: true });
  });

  it('does not push in quiet hours, whatever else is true', () => {
    expect(decideCoachPush({ now: at('22:00:00'), timeZone: LONDON, previousMemberMessageAt: null })).toEqual({ push: false, reason: 'quiet-hours' });
  });

  it('does not push again within 5 minutes of the member\'s last message (one buzz per burst)', () => {
    const justBefore = new Date(noon.getTime() - 60_000);
    expect(decideCoachPush({ now: noon, timeZone: LONDON, previousMemberMessageAt: justBefore })).toEqual({ push: false, reason: 'same-burst' });
    const almost = new Date(noon.getTime() - BURST_WINDOW_MS + 1);
    expect(decideCoachPush({ now: noon, timeZone: LONDON, previousMemberMessageAt: almost })).toEqual({ push: false, reason: 'same-burst' });
  });

  it('pushes again once 5 minutes of quiet have passed', () => {
    const exactly = new Date(noon.getTime() - BURST_WINDOW_MS);
    expect(decideCoachPush({ now: noon, timeZone: LONDON, previousMemberMessageAt: exactly })).toEqual({ push: true });
    const earlier = new Date(noon.getTime() - 2 * 3600_000);
    expect(decideCoachPush({ now: noon, timeZone: LONDON, previousMemberMessageAt: earlier })).toEqual({ push: true });
  });

  it('a run of messages gives one push: the first, not the rest', () => {
    const times = [0, 1, 2, 3, 4].map((m) => new Date(noon.getTime() + m * 60_000));
    const decisions = times.map((now, i) => decideCoachPush({ now, timeZone: LONDON, previousMemberMessageAt: i === 0 ? null : times[i - 1] }));
    expect(decisions.filter((d) => d.push)).toHaveLength(1);
    expect(decisions[0]).toEqual({ push: true });
  });
});

describe('coachPushPayload', () => {
  it('names the member by first name and carries no message text', () => {
    const payload = coachPushPayload('Alex Smith', 'client-1');
    expect(payload.title).toBe('New message from Alex');
    expect(payload.body).toBe('Open the app to read it.');
  });

  it('opens the conversation and replaces earlier notifications for the same member', () => {
    const payload = coachPushPayload('Alex', 'client-1');
    expect(payload.url).toBe('/coach/clients/client-1?open=messages');
    expect(payload.tag).toBe('chat-client-1');
    expect(coachPushPayload('Alex', 'client-2').tag).not.toBe(payload.tag);
  });

  it('copes with no name', () => {
    expect(coachPushPayload(null, 'c').title).toBe('New message from a member');
    expect(coachPushPayload('   ', 'c').title).toBe('New message from a member');
  });
});
