import { describe, expect, it } from 'vitest';
import { cancelDeadline } from './utils/cancelDeadline';
import { waitlistPromotionPayload } from './waitlistPromotionPush';

// BK9: the member moved off the waitlist is told when the session is and how to get the credit back. 2026-11-12 is a Thursday.
describe('waitlistPromotionPayload', () => {
  it('after the cancel deadline: says a cancel before the start gets a full refund (decision D1)', () => {
    const p = waitlistPromotionPayload({ className: 'Strength & Conditioning', date: '2026-11-12', startTime: '06:00:00', promotedAfterCutoff: true, deadline: null });
    expect(p.title).toBe("You're off the waitlist");
    expect(p.body).toBe("You're booked into Strength & Conditioning on Thursday 6 am. Can't make it? Cancel before it starts for a full refund.");
    expect(p.url).toBe('/dashboard?open=book');
  });

  it('before the deadline: gives the cancel-by time', () => {
    const deadline = cancelDeadline('2026-11-12', '06:00', 3, '23:00', '05:00');
    const p = waitlistPromotionPayload({ className: 'Strength & Conditioning', date: '2026-11-12', startTime: '06:00:00', promotedAfterCutoff: false, deadline });
    expect(p.body).toBe("You're booked into Strength & Conditioning on Thursday 6 am. Cancel by 11pm the night before to keep your credit.");
  });

  it('a second promotion for the same session replaces the first on the phone', () => {
    const a = waitlistPromotionPayload({ className: 'Yoga', date: '2026-11-12', startTime: null, promotedAfterCutoff: true, deadline: null });
    expect(a.tag).toBe('waitlist-2026-11-12-Yoga');
    expect(a.body).toBe("You're booked into Yoga on Thursday. Can't make it? Cancel before it starts for a full refund.");
  });
});
