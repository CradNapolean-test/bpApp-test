// The rest timer between sets (TR16): how long is left, Skip and +30s. Times are kept as an end time, not a count that goes down once a
// second, so a phone that put the page to sleep (or a browser that slowed its timers) still shows the right time when it wakes up.

export interface RestTimerState {
  // When the rest ends, in milliseconds (Date.now()).
  endsAt: number;
  // The whole rest, in seconds, including any +30s: the bar empties over this.
  totalSeconds: number;
  // Skipped, or run out.
  done: boolean;
}

export const REST_EXTRA_SECONDS = 30;

export function startRest(now: number, seconds: number): RestTimerState {
  const total = Math.max(0, Math.round(seconds));
  return { endsAt: now + total * 1000, totalSeconds: total, done: total === 0 };
}

// Seconds left, rounded up: 0.2 s left still reads 0:01, so it never shows 0:00 while it is still running.
export function restRemaining(state: RestTimerState, now: number): number {
  if (state.done) return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

// +30s adds to what is left. Tapped in the moment after the time ran out (before the screen caught up), it gives 30 seconds from now
// rather than ending the rest. A skipped rest stays skipped.
export function addRest(state: RestTimerState, now: number, seconds = REST_EXTRA_SECONDS): RestTimerState {
  if (state.done) return state;
  if (restRemaining(state, now) === 0) return { endsAt: now + seconds * 1000, totalSeconds: seconds, done: false };
  return { endsAt: state.endsAt + seconds * 1000, totalSeconds: state.totalSeconds + seconds, done: false };
}

// Whether to buzz and beep as the rest ends: not when the page only noticed long after (a phone locked through the rest and unlocked
// minutes later would buzz at the wrong moment).
export const REST_ALERT_GRACE_MS = 5000;

export function alertAtEnd(state: RestTimerState, now: number): boolean {
  return !state.done && now - state.endsAt < REST_ALERT_GRACE_MS;
}

export function skipRest(state: RestTimerState): RestTimerState {
  return { ...state, done: true };
}

// How much of the bar is still full, 1 at the start and 0 at the end.
export function restFraction(state: RestTimerState, now: number): number {
  if (state.done || state.totalSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, (state.endsAt - now) / (state.totalSeconds * 1000)));
}

// "1:30", "0:05".
export function formatRest(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The sound at the end of a rest is off until the member turns it on, and the choice stays on this device only (localStorage).
export const REST_SOUND_KEY = 'bp-rest-timer-sound';

export function readRestSound(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(REST_SOUND_KEY) === 'on';
  } catch {
    // Private browsing or storage switched off: sound stays off.
    return false;
  }
}

export function writeRestSound(storage: Pick<Storage, 'setItem'> | null | undefined, on: boolean): void {
  try {
    storage?.setItem(REST_SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Not saved: the choice holds until the page is left.
  }
}
