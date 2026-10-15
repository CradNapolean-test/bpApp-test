// Checks and wording for the gym settings forms, shared by the gym admin's Settings page and the owner's gym page (GA, R16).

// The overnight blackout for cancellations. A window that starts and ends at the same time is either empty or the whole day; neither is
// what anyone meant, so it is refused instead of saved.
export function blackoutProblem(useBlackout: boolean, start: string, end: string): string | null {
  if (!useBlackout) return null;
  if (!start || !end) return 'Choose when the blackout starts and ends, or turn it off.';
  if (start.slice(0, 5) === end.slice(0, 5)) return 'The blackout must start and end at different times.';
  return null;
}

// What changing the timezone really does (GA): it is not only a label. Already-booked sessions are stored as wall-clock times at the gym,
// so they move in real time by the difference between the two zones.
export function timezoneChangeBody(from: string, to: string): string {
  return `Class times are wall-clock times at the gym, so every class, cancellation deadline, "today" and the weekly reset will follow ${to}. Sessions members have already booked keep their clock time, which means they move in real time by the difference between ${from} and ${to}. Only change this if the gym moved or the timezone was wrong.`;
}

// A blank link clears the setting. Otherwise https only, no spaces, at most 500 characters (the database says the same).
export function referralUrlProblem(value: string): string | null {
  const url = value.trim();
  if (!url) return null;
  if (url.length > 500) return 'The link can be at most 500 characters.';
  if (/\s/.test(url) || !/^https:\/\/\S+$/i.test(url)) return 'The link must start with https:// and have no spaces.';
  try {
    new URL(url);
  } catch {
    return 'That does not look like a web address.';
  }
  return null;
}

export const normaliseReferralUrl = (value: string): string | null => value.trim() || null;
