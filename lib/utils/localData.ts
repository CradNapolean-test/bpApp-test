// What the app keeps in the browser's own storage for a signed-in member, and how to clear it (FM1). Signing out on a shared phone used to
// clear only the offline copy of the plan, so the next person to use the phone could open a form and find the previous member's
// half-written answers (health questionnaires among them) waiting in it.

export const OFFLINE_SNAPSHOT_KEY = 'bp-offline-snapshot';
export const FORM_DRAFT_PREFIX = 'form-draft:';
// A half-finished onboarding (lib/onboardingDraft.ts): health notes and an emergency contact among it.
export const ONBOARDING_DRAFT_KEY_PREFIX = 'onboarding-draft:';

interface KeyStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

// Removes the offline plan copy, every unsent form draft and any half-finished onboarding. Never throws (storage can be blocked); returns what it removed.
export function clearMemberLocalData(storage: KeyStorage | null): string[] {
  if (!storage) return [];
  const removed: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && (key === OFFLINE_SNAPSHOT_KEY || key.startsWith(FORM_DRAFT_PREFIX) || key.startsWith(ONBOARDING_DRAFT_KEY_PREFIX))) keys.push(key);
    }
    for (const key of keys) {
      storage.removeItem(key);
      removed.push(key);
    }
  } catch {
    // Storage is unavailable; there is nothing of ours in it to clear.
  }
  return removed;
}

// The browser's localStorage, or null where it cannot be reached.
export function browserLocalStorage(): KeyStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
