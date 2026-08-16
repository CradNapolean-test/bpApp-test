import * as Sentry from '@sentry/nextjs';

// NEXT_PUBLIC_ prefix required: this file runs in the browser, same convention as
// lib/supabase/client.ts's NEXT_PUBLIC_SUPABASE_* vars.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
