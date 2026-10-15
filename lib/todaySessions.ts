import { isoDateInTz } from './utils/dates';

// The coach dashboard's "Happening now / Up next" (CC3): which of today's sessions is running at the gym this minute, and which is next.
// Pure so the clock can be passed in and the screen can re-ask every minute instead of freezing at the moment the page loaded.

// A session has no stored length; the dashboard treats each as a 45-minute block.
export const SESSION_MIN = 45;

export const toMinutes = (time: string | null): number => {
  const [h, m] = (time ?? '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

// Minutes since midnight at the gym right now.
export function minuteOfDayIn(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return Number(parts.find((p) => p.type === 'hour')?.value) * 60 + Number(parts.find((p) => p.type === 'minute')?.value);
}

// Today's date at the gym. Computed from the clock, not once on the server: left open past midnight, the page keeps showing today.
export const todayAtGym = (timezone: string, at: Date): string => isoDateInTz(at, timezone);

export function currentAndNext<T extends { startTime: string | null }>(
  todaysSessions: T[],
  nowMin: number
): { inProgress: T | undefined; upNext: T | null } {
  const sorted = [...todaysSessions].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const inProgress = sorted.find((s) => toMinutes(s.startTime) <= nowMin && nowMin < toMinutes(s.startTime) + SESSION_MIN);
  const upNext = inProgress ?? sorted.find((s) => toMinutes(s.startTime) > nowMin) ?? null;
  return { inProgress, upNext };
}
