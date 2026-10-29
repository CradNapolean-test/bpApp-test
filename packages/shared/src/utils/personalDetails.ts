import { ageFromDob } from '../onboarding';

// The member's own "Personal details" form (name, contact, emergency contact, goal and weights). Same fields as the web
// Setup page shows a member. Limits match migration 0111, which enforces them in the database.

export const DETAIL_LIMITS = {
  name: 100,
  phone: 30,
  address: 300,
  emergencyName: 100,
  goal: 5000,
  experience: 2000,
  health: 2000,
} as const;

// Weights are kilograms; the same range the check-in accepts for bodyweight.
export const WEIGHT_RANGE = { min: 20, max: 400 } as const;
// Height in centimetres (onboarding asks for 120-230; the database allows a little more room).
export const HEIGHT_RANGE = { min: 120, max: 230 } as const;

export type PersonalDetailsInput = {
  name: string;
  gender: string | null;
  phone: string;
  dateOfBirth: string; // yyyy-mm-dd or ''
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  goalDescription: string;
  experience: string;
  startWeight: string; // as typed
  goalWeight: string;
};

const tooLong = (what: string, max: number) => `${what} can be up to ${max} characters.`;

// The two values the app writes are 'Female' and 'Male', but rows made another way (an import, a coach-created member, the
// test seed) can hold 'female', 'F' and so on. Read any of those as the right choice; anything else is "not chosen".
export function normalizeGender(g: string | null | undefined): 'Female' | 'Male' | null {
  const v = (g ?? '').trim().toLowerCase();
  if (v === 'female' || v === 'f') return 'Female';
  if (v === 'male' || v === 'm') return 'Male';
  return null;
}

export function validatePersonalDetails(i: PersonalDetailsInput, today: Date = new Date()): string | null {
  if (!i.name.trim()) return 'Please enter your name.';
  if (i.name.trim().length > DETAIL_LIMITS.name) return tooLong('Your name', DETAIL_LIMITS.name);
  if (i.gender !== 'Female' && i.gender !== 'Male') return 'Please choose an option for gender.';
  if (i.dateOfBirth) {
    const age = ageFromDob(i.dateOfBirth, today);
    if (age == null || age < 10 || age > 100) return 'Please check your date of birth.';
  }
  if (i.phone.trim().length > DETAIL_LIMITS.phone) return tooLong('The phone number', DETAIL_LIMITS.phone);
  if (i.address.trim().length > DETAIL_LIMITS.address) return tooLong('The address', DETAIL_LIMITS.address);
  if (i.emergencyContactName.trim().length > DETAIL_LIMITS.emergencyName) return tooLong('The emergency contact name', DETAIL_LIMITS.emergencyName);
  if (i.emergencyContactPhone.trim().length > DETAIL_LIMITS.phone) return tooLong('The emergency contact number', DETAIL_LIMITS.phone);
  if (i.goalDescription.length > DETAIL_LIMITS.goal) return tooLong('Your goal', DETAIL_LIMITS.goal);
  if (i.experience.length > DETAIL_LIMITS.experience) return tooLong('Training experience', DETAIL_LIMITS.experience);
  const start = Number(i.startWeight);
  const goal = Number(i.goalWeight);
  if (!(start >= WEIGHT_RANGE.min && start <= WEIGHT_RANGE.max)) return 'Please check your start weight (in kg).';
  if (!(goal >= WEIGHT_RANGE.min && goal <= WEIGHT_RANGE.max)) return 'Please check your goal weight (in kg).';
  return null;
}

const orNull = (s: string) => s.trim() || null;

// Only the columns this form owns. The calorie-engine inputs (age, body fat, activity, diet, tier, cycling), the tracking
// method and everything the coach manages are never in it, so saving cannot overwrite a figure the coach changed meanwhile.
export function toDetailsPatch(i: PersonalDetailsInput) {
  return {
    name: i.name.trim(),
    gender: i.gender,
    phone: orNull(i.phone),
    date_of_birth: i.dateOfBirth || null,
    address: orNull(i.address),
    emergency_contact_name: orNull(i.emergencyContactName),
    emergency_contact_phone: orNull(i.emergencyContactPhone),
    goal_description: orNull(i.goalDescription),
    experience: orNull(i.experience),
    start_weight: Number(i.startWeight),
    goal_weight: Number(i.goalWeight),
  };
}
