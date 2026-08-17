import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /api/cron/* authenticates via CRON_SECRET (checked inside the route itself), not a
  // Supabase session cookie — Vercel Cron calls it server-to-server with no browser
  // session, so it must be exempt from the cookie-based redirect below.
  //
  // /reset-password must be exempt too: Supabase's recovery link puts the token in the URL
  // *fragment* (after #), which never reaches the server -- only the client-side SDK can see
  // and process it, via detectSessionInUrl, after the page has actually loaded. The very first
  // request here has no session cookie yet (the person is, by definition, logged out -- that's
  // why they're resetting), so without this exemption the middleware redirected to /login
  // before the page's client-side JS ever got a chance to run and establish the recovery
  // session. The page itself already handles "no valid token yet" by showing a waiting state
  // (see app/reset-password/page.tsx), so this is safe to leave open.
  const isPublicPath =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api/cron') ||
    request.nextUrl.pathname.startsWith('/reset-password');

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return redirectCarryingCookies(url, supabaseResponse);
  }

  if (user && isPublicPath) {
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
