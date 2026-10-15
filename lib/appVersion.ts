// "Is the code on this phone the latest?" (R8). Every commit to master deploys, so a member who left the app open keeps running the old
// JavaScript; their next action can fail with "Failed to find Server Action" because the new deployment no longer has that action.
// The server says which deployment is serving; the page remembers the one it was loaded from; the two are compared when the app comes
// back to the foreground, and a banner invites the member to update (it never reloads by itself, so nothing typed is lost).

// Sent by the service worker registration when a newer worker has taken over.
export const UPDATE_READY_EVENT = 'bp-update-ready';

// The id of the deployment serving this code. Vercel sets these on every deployment; on a developer's machine there is none ("dev"),
// and then there is nothing to compare.
export function buildId(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || 'dev';
}

// True when the server reports a different deployment from the one this page was loaded from.
export function isNewerVersion(shown: string | null | undefined, latest: string | null | undefined): boolean {
  if (!shown || !latest) return false;
  if (shown === 'dev' || latest === 'dev') return false;
  return shown !== latest;
}

// How often a page left open and visible asks, besides asking each time it comes back to the foreground.
export const VERSION_CHECK_EVERY_MS = 10 * 60 * 1000;
