import { describe, expect, it } from 'vitest';
import { ONBOARDING_DRAFT_MAX_AGE_MS, draftKey, parseDraft, serialiseDraft, worthSaving, type OnboardingDraft } from './onboardingDraft';

const NOW = 1_800_000_000_000;
const draft = (over: Partial<OnboardingDraft> = {}): Omit<OnboardingDraft, 'v'> => ({
  savedAt: NOW - 60_000,
  step: 2,
  consent: true,
  name: 'Sam Example',
  gender: 'Female',
  dob: '1990-04-02',
  phone: '07700 900123',
  emName: 'Alex Example',
  emPhone: '07700 900456',
  goal: 'Get stronger',
  experience: 'Some',
  health: '',
  heightCm: 170,
  weightKg: null,
  goalKg: null,
  activity: 1.5,
  knowsBf: false,
  bf: '',
  mode: 'full_tracking',
  ...over,
});

describe('onboarding draft (R22)', () => {
  it('comes back as it was saved', () => {
    const saved = draft();
    expect(parseDraft(serialiseDraft(saved), NOW)).toEqual({ v: 1, ...saved });
  });

  it('is gone after a week', () => {
    expect(parseDraft(serialiseDraft(draft({ savedAt: NOW - ONBOARDING_DRAFT_MAX_AGE_MS - 1 })), NOW)).toBeNull();
    expect(parseDraft(serialiseDraft(draft({ savedAt: NOW - ONBOARDING_DRAFT_MAX_AGE_MS + 1000 })), NOW)).not.toBeNull();
  });

  it('is refused when it is not ours, not readable, or from a clock in the future', () => {
    expect(parseDraft(null, NOW)).toBeNull();
    expect(parseDraft('', NOW)).toBeNull();
    expect(parseDraft('{not json', NOW)).toBeNull();
    expect(parseDraft('[1,2]', NOW)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 2, ...draft() }), NOW)).toBeNull();
    expect(parseDraft(serialiseDraft(draft({ savedAt: NOW + 3_600_000 })), NOW)).toBeNull();
  });

  it('is refused when a field has the wrong kind of value', () => {
    expect(parseDraft(JSON.stringify({ v: 1, ...draft(), name: 5 }), NOW)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, ...draft(), gender: 'Other' }), NOW)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, ...draft(), heightCm: '170' }), NOW)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, ...draft(), step: -1 }), NOW)).toBeNull();
  });

  it('is kept per person, so another member on the same phone does not see it', () => {
    expect(draftKey('user-a')).not.toBe(draftKey('user-b'));
    expect(draftKey('user-a').startsWith('onboarding-draft:')).toBe(true);
  });

  it('is not worth saving before the welcome screen is left or anything is typed', () => {
    expect(worthSaving({ step: -1, name: 'Sam', goal: '', phone: '', dob: '', health: '', heightCm: null, weightKg: null })).toBe(false);
    expect(worthSaving({ step: 0, name: '', goal: '', phone: '', dob: '', health: '', heightCm: null, weightKg: null })).toBe(false);
    expect(worthSaving({ step: 0, name: 'S', goal: '', phone: '', dob: '', health: '', heightCm: null, weightKg: null })).toBe(true);
    expect(worthSaving({ step: 2, name: '', goal: '', phone: '', dob: '', health: '', heightCm: null, weightKg: null })).toBe(true);
  });
});
