import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubscribeToken } from '@/lib/unsubscribeToken';

// The link at the bottom of a broadcast email (CM1, R2): /unsubscribe?t=<token>. No login: the signed token says which member this is.
//
//   GET   shows a page with one button. It changes nothing, because mail scanners and link previews open every link in an email.
//   POST  switches email off for that member. This is also what a mail app's "Unsubscribe" button sends (RFC 8058 one-click).
//
// It only ever turns email notifications OFF, for the member the token was signed for. Needs UNSUBSCRIBE_SECRET, and /unsubscribe must be
// let through the login redirect in lib/supabase/middleware.ts (it is a page people open from their email, signed out).

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
};

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1.25rem;color:#111}h1{font-size:1.4rem}p{line-height:1.5;color:#444}button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:.75rem 1.5rem;background:#111;color:#fff;cursor:pointer}</style></head>
<body><h1>${title}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}

const INVALID = () => page('This link is not valid', '<p>The link may be incomplete or out of date. You can turn emails off from the notification settings inside the app.</p>', 400);

function memberFrom(request: Request): string | null {
  const token = new URL(request.url).searchParams.get('t');
  return verifyUnsubscribeToken(token, process.env.UNSUBSCRIBE_SECRET);
}

export async function GET(request: Request) {
  if (!process.env.UNSUBSCRIBE_SECRET) return page('Not available', '<p>This is not switched on yet. You can turn emails off from the notification settings inside the app.</p>', 503);
  if (!memberFrom(request)) return INVALID();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  // The token is URL-safe base64 with a dot, so it needs no escaping; still, only those characters are allowed into the page.
  if (!/^[A-Za-z0-9_.-]+$/.test(token)) return INVALID();
  return page(
    'Stop emails from the app?',
    `<p>You will no longer get broadcast emails from your gym's app. You will still get messages and notifications inside the app.</p>
<form method="post" action="/unsubscribe?t=${token}"><button type="submit">Stop emails</button></form>`
  );
}

export async function POST(request: Request) {
  if (!process.env.UNSUBSCRIBE_SECRET) return page('Not available', '<p>This is not switched on yet.</p>', 503);
  const memberId = memberFrom(request);
  if (!memberId) return INVALID();

  const admin = createAdminClient();
  const { error } = await admin.from('client_profiles').update({ email_notifications_enabled: false }).eq('client_id', memberId);
  if (error) return page('Something went wrong', '<p>We could not change that just now. Please try the link again in a few minutes.</p>', 500);
  return page('You are unsubscribed', '<p>You will no longer get broadcast emails from your gym\'s app. You can turn them back on in the app settings at any time.</p>');
}
