// Keeping a browser's push subscription with whoever is signed in on it (R18, M3). A phone is sometimes shared, and a push subscription
// belongs to the browser, not the person: the prompt used to stop as soon as the browser had a subscription, so a second member on the
// same phone never got their own row while the first member's pushes (with message previews) kept arriving. Each sign-in now re-registers
// the browser's existing subscription (register_web_push moves it to the caller), and signing out removes it.

// Registering writes a row, so a page that is opened many times a day does it at most this often per person.
export const REREGISTER_EVERY_MS = 12 * 60 * 60 * 1000;

export function registrationKey(userId: string): string {
  return `push-registered-at:${userId}`;
}

export function shouldReregister(lastAtMs: number | null, nowMs: number): boolean {
  if (lastAtMs == null || !Number.isFinite(lastAtMs)) return true;
  return nowMs - lastAtMs >= REREGISTER_EVERY_MS;
}

// Resolves with the promise's value, or rejects when it takes longer than `ms` (a service worker that never becomes ready must not
// leave someone stuck on the sign-out button).
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
