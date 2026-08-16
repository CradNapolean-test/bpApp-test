import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Safe to reference unconditionally -- captureRequestError just forwards to the SDK instance
// initialized above, which is already a no-op when SENTRY_DSN is unset.
export const onRequestError = Sentry.captureRequestError;
