import { ageFromDob, ageProblem, buildOnboardingPlan, isActivityLevel, TRACKING_OPTIONS, type OnboardingPlan, type TrackingMode } from '../onboarding';
import { CONSENT_REQUIRED_MESSAGE } from './consentText';
import { DEFAULT_TIMEZONE } from './dates';
import { DETAIL_LIMITS, HEIGHT_RANGE, normalizeGender } from './personalDetails';

// The new-member onboarding questions, as the phone app asks them: which steps there are, what each step checks before
// "Continue", and the profile row the answers become. The web does the last part in a server action
// (lib/data/onboarding.ts); a phone cannot run that, so the same steps are done here and written under the member's own
// sign-in. The starting plan itself still comes from buildOnboardingPlan (lib/calculations.ts), never re-derived.

// Every flow starts with the privacy consent (R22); the answer is recorded as client_profiles.consented_at (migration 0138).
export const FULL_STEPS = ['consent', 'about', 'goal', 'body', 'food', 'plan'] as const;
// Existing members the coach asked to confirm their details: details, goal and how they track food (no body stats or plan).
export const SHORT_STEPS = ['consent', 'about', 'goal', 'food'] as const;
// ...plus the body step for the member whose profile has no height or weights (OB3, see needsBodyStep in onboarding.ts).
export const SHORT_STEPS_WITH_BODY = ['consent', 'about', 'goal', 'body', 'food'] as const;
export type OnboardingStep = (typeof FULL_STEPS)[number];

export const STEP_TITLE: Record<OnboardingStep, string> = {
  consent: 'Your privacy',
  about: 'About you',
  goal: 'Your goal',
  body: 'Your body',
  food: 'Food tracking',
  plan: 'Your plan',
};

export type OnboardingAnswers = {
  consent: boolean; // agreed to the privacy notice
  name: string;
  gender: 'Female' | 'Male' | null;
  dob: string; // yyyy-mm-dd or ''
  phone: string;
  emName: string;
  emPhone: string;
  goal: string;
  experience: string;
  health: string;
  heightCm: number | null;
  weightKg: number | null;
  goalKg: number | null;
  activity: number;
  knowsBf: boolean;
  bf: string; // as typed
  mode: TrackingMode;
};

export const BLANK_ANSWERS: OnboardingAnswers = {
  consent: false,
  name: '',
  gender: null,
  dob: '',
  phone: '',
  emName: '',
  emPhone: '',
  goal: '',
  experience: '',
  health: '',
  heightCm: null,
  weightKg: null,
  goalKg: null,
  activity: 1.5,
  knowsBf: false,
  bf: '',
  mode: 'full_tracking',
};

export function answersAge(a: OnboardingAnswers, today: Date = new Date()): number | null {
  return a.dob ? ageFromDob(a.dob, today) : null;
}

export function answersBodyFat(a: OnboardingAnswers): number | null {
  return a.knowsBf && a.bf !== '' ? Number(a.bf) : null;
}

// The starting plan, or null until the answers are enough to work it out.
export function planFor(a: OnboardingAnswers, today: Date = new Date()): OnboardingPlan | null {
  const age = answersAge(a, today);
  if (!a.gender || age == null || !a.weightKg || !a.goalKg || !a.heightCm) return null;
  return buildOnboardingPlan({
    gender: a.gender,
    age,
    startWeight: a.weightKg,
    goalWeight: a.goalKg,
    heightCm: a.heightCm,
    activityLevel: a.activity,
    bodyFatPct: answersBodyFat(a),
    hasHealthNotes: a.health.trim().length > 0,
  });
}

const tooLong = (what: string, max: number) => `${what} can be up to ${max} characters.`;

// What stops a step from moving on, or null. Same wording as the web.
export function stepError(step: OnboardingStep, a: OnboardingAnswers, today: Date = new Date()): string | null {
  if (step === 'consent' && !a.consent) return CONSENT_REQUIRED_MESSAGE;
  if (step === 'about') {
    const age = answersAge(a, today);
    if (!a.name.trim()) return 'Please enter your name.';
    if (a.name.trim().length > DETAIL_LIMITS.name) return tooLong('Your name', DETAIL_LIMITS.name);
    if (!a.gender) return 'Please choose an option for gender (we use it for your calorie calculation).';
    if (age == null) return 'Please enter your date of birth.';
    const ageError = ageProblem(age); // 16 is the youngest the app sets up on its own (D18); younger members are set up by their coach
    if (ageError) return ageError;
    if (!a.phone.trim()) return 'Please add a mobile number.';
    if (a.phone.trim().length > DETAIL_LIMITS.phone || a.emPhone.trim().length > DETAIL_LIMITS.phone) return tooLong('A phone number', DETAIL_LIMITS.phone);
    if (!a.emName.trim() || !a.emPhone.trim()) return 'Please add an emergency contact name and number.';
    if (a.emName.trim().length > DETAIL_LIMITS.emergencyName) return tooLong('The emergency contact name', DETAIL_LIMITS.emergencyName);
  }
  if (step === 'goal') {
    if (a.goal.trim().length === 0) return 'Please tell us your goal so your coach can help.';
    if (a.goal.length > DETAIL_LIMITS.goal) return tooLong('Your goal', DETAIL_LIMITS.goal);
    if (a.experience.length > DETAIL_LIMITS.experience) return tooLong('Training experience', DETAIL_LIMITS.experience);
    if (a.health.length > DETAIL_LIMITS.health) return tooLong('Health notes', DETAIL_LIMITS.health);
  }
  if (step === 'body') {
    const bf = answersBodyFat(a);
    if (!isActivityLevel(a.activity)) return 'Please pick how active you are.';
    if (!a.heightCm || a.heightCm < HEIGHT_RANGE.min || a.heightCm > HEIGHT_RANGE.max) return 'Please check your height.';
    if (!a.weightKg || a.weightKg < 30 || a.weightKg > 300) return 'Please check your current weight.';
    if (!a.goalKg || a.goalKg < 30 || a.goalKg > 300) return 'Please check your goal weight.';
    if (a.knowsBf && (bf == null || bf < 3 || bf > 60)) return 'Please check your body fat %, or choose "I don\'t know".';
  }
  return null;
}

// First problem in the steps the member goes through, or null. Used before the final write as a last check.
export function firstProblem(steps: readonly OnboardingStep[], a: OnboardingAnswers, today: Date = new Date()): string | null {
  for (const s of steps) {
    const e = stepError(s, a, today);
    if (e) return e;
  }
  if (!TRACKING_OPTIONS.some((o) => o.value === a.mode)) return 'Pick how to track food.';
  return null;
}

// The profile row a NEW member's answers become (the web's completeOnboarding): details, body, the starting plan's body fat,
// and the flag that asks the coach to look at the plan. The caller adds checkin_reminder_days (the coach's default) only
// when the row is brand new, so a coach's own later change is never overwritten.
export function toFullOnboardingRow(a: OnboardingAnswers, plan: OnboardingPlan, nowIso: string, age: number) {
  return {
    name: a.name.trim(),
    gender: a.gender,
    date_of_birth: a.dob,
    age,
    phone: a.phone.trim() || null,
    emergency_contact_name: a.emName.trim() || null,
    emergency_contact_phone: a.emPhone.trim() || null,
    goal_description: a.goal.trim() || null,
    experience: a.experience.trim() || null,
    health_notes: a.health.trim() || null,
    start_weight: a.weightKg,
    goal_weight: a.goalKg,
    height_cm: a.heightCm,
    activity_level: a.activity,
    body_fat_pct: plan.bodyFatPct,
    body_fat_estimated: plan.bodyFatEstimated,
    diet_approach: 'High Carb Low Fat' as const,
    nutrition_goal: 'fat_loss' as const,
    nutrition_setting: 'steady' as const,
    cycling: false,
    timezone: DEFAULT_TIMEZONE,
    nutrition_tracking_mode: a.mode,
    onboarding_completed_at: nowIso,
    consented_at: nowIso,
    needs_coach_review: true,
    review_reasons: plan.reasons,
    updated_at: nowIso,
  };
}

// The short version (existing members): details, goal and tracking method. Never touches weights, targets or the review flag
// (except through shortBodyFields below). It also closes the coach's "please check your details" request (migration 0142).
export function toShortOnboardingRow(a: OnboardingAnswers, nowIso: string, age: number) {
  return {
    name: a.name.trim(),
    gender: a.gender,
    date_of_birth: a.dob,
    age,
    phone: a.phone.trim() || null,
    emergency_contact_name: a.emName.trim() || null,
    emergency_contact_phone: a.emPhone.trim() || null,
    goal_description: a.goal.trim() || null,
    experience: a.experience.trim() || null,
    health_notes: a.health.trim() || null,
    nutrition_tracking_mode: a.mode,
    onboarding_completed_at: nowIso,
    consented_at: nowIso,
    details_confirm_requested_at: null,
    updated_at: nowIso,
  };
}

// What the short flow may add when the member's profile has no height or weights (OB3). ONLY what is missing is filled in, so a
// coach's figures are never replaced, and the member is flagged so their coach sets the plan up. Returns {} when nothing is missing.
export type ExistingBody = {
  height_cm?: number | null;
  start_weight?: number | null;
  goal_weight?: number | null;
  body_fat_pct?: number | null;
  review_reasons?: string[] | null;
};
export const BODY_ADDED_REASON = 'Height and weight were added by the member: set up their plan';

export function shortBodyFields(a: OnboardingAnswers, plan: OnboardingPlan, current: ExistingBody | null): Record<string, unknown> {
  const has = (n: unknown) => typeof n === 'number' && n > 0;
  const fields: Record<string, unknown> = {};
  if (!has(current?.height_cm)) fields.height_cm = a.heightCm;
  if (!has(current?.start_weight)) fields.start_weight = a.weightKg;
  if (!has(current?.goal_weight)) fields.goal_weight = a.goalKg;
  if (Object.keys(fields).length === 0) return {};
  fields.activity_level = a.activity;
  if (!has(current?.body_fat_pct)) {
    fields.body_fat_pct = plan.bodyFatPct;
    fields.body_fat_estimated = plan.bodyFatEstimated;
  }
  fields.needs_coach_review = true;
  const earlier = Array.isArray(current?.review_reasons) ? current!.review_reasons! : [];
  fields.review_reasons = [...new Set([...earlier, BODY_ADDED_REASON])];
  return fields;
}

// The answers a member already gave, for the short version (the web fills these in from their profile).
export function answersFromProfile(p: {
  name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  goal_description?: string | null;
  experience?: string | null;
  health_notes?: string | null;
  nutrition_tracking_mode?: TrackingMode | null;
  height_cm?: number | null;
  start_weight?: number | null;
  goal_weight?: number | null;
  activity_level?: number | null;
}): OnboardingAnswers {
  return {
    ...BLANK_ANSWERS,
    name: p.name ?? '',
    gender: normalizeGender(p.gender),
    dob: p.date_of_birth ?? '',
    phone: p.phone ?? '',
    emName: p.emergency_contact_name ?? '',
    emPhone: p.emergency_contact_phone ?? '',
    goal: p.goal_description ?? '',
    experience: p.experience ?? '',
    health: p.health_notes ?? '',
    mode: p.nutrition_tracking_mode ?? 'full_tracking',
    heightCm: p.height_cm && p.height_cm > 0 ? p.height_cm : null,
    weightKg: p.start_weight && p.start_weight > 0 ? p.start_weight : null,
    goalKg: p.goal_weight && p.goal_weight > 0 ? p.goal_weight : null,
    activity: p.activity_level && isActivityLevel(p.activity_level) ? p.activity_level : BLANK_ANSWERS.activity,
  };
}
