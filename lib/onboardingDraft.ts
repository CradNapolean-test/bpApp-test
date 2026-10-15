import type { TrackingMode } from './onboarding';

// A half-finished onboarding, kept on the phone (R22). The answers lived only in React: a refresh, the phone evicting the page, or a call
// in the middle lost up to five steps of typing. Each step is saved as it changes and picked up again when the page returns.
//
// It holds health notes and an emergency contact, so it is kept only on this device, for a week at most, removed when onboarding is
// finished and when the member signs out (lib/utils/localData.ts), and keyed by the signed-in person so another member on the same
// phone never sees it.

export const ONBOARDING_DRAFT_PREFIX = 'onboarding-draft:';
export const ONBOARDING_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function draftKey(userId: string): string {
  return `${ONBOARDING_DRAFT_PREFIX}${userId}`;
}

export interface OnboardingDraft {
  v: 1;
  savedAt: number;
  // Which step the member was on (0 = the first question).
  step: number;
  consent: boolean;
  name: string;
  gender: 'Female' | 'Male' | null;
  dob: string;
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
  bf: string;
  mode: TrackingMode;
}

export function serialiseDraft(draft: Omit<OnboardingDraft, 'v'>): string {
  return JSON.stringify({ v: 1, ...draft });
}

const isText = (x: unknown): x is string => typeof x === 'string';
const isNumberOrNull = (x: unknown): x is number | null => x === null || (typeof x === 'number' && Number.isFinite(x));

// The draft in `text`, or null when there is none, it is unreadable, it is from another version, or it is older than a week.
export function parseDraft(text: string | null, nowMs: number): OnboardingDraft | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (raw.v !== 1) return null;
  if (typeof raw.savedAt !== 'number' || nowMs - raw.savedAt > ONBOARDING_DRAFT_MAX_AGE_MS || raw.savedAt > nowMs + 60_000) return null;
  if (typeof raw.step !== 'number' || !Number.isInteger(raw.step) || raw.step < 0 || raw.step > 10) return null;
  const textFields = ['name', 'dob', 'phone', 'emName', 'emPhone', 'goal', 'experience', 'health', 'bf', 'mode'] as const;
  for (const field of textFields) if (!isText(raw[field])) return null;
  if (typeof raw.consent !== 'boolean' || typeof raw.knowsBf !== 'boolean') return null;
  if (raw.gender !== null && raw.gender !== 'Female' && raw.gender !== 'Male') return null;
  if (!isNumberOrNull(raw.heightCm) || !isNumberOrNull(raw.weightKg) || !isNumberOrNull(raw.goalKg)) return null;
  if (typeof raw.activity !== 'number' || !Number.isFinite(raw.activity)) return null;
  return raw as unknown as OnboardingDraft;
}

// A draft is worth saving once the member is past the welcome screen and has typed something.
export function worthSaving(draft: Pick<OnboardingDraft, 'step' | 'name' | 'goal' | 'phone' | 'dob' | 'health' | 'heightCm' | 'weightKg'>): boolean {
  if (draft.step < 0) return false;
  return Boolean(draft.name || draft.goal || draft.phone || draft.dob || draft.health || draft.heightCm || draft.weightKg) || draft.step > 0;
}
