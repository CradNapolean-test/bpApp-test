import { describe, expect, it } from 'vitest';
import { CLUB_MILESTONES } from './clubs';
import { CHECKIN_CLOSES_AFTER_MIN, CHECKIN_OPENS_BEFORE_MIN } from './checkinWindow';
import { FAQ_TODO, buildFaqs, describeClubs, planEndFaq } from './faqContent';

const base = {
  planName: 'Strong',
  creditsPerWeek: 3,
  advanceBookingDays: 14,
  cancellation: 'Cancel at least 3 hours before a session to keep your credit.',
  referralUrl: 'https://example.com/refer',
};
const answer = (faqs: { q: string; a: string }[], q: RegExp) => faqs.find((f) => q.test(f.q))?.a ?? '';

describe('describeClubs (R16)', () => {
  it('uses the club list the Home screen uses, not a fixed 100, 200, 300', () => {
    expect(describeClubs()).toBe('100, 250 and 500 sessions, then a new club every 500 sessions after that');
    expect(describeClubs([50, 150])).toBe('50 and 150 sessions, then a new club every 500 sessions after that');
    for (const m of CLUB_MILESTONES) expect(describeClubs()).toContain(String(m));
  });
});

describe('buildFaqs (R16)', () => {
  it('takes the cancellation rule from the gym', () => {
    expect(answer(buildFaqs(base), /cancellation/i)).toContain('at least 3 hours');
    expect(answer(buildFaqs({ ...base, cancellation: 'Each session has its own cancel-by time.' }), /cancellation/i)).toContain('its own cancel-by time');
  });

  it('takes the plan name, credits and booking window from the member', () => {
    const faqs = buildFaqs(base);
    expect(answer(faqs, /my plan/i)).toContain('Strong');
    expect(answer(faqs, /my plan/i)).toContain('3 credits a week');
    expect(answer(faqs, /how far ahead/i)).toContain('14 days');
    expect(answer(buildFaqs({ ...base, creditsPerWeek: 1 }), /my plan/i)).toContain('1 credit a week');
  });

  it('does not invent a plan for a member who has none', () => {
    const faqs = buildFaqs({ ...base, planName: null, creditsPerWeek: null, advanceBookingDays: null });
    expect(answer(faqs, /my plan/i)).toContain('Your coach sets up your plan');
    expect(answer(faqs, /how far ahead/i)).not.toMatch(/\d+ days/);
  });

  it('states the same check-in window the button and the server use', () => {
    const text = answer(buildFaqs(base), /check in/i);
    expect(text).toContain(`${CHECKIN_OPENS_BEFORE_MIN} minutes before`);
    expect(text).toContain(`${CHECKIN_CLOSES_AFTER_MIN} minutes after`);
  });

  it('leaves out the referral answer when the gym has no referral page', () => {
    expect(buildFaqs(base).some((f) => /refer/i.test(f.q))).toBe(true);
    expect(buildFaqs({ ...base, referralUrl: null }).some((f) => /refer/i.test(f.q))).toBe(false);
  });

  it('no longer says things that are not true', () => {
    const all = buildFaqs(base).map((f) => `${f.q} ${f.a}`).join(' ');
    expect(all).not.toMatch(/200, 300|My progress|discount is already applied|Strong gives you 3 sessions|Challenge members/);
  });

  it('keeps a visible list of what the owner must confirm', () => {
    expect(FAQ_TODO.length).toBeGreaterThan(0);
  });
});

describe('Email your coach', () => {
  it('is added with the coach address only when it is known', () => {
    const withEmail = buildFaqs({ ...base, coachEmail: 'coach@example.com' }).find((f) => f.q === 'Email your coach');
    expect(withEmail?.email).toBe('coach@example.com');
    expect(buildFaqs(base).some((f) => f.q === 'Email your coach')).toBe(false);
    expect(buildFaqs({ ...base, coachEmail: null }).some((f) => f.q === 'Email your coach')).toBe(false);
  });
});

describe('the plan end date (D5, MX19)', () => {
  const challenge = { ...base, planName: '6 Week Challenge', planEndsOn: '2026-11-14', planFixedLength: true };
  it('gives the end date in the plan answer and in its own question, after the plan answer', () => {
    const faqs = buildFaqs(challenge);
    expect(answer(faqs, /my plan include/i)).toContain('It ends on Saturday 14 November 2026.');
    const at = faqs.findIndex((f) => f.q === 'When does my plan end?');
    expect(faqs[at - 1].q).toBe('What does my plan include?');
    expect(faqs[at].a).toBe(
      "Your 6 Week Challenge ends on Saturday 14 November 2026. In its last two weeks your Home screen shows what comes next: carry on with one of the gym's ongoing plans, or talk it through with your coach."
    );
  });
  it('points an ongoing plan with an end date at the coach instead', () => {
    expect(planEndFaq('Big Dog', '2026-12-31')?.a).toBe('Your Big Dog ends on Thursday 31 December 2026. To carry on after that, message your coach.');
  });
  it('adds nothing without an end date or a plan', () => {
    expect(buildFaqs(base).some((f) => f.q === 'When does my plan end?')).toBe(false);
    expect(answer(buildFaqs(base), /my plan include/i)).not.toContain('ends on');
    expect(buildFaqs({ ...challenge, planName: null }).some((f) => f.q === 'When does my plan end?')).toBe(false);
    expect(planEndFaq('Big Dog', null)).toBeNull();
  });
});
