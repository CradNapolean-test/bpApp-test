import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath } from '@/lib/publicPaths';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the auth token if expired — required for Server Components,
  // which can't write cookies themselves.
  //
  // getClaims() checks the token's signature and expiry here, without the network round trip getUser() makes on every request and every
  // Server Action (60 to 390 ms each, R13). This gate only decides "signed in or not" for routing; what a person may read and write is
  // decided by the database from the same token (row level security), and every page and action that needs to know exactly who is
  // asking still calls getUser(). The one difference: a session ended elsewhere keeps passing this gate until its token expires (an hour).
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ? { id: claimsData.claims.sub } : null;

  // The pages and routes a signed-out visitor may open, each with the reason it is public, are listed in lib/publicPaths.ts (H3). The
  // /api/cron/* routes authenticate with CRON_SECRET inside the route; /reset-password and /auth/confirm are reached with no session by
  // definition (the recovery token is in the URL fragment, and /auth/confirm is what creates the session).
  const exemptFromLoginRedirect = isPublicPath(request.nextUrl.pathname);

  // Deliberately NOT the same set as above: /reset-password must stay reachable even after a
  // user becomes authenticated mid-page. The recovery flow's whole point is to establish a
  // real session (via setSession) *while already on this page*, specifically so the person can
  // then set a new password -- unlike /login, where being authenticated means there's nothing
  // left to do here. Reusing exemptFromLoginRedirect for this check was the actual bug: the
  // instant setSession succeeded, this redirected straight to the dashboard, skipping the
  // "set a new password" form entirely.
  const redirectAwayIfAuthenticated = request.nextUrl.pathname.startsWith('/login');

  if (!user && !exemptFromLoginRedirect) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return redirectCarryingCookies(url, supabaseResponse);
  }

  if (user && redirectAwayIfAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return redirectCarryingCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}

// getUser() above can silently refresh an expired access token, queuing the new session
// cookies onto supabaseResponse via the client's setAll callback -- a bare
// NextResponse.redirect(url) is a brand-new response object that never received those cookies,
// so the browser would keep resending the stale (soon-to-be-invalid, already-rotated) token on
// every subsequent request. That produces exactly a redirect loop: refresh succeeds and detects
// a user, but the redirect drops the refreshed cookie, so the very next request refreshes again
// with an already-consumed refresh token, fails, and bounces back the other way.
function redirectCarryingCookies(url: URL, response: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}
