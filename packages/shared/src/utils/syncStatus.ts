// Waiting-for-the-network rules for the phone app's offline write queue (apps/mobile/src/lib/writeQueue.ts): what counts as
// "no connection", how long to wait between tries, and what the status strip says.

// While offline, how often the app checks whether the server can be reached again.
export const PROBE_INTERVAL_MS = 8_000;
// A request that hangs this long counts as "no connection" (photo, video and voice uploads are exempt).
export const REQUEST_TIMEOUT_MS = 20_000;
// The gateway in front of the server answering "bad gateway / unavailable / timed out" is treated like no connection:
// waiting it out works. Not 429: that is a real answer (too many reset emails, too many sign-in tries) the member should read.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUSES.has(status);
}

// A failure to reach the server at all (no signal, airplane mode, a request that timed out, a gateway error), as opposed to
// the server answering "no". Only these are worth waiting out: a "no" (permission, validation, a missing row) will never
// succeed on a retry, so that write is undone and the member is told.
export function isNetworkFailure(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null;
  const text = `${typeof e?.name === 'string' ? e.name : ''} ${typeof e?.message === 'string' ? e.message : ''}`;
  return /BpNetworkError|AuthRetryableFetchError|Failed to fetch|Network request failed|NetworkError|Load failed|fetch failed|AbortError|TimeoutError|timed out/i.test(text);
}

// Wait 1 s, 2 s, 4 s ... between tries, never more than 15 s.
export function retryDelayMs(failureCount: number): number {
  return Math.min(1000 * 2 ** Math.max(0, failureCount), 15_000);
}

export type SyncBanner = { tone: 'offline' | 'saving' | 'problem'; text: string };

const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

// The one line shown under the header, or null when everything is saved and the phone is online.
// `waiting` = writes not yet saved; `failed` = writes the server refused (undone) that the member has not dismissed yet.
export function syncBanner(s: { online: boolean; waiting: number; failed: number }): SyncBanner | null {
  if (s.failed > 0) {
    return { tone: 'problem', text: `${changes(s.failed)} could not be saved and ${s.failed === 1 ? 'was' : 'were'} undone.` };
  }
  if (!s.online) {
    return {
      tone: 'offline',
      text:
        s.waiting > 0
          ? `You are offline. ${changes(s.waiting)} will save when you are back online.`
          : 'You are offline. Showing saved information; what you log saves when you are back.',
    };
  }
  if (s.waiting > 0) return { tone: 'saving', text: `Saving ${changes(s.waiting)}...` };
  return null;
}
