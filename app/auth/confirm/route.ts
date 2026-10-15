import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safeRedirect';

// Server-side landing point for Supabase auth email links (password recovery, invites, magic links, and the password-set links a coach gives
// a new member). The link carries a one-time token_hash, verified with verifyOtp: no browser-stored PKCE code_verifier is needed, so a link
// opened on a different device from the one that asked for it still works.
//
// M6, two changes:
//  * GET only shows a "Continue" button; the token is used by the POST behind it. Email security scanners open every link in a message before
//    the person does, and used to burn the one-time token on a GET, leaving the person on the login page with no explanation.
//  * `next` may only be a path on this site (lib/safeRedirect.ts). It used to be followed anywhere, an open redirect.

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];
const isOtpType = (value: unknown): value is EmailOtpType => typeof value === 'string' && (OTP_TYPES as string[]).includes(value);

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
};

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:26rem;margin:4rem auto;padding:0 1.25rem;color:#111}h1{font-size:1.35rem}p{line-height:1.5;color:#444}a{color:#111}button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:.8rem 1.6rem;background:#111;color:#fff;cursor:pointer;width:100%}</style></head>
<body><h1>${title}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

const expired = () =>
  page('This link has expired', '<p>Links like this work once and run out after a while. Request a new one from the sign-in page ("Forgot password?"), or ask your coach to send another.</p><p><a href="/login">Go to sign in</a></p>', 400);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  // Nothing to verify: back to the sign-in page, as before.
  if (!tokenHash || !isOtpType(type)) return NextResponse.redirect(`${origin}/login`);
  const next = safeNextPath(searchParams.get('next'), origin, '/');

  return page(
    'Continue to the app',
    `<p>Press the button to finish. This step stops email programs that preview links from using up your one-time link.</p>
<form method="post" action="/auth/confirm">
<input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}">
<input type="hidden" name="type" value="${escapeHtml(type)}">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<button type="submit">Continue</button>
</form>`
  );
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get('token_hash');
  const type = form?.get('type');
  if (typeof tokenHash !== 'string' || !tokenHash || !isOtpType(type)) return expired();

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return expired();

  const next = safeNextPath(typeof form?.get('next') === 'string' ? (form?.get('next') as string) : null, origin, '/');
  // 303: the browser follows a POST with a GET of the new address.
  return NextResponse.redirect(new URL(next, origin), 303);
}
