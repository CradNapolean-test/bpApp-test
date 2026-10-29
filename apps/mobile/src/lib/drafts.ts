import { parseDraft, type OnboardingDraft } from '@ballistic/shared/utils/onboardingDraft';

import { authStorage } from '@/lib/authStorage';

// A form the member started and left half way is kept on the device so nothing typed is lost (the web keeps the same
// draft in the browser). It is the member's own text, so it is wiped on sign-out with everything else (clearCachedData).
// The storage has no "list the keys" call that works the same on every platform, so the ids of saved drafts are kept in
// one small index entry.

const INDEX_KEY = 'bp-form-drafts';
const draftKey = (assignmentId: string) => `bp-form-draft:${assignmentId}`;

function readIndex(): string[] {
  try {
    const raw = authStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function loadDraft(assignmentId: string): string | null {
  try {
    return authStorage.getItem(draftKey(assignmentId));
  } catch {
    return null; // storage can be blocked; the form still works, it just is not kept
  }
}

export function saveDraft(assignmentId: string, answers: unknown) {
  try {
    authStorage.setItem(draftKey(assignmentId), JSON.stringify(answers));
    const index = readIndex();
    if (!index.includes(assignmentId)) authStorage.setItem(INDEX_KEY, JSON.stringify([...index, assignmentId]));
  } catch {
    // not kept; nothing to do
  }
}

export function removeDraft(assignmentId: string) {
  try {
    authStorage.removeItem(draftKey(assignmentId));
    authStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((id) => id !== assignmentId)));
  } catch {
    // nothing to clear
  }
}

export function clearAllDrafts() {
  try {
    for (const id of readIndex()) authStorage.removeItem(draftKey(id));
    authStorage.removeItem(INDEX_KEY);
  } catch {
    // nothing to clear
  }
}

// A half-finished onboarding (R22). Kept on this phone only, for up to a week, under the member's own id so another member on the same
// phone never sees it; it goes with everything else on sign-out (clearAllDrafts) and when onboarding is finished.
const onboardingId = (userId: string) => `onboarding:${userId}`;

export function loadOnboardingDraft(userId: string): OnboardingDraft | null {
  return parseDraft(loadDraft(onboardingId(userId)), Date.now());
}

export function saveOnboardingDraft(userId: string, draft: Omit<OnboardingDraft, 'v'>) {
  saveDraft(onboardingId(userId), { v: 1, ...draft });
}

export function clearOnboardingDraft(userId: string) {
  removeDraft(onboardingId(userId));
}
