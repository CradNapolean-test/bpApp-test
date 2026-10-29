import { describe, expect, it } from 'vitest';

import { BLANK_ANSWERS, BODY_ADDED_REASON, FULL_STEPS, SHORT_STEPS, SHORT_STEPS_WITH_BODY, answersFromProfile, firstProblem, planFor, shortBodyFields, stepError, toFullOnboardingRow, toShortOnboardingRow, type OnboardingAnswers } from './onboardingForm';

const today = new Date('2026-10-12T09:00:00Z');
const full: OnboardingAnswers = {
  ...BLANK_ANSWERS,
  consent: true,
  name: ' Jordan Seed ',
  gender: 'Female',
  dob: '1990-05-01',
  phone: '07700 900123',
  emName: 'Sam',
  emPhone: '07700 900456',
  goal: 'Lose fat',
  experience: 'New',
  health: '',
  heightCm: 168,
  weightKg: 82,
  goalKg: 70,
  activity: 1.5,
};

describe('stepError', () => {
  it('passes a complete set of answers', () => {
    for (const s of FULL_STEPS) expect(stepError(s, full, today)).toBeNull();
  });
  it('consent: the member has to agree before going on', () => {
    expect(stepError('consent', { ...full, consent: false }, today)).toMatch(/agree/);
    expect(stepError('consent', full, today)).toBeNull();
  });
  it('about: nobody under 16 is set up in the app (the coach does it)', () => {
    expect(stepError('about', { ...full, dob: '2011-01-01' }, today)).toMatch(/ask your coach/); // 15
    expect(stepError('about', { ...full, dob: '2010-10-12' }, today)).toBeNull(); // exactly 16 today
  });
  it('body: the activity level has to be one of the offered levels', () => {
    expect(stepError('body', { ...full, activity: 1.7 }, today)).toMatch(/active/);
  });
  it('about: needs name, gender, a real date of birth, a phone and an emergency contact', () => {
    expect(stepError('about', { ...full, name: '' }, today)).toMatch(/name/);
    expect(stepError('about', { ...full, gender: null }, today)).toMatch(/gender/);
    expect(stepError('about', { ...full, dob: '' }, today)).toMatch(/date of birth/);
    expect(stepError('about', { ...full, dob: '2024-01-01' }, today)).toMatch(/ask your coach/);
    expect(stepError('about', { ...full, phone: ' ' }, today)).toMatch(/mobile/);
    expect(stepError('about', { ...full, emPhone: '' }, today)).toMatch(/emergency/);
  });
  it('goal: needs a goal and keeps text inside the limits', () => {
    expect(stepError('goal', { ...full, goal: '  ' }, today)).toMatch(/goal/);
    expect(stepError('goal', { ...full, goal: 'x'.repeat(5001) }, today)).toMatch(/5000/);
    expect(stepError('goal', { ...full, health: 'x'.repeat(2001) }, today)).toMatch(/2000/);
  });
  it('body: checks height, weights and a typed body fat', () => {
    expect(stepError('body', { ...full, heightCm: null }, today)).toMatch(/height/);
    expect(stepError('body', { ...full, heightCm: 119 }, today)).toMatch(/height/);
    expect(stepError('body', { ...full, weightKg: 29 }, today)).toMatch(/current weight/);
    expect(stepError('body', { ...full, goalKg: 301 }, today)).toMatch(/goal weight/);
    expect(stepError('body', { ...full, knowsBf: true, bf: '2' }, today)).toMatch(/body fat/);
    expect(stepError('body', { ...full, knowsBf: true, bf: '' }, today)).toMatch(/body fat/);
    expect(stepError('body', { ...full, knowsBf: true, bf: '28' }, today)).toBeNull();
  });
});

describe('firstProblem', () => {
  it('finds the first failing step in the flow the member is on', () => {
    expect(firstProblem(FULL_STEPS, full, today)).toBeNull();
    expect(firstProblem(FULL_STEPS, { ...full, heightCm: null }, today)).toMatch(/height/);
    // the short flow has no body step, so missing body figures are fine there
    expect(firstProblem(SHORT_STEPS, { ...full, heightCm: null, weightKg: null, goalKg: null }, today)).toBeNull();
  });
});

describe('planFor', () => {
  it('works out a plan once the answers are enough, and not before', () => {
    expect(planFor({ ...full, heightCm: null }, today)).toBeNull();
    const plan = planFor(full, today);
    expect(plan).not.toBeNull();
    expect(plan!.calories).toBeGreaterThan(1000);
    expect(plan!.bodyFatEstimated).toBe(true);
    expect(plan!.reasons).toContain('Body fat was estimated, not measured');
  });
  it('uses a typed body fat instead of an estimate', () => {
    const plan = planFor({ ...full, knowsBf: true, bf: '31' }, today);
    expect(plan!.bodyFatEstimated).toBe(false);
    expect(plan!.bodyFatPct).toBe(31);
  });
});

describe('toFullOnboardingRow', () => {
  const plan = planFor(full, today)!;
  const row = toFullOnboardingRow(full, plan, '2026-10-12T09:00:00.000Z', 36);
  it('carries the answers, the plan figures and the review flag', () => {
    expect(row.name).toBe('Jordan Seed');
    expect(row.age).toBe(36);
    expect(row.height_cm).toBe(168);
    expect(row.start_weight).toBe(82);
    expect(row.goal_weight).toBe(70);
    expect(row.body_fat_pct).toBe(plan.bodyFatPct);
    expect(row.body_fat_estimated).toBe(true);
    expect(row.needs_coach_review).toBe(true);
    expect(row.review_reasons).toEqual(plan.reasons);
    expect(row.onboarding_completed_at).toBe('2026-10-12T09:00:00.000Z');
    expect(row.nutrition_goal).toBe('fat_loss');
    expect(row.nutrition_setting).toBe('steady');
    expect(row.consented_at).toBe('2026-10-12T09:00:00.000Z');
    expect(Object.keys(row)).not.toContain('tier');
    expect(row.cycling).toBe(false);
    expect(row.diet_approach).toBe('High Carb Low Fat');
    expect(row.timezone).toBe('Europe/London');
  });
  it('never sets a coach-managed column', () => {
    for (const k of ['checkin_reminder_days', 'join_date', 'referral_source', 'admin_notes', 'client_id']) expect(Object.keys(row)).not.toContain(k);
  });
});

describe('toShortOnboardingRow', () => {
  const row = toShortOnboardingRow(full, '2026-10-12T09:00:00.000Z', 36);
  it('updates details, goal and tracking method only', () => {
    expect(row.nutrition_tracking_mode).toBe('full_tracking');
    expect(row.onboarding_completed_at).toBe('2026-10-12T09:00:00.000Z');
    for (const k of ['start_weight', 'goal_weight', 'height_cm', 'tier', 'diet_approach', 'nutrition_goal', 'nutrition_setting', 'needs_coach_review', 'review_reasons', 'body_fat_pct', 'activity_level']) {
      expect(Object.keys(row)).not.toContain(k);
    }
  });
  it('records the consent and closes the request to check details', () => {
    expect(row.consented_at).toBe('2026-10-12T09:00:00.000Z');
    expect(row.details_confirm_requested_at).toBeNull();
  });
});

describe('the short flow with a body step (OB3)', () => {
  it('has the body step between goal and food', () => {
    expect(SHORT_STEPS_WITH_BODY).toEqual(['consent', 'about', 'goal', 'body', 'food']);
    expect(SHORT_STEPS).not.toContain('body');
  });
  const plan = planFor(full, today)!;
  it('fills in only what is missing and flags the member for their coach', () => {
    const fields = shortBodyFields(full, plan, { height_cm: null, start_weight: 90, goal_weight: null, body_fat_pct: 30, review_reasons: ['Earlier reason'] });
    expect(fields.height_cm).toBe(168);
    expect(fields.goal_weight).toBe(70);
    expect(Object.keys(fields)).not.toContain('start_weight'); // the coach's figure is kept
    expect(Object.keys(fields)).not.toContain('body_fat_pct');
    expect(fields.needs_coach_review).toBe(true);
    expect(fields.review_reasons).toEqual(['Earlier reason', BODY_ADDED_REASON]);
  });
  it('estimates body fat only when the profile has none', () => {
    expect(shortBodyFields(full, plan, { height_cm: null, start_weight: null, goal_weight: null })).toMatchObject({ body_fat_pct: plan.bodyFatPct, body_fat_estimated: true });
  });
  it('writes nothing when nothing is missing', () => {
    expect(shortBodyFields(full, plan, { height_cm: 170, start_weight: 80, goal_weight: 70, body_fat_pct: 28 })).toEqual({});
  });
});

describe('answersFromProfile', () => {
  it('fills in what the member already gave', () => {
    const a = answersFromProfile({ name: 'Jo', gender: 'Male', date_of_birth: '1980-01-02', nutrition_tracking_mode: 'photo_diary', phone: null });
    expect(a.name).toBe('Jo');
    expect(a.gender).toBe('Male');
    expect(a.dob).toBe('1980-01-02');
    expect(a.mode).toBe('photo_diary');
    expect(a.phone).toBe('');
  });
  it('carries height, weights and activity when the profile has them', () => {
    const a = answersFromProfile({ height_cm: 170, start_weight: 80, goal_weight: 70, activity_level: 1.75 });
    expect([a.heightCm, a.weightKg, a.goalKg, a.activity]).toEqual([170, 80, 70, 1.75]);
    expect(answersFromProfile({ height_cm: 0, start_weight: null, activity_level: 1.7 })).toMatchObject({ heightCm: null, weightKg: null, activity: 1.5 });
  });
  it('treats a gender it does not know as not chosen', () => {
    expect(answersFromProfile({ gender: 'Other' }).gender).toBeNull();
    expect(answersFromProfile({}).mode).toBe('full_tracking');
  });
});
