// Pages and routes a signed-out visitor may open: everything else is redirected to /login by lib/supabase/middleware.ts. One list, with the
// reason for each entry, so adding one is a visible decision (H3). A path matches itself and anything under it ("/legal" and "/legal/terms",
// but not "/legalese").

export const PUBLIC_PATHS: { path: string; why: string }[] = [
  { path: '/login', why: 'the sign-in page itself' },
  { path: '/api/cron', why: 'called by Vercel Cron with no browser session; each route checks CRON_SECRET itself (lib/cronAuth.ts)' },
  {
    path: '/reset-password',
    why: "Supabase's recovery link puts its token in the URL fragment, which never reaches the server, so the very first request has no session",
  },
  { path: '/auth/confirm', why: 'the route that establishes the session from an email link: it is reached with no session by definition' },
  { path: '/join', why: "a coach's public sign-up link (app/join)" },
  { path: '/api/join', why: 'the sign-up endpoint behind that link (rate limited, lib/joinFlow.ts)' },
  { path: '/api/version', why: 'which deployment is serving: the app asks it, including from the sign-in page. Not sensitive' },
  { path: '/legal', why: 'the Privacy Policy and Terms, which the sign-in and join pages link to and the join form says people agree to (H3)' },
  { path: '/unsubscribe', why: 'the link at the bottom of a broadcast email, opened signed out; a signed token says who it is (app/unsubscribe)' },
  { path: '/api/csp-report', why: 'browsers send Content-Security-Policy reports here with no session (app/api/csp-report)' },
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
}
