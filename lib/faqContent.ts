import { CLUB_MILESTONES } from './clubs';
import { CHECKIN_CLOSES_AFTER_MIN, CHECKIN_OPENS_BEFORE_MIN } from './checkinWindow';

// The member FAQ (R16, DECISION D7). The answers used to be one hard-coded list written for a single gym: club sizes that did not match
// the real ones, a "My progress" tab that no longer exists, plan names and session counts that did not match the live plans, a fixed
// cancellation rule, and "your discount is already applied" for a referral that credits nothing. Whatever the app already knows now
// comes from the app's own data (the club milestones, the member's plan, the gym's cancellation rule and the check-in window); the rest
// is plain text in this one file for the owner to edit.
//
// TODO(owner) -- statements below that only the gym can confirm. Each one is wording in this file, not code:
//  - "How do I check in" and "What is the daily check-in": the three daily numbers shown are sleep, steps and water; a gym can switch
//    metrics off per member.
//  - The Big Dog T-shirt tiers (White 1, Turquoise 3, Silver 6, Gold all): confirm they are the gym's current standards.
//  - "Where to see booked sessions", "How do I get in touch with my coach" and the InBody answer describe screens that may be renamed.
//  - Anything from the TeamUp FAQ the gym wants members to find here.
export const FAQ_TODO: readonly string[] = [
  'Confirm the Big Dog T-shirt tiers.',
  'Confirm the daily check-in numbers (sleep, steps, water).',
  'Add anything from the TeamUp FAQ.',
  'Check the privacy and terms links lead to the published policy (D13).',
];

export interface Faq {
  q: string;
  a: string;
}

export interface FaqInputs {
  planName: string | null;
  creditsPerWeek: number | null;
  advanceBookingDays: number | null;
  // The gym's cancellation rule as a sentence (lib/bookingRules.ts cancellationPolicyText).
  cancellation: string;
  // The gym's referral page, or null when it has none (then the referral question is left out).
  referralUrl: string | null;
}

// "100, 250 and 500, then every 500 after that", from the club list the Home screen uses.
export function describeClubs(milestones: readonly number[] = CLUB_MILESTONES): string {
  const list = milestones.length > 1 ? `${milestones.slice(0, -1).join(', ')} and ${milestones[milestones.length - 1]}` : String(milestones[0] ?? '');
  return `${list} sessions, then a new club every 500 sessions after that`;
}

export function buildFaqs(input: FaqInputs): Faq[] {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const plan = input.planName
    ? `You are on ${input.planName}${input.creditsPerWeek != null ? `, which gives you ${plural(input.creditsPerWeek, 'credit')} a week. Your weekly credits reset every Monday.` : '.'} Each session uses the credits shown on it, and your Credits screen shows your balance.`
    : 'Your coach sets up your plan. Ask them what it includes. Your credits are shown at the top of the Book tab.';
  const ahead =
    input.advanceBookingDays != null
      ? `Your plan lets you book up to ${plural(input.advanceBookingDays, 'day')} ahead. The Book tab shows every day you can book.`
      : 'The Book tab shows every day you can book. Ask your coach if you need to book further ahead.';

  const faqs: Faq[] = [
    { q: 'How do I book a session?', a: 'Open the Book tab, pick a day, and tap Book on the session you want. Your credits are shown at the top.' },
    { q: 'Where can I see my booked sessions?', a: 'Under "My bookings" on the Book tab. They also appear on your Home screen as your next class.' },
    { q: 'What is the cancellation policy?', a: `${input.cancellation} Cancel later than that and the credit is lost.` },
    { q: 'What if a session is full?', a: 'Tap Waitlist. If a spot opens and you have enough credits, you are booked in automatically and we let you know.' },
    { q: 'How far ahead can I book?', a: ahead },
    { q: 'What does my plan include?', a: plan },
    {
      q: 'What are the Big Dog T-shirts?',
      a: 'Hit the Big Dog standard in one exercise for a White shirt, 3 for Turquoise, 6 for Silver, and every exercise for Gold. Your standards are on your profile.',
    },
    {
      q: 'How do I check in to a session?',
      a: `Check-in opens ${plural(CHECKIN_OPENS_BEFORE_MIN, 'minute')} before your session and closes ${plural(CHECKIN_CLOSES_AFTER_MIN, 'minute')} after it starts. Open Home or the Book tab and tap Check in.`,
    },
    { q: 'What is the daily check-in?', a: 'Three quick numbers each day: sleep, steps and water. It takes a few seconds and helps your coach see how you are going.' },
    { q: 'How do I get in touch with my coach?', a: 'Open the Coach tab. Use Message for the chat (voice notes and photos work too), or Email your coach if you would rather write an email.' },
    { q: 'How do I add my InBody results?', a: 'Go to Progress, then Body Scans, and add the numbers from your InBody printout. You can attach a photo of the printout too.' },
    { q: 'What are the session clubs?', a: `Clubs mark the sessions you have attended: ${describeClubs()}. Your progress towards the next club is on your Home screen.` },
    { q: 'How do I get my reward?', a: 'When a reward shows Earned on the Rewards screen, ask your coach and they will give it to you.' },
  ];
  if (input.referralUrl) {
    faqs.push({ q: 'How do I refer a friend?', a: 'Open Refer a friend, tap Share, and send them your link.' });
  }
  return faqs;
}
