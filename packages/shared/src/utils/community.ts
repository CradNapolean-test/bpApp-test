import type { EventWithSignup, RewardRow } from '../data/types';

// Events, feedback, referrals, rewards and the FAQ: the rules and the wording, kept here so the phone app and the web app
// cannot drift. Same behaviour as the web's CommunityTabs.

// ---- events ----

// Events stay listed for 6 hours after they start; the database stops sign-ups at the same point (migration 0112).
export const EVENT_GRACE_MS = 6 * 3600 * 1000;

export type EventState = 'going' | 'full' | 'open' | 'over';

export function eventState(e: Pick<EventWithSignup, 'capacity' | 'signups' | 'signedUp' | 'starts_at'>, now: Date): EventState {
  if (e.signedUp) return 'going'; // always able to leave
  if (new Date(e.starts_at).getTime() < now.getTime() - EVENT_GRACE_MS) return 'over';
  if (e.capacity != null && e.signups >= e.capacity) return 'full';
  return 'open';
}

export function spotsText(e: Pick<EventWithSignup, 'capacity' | 'signups'>): string {
  return `${e.signups} going${e.capacity != null ? ` · ${e.capacity} spots` : ''}`;
}

// ---- feedback ----

export const FEEDBACK_COMMENT_MAX = 1000;

export function validateFeedback(rating: number, comment: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Pick a rating from 1 to 5.';
  if (comment.length > FEEDBACK_COMMENT_MAX) return `Comments can be up to ${FEEDBACK_COMMENT_MAX} characters.`;
  return null;
}

// ---- refer a friend ----

// The member's own gym's referral sign-up page (gyms.referral_url, migration 0138): the referral discount is already applied there, so
// members just share this link. A gym with no link has no Refer a friend (the Home tile and the screen are left out).
export function referMessage(name: string | null | undefined, url: string): string {
  const first = (name ?? '').trim().split(/\s+/)[0] || 'A friend';
  return `${first} here — I train at Ballistic Performance and think you'd love it. Join with my link and your discount is already applied: ${url}`;
}

// ---- rewards ----

export type RewardStatus = {
  value: number; // sessions or months so far
  unit: 'sessions' | 'months';
  given: boolean;
  earned: boolean;
  pct: number; // 0-100 towards the threshold
};

export function rewardStatus(r: Pick<RewardRow, 'id' | 'kind' | 'threshold'>, sessions: number, months: number, grantedIds: string[]): RewardStatus {
  const value = r.kind === 'sessions' ? sessions : months;
  return {
    value,
    unit: r.kind === 'sessions' ? 'sessions' : 'months',
    given: grantedIds.includes(r.id),
    earned: value >= r.threshold,
    pct: Math.min(100, Math.round((value / r.threshold) * 100)),
  };
}

// Earned-but-not-received first, then nearest to being earned, then already received.
export function sortRewards<R extends Pick<RewardRow, 'id' | 'kind' | 'threshold'>>(rewards: R[], sessions: number, months: number, grantedIds: string[]): R[] {
  const progress = (r: R) => (r.kind === 'sessions' ? sessions : months) / r.threshold;
  const rank = (r: R) => (grantedIds.includes(r.id) ? 2 : progress(r) >= 1 ? 0 : 1);
  return [...rewards].sort((a, b) => rank(a) - rank(b) || progress(b) - progress(a));
}

export function rewardCaption(r: Pick<RewardRow, 'kind' | 'threshold' | 'description'>): string {
  return `${r.kind === 'sessions' ? `After ${r.threshold} sessions` : `After ${r.threshold} months as a member`}${r.description ? ` · ${r.description}` : ''}`;
}

// ---- FAQ ----

// DRAFT answers, written from the booking rules in the owner's brief (the same text as the web). The owner should review the
// wording before it goes in front of members.
export const FAQS: { q: string; a: string }[] = [
  { q: 'How do I book a session?', a: 'Open the Book tab, pick a day, and tap Book on the session you want. Your credits are shown at the top.' },
  { q: 'Where can I see my booked sessions?', a: 'Under "My bookings" on the Book tab. They also appear on your Home screen as your next class.' },
  {
    q: 'What is the cancellation policy?',
    a: 'Cancel at least 3 hours before your session to keep your credit. Between 11pm and 5am does not count, so for early-morning sessions you need to cancel by 11pm the night before. Each booking shows its exact cancel-by time. Cancel later than that and the credit is lost.',
  },
  { q: 'What if a session is full?', a: 'Tap Waitlist. If a spot opens and you have enough credits, you are booked in automatically and we let you know.' },
  { q: 'When do my weekly credits reset?', a: 'Every Saturday, so you can book the week ahead. Your Credits screen shows your balance and your plan.' },
  { q: 'How far ahead can I book?', a: 'Challenge members can book 2 weeks ahead. Full and Big Dog members can book 2 weeks and 5 days ahead.' },
  { q: 'What are Strong and Big Dog memberships?', a: 'Strong gives you 3 sessions a week. Big Dog gives you unlimited sessions.' },
  {
    q: 'What are the Big Dog T-shirts?',
    a: 'Hit the Big Dog standard in one exercise for a White shirt, 3 for Turquoise, 6 for Silver, and every exercise for Gold. Your standards are on your profile.',
  },
  { q: 'How do I refer a friend?', a: 'Open Refer a friend, tap Share, and send them your link. Their discount is already applied.' },
];
