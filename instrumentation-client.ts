// Error and performance reporting. The SDK is about 300 KB of JavaScript, and it used to be part of the first bundle every page waits
// for (the sign-in page is a two-box form, R43). It now loads once the browser is idle, so the page paints and responds first; an error
// thrown in the first moments, before it has loaded, is not reported.
type SentryModule = typeof import('@sentry/nextjs');

let loading: Promise<SentryModule> | null = null;
function loadSentry(): Promise<SentryModule> {
  loading ??= import('@sentry/nextjs').then((Sentry) => {
    // NEXT_PUBLIC_ prefix required: this file runs in the browser, same convention as
    // lib/supabase/client.ts's NEXT_PUBLIC_SUPABASE_* vars.
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
    return Sentry;
  });
  return loading;
}

if (typeof window !== 'undefined') {
  const start = () => {
    void loadSentry();
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 2000);
}

export function onRouterTransitionStart(...args: Parameters<SentryModule['captureRouterTransitionStart']>) {
  void loadSentry().then((Sentry) => Sentry.captureRouterTransitionStart(...args));
}
