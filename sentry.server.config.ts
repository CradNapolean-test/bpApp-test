import * as Sentry from '@sentry/nextjs';

// Same graceful-degradation contract as lib/email.ts / lib/ai/estimateFoodPhoto.ts: an unset
// SENTRY_DSN means Sentry.init no-ops (documented SDK behavior) rather than failing the build
// or throwing at runtime.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
