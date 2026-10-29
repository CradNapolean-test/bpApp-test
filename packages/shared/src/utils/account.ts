// Small rules for the Account screen.

export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];
// New accounts start on the dark theme (migration 0066), and so does a device that has not been told otherwise.
export const DEFAULT_THEME: ThemePreference = 'dark';

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system';
}

// What to draw: the member's choice, or the phone's own setting when they chose "System".
export function resolveScheme(preference: ThemePreference, system: 'light' | 'dark' | null | undefined): 'light' | 'dark' {
  if (preference === 'system') return system === 'light' ? 'light' : 'dark';
  return preference;
}

export const MIN_PASSWORD_LENGTH = 8;

// The web's rules: at least 8 characters, and the same twice. Returns the message to show, or null when it is fine.
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}

// Not a full address check (the server does that), just enough to catch a typo before sending a confirmation email.
export function validateNewEmail(next: string, current: string): string | null {
  const email = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid email address.';
  if (email.toLowerCase() === current.trim().toLowerCase()) return 'That is already your email address.';
  return null;
}

// The letters shown in a profile picture's circle: first and last initial of a name ("Jamie Thornton" -> "JT"), one letter for a
// single word, and for an email address (no name yet) the first letter of what comes before the @.
export function initialsOf(nameOrEmail: string): string {
  const text = nameOrEmail.trim();
  if (!text) return '?';
  const base = text.includes('@') ? text.split('@')[0] : text;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 && !text.includes('@') ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?')[0];
  return letters.toUpperCase();
}
