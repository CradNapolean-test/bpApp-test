import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Server-side landing point for Supabase auth email links (password recovery, invites,
// magic links). Verifies the link's token_hash directly via verifyOtp -- this does NOT
// depend on any browser-stored PKCE code_verifier, unlike the client-side
// exchangeCodeForSession() flow /reset-password used to rely on exclusively. That flow only
// works if the same browser/device that requested the email is the one that opens it; a
// coach requesting a reset on their laptop and opening the email on their phone (an entirely
// normal thing to do) hits "PKCE code verifier not found in storage" every time, because the
// verifier never existed on the phone. verifyOtp has no such requirement: the token_hash
// itself is the credential, so this works from any device.
//
// Requires the "Reset Password" email template in the Supabase dashboard to link here with
// token_hash/type instead of Supabase's default {{ .ConfirmationURL }} -- see the note left
// at resetPasswordForEmail's call site in app/login/page.tsx.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  // {{ .RedirectTo }} in the email template resolves to the full absolute URL originally
  // passed as resetPasswordForEmail's redirectTo (see app/login/page.tsx), not a bare path --
  // so `next` arrives here already absolute. new URL(next, origin) handles both that case and
  // a plain relative path correctly; naively concatenating `${origin}${next}` double-prepends
  // the origin onto an already-absolute URL and produces a malformed host like
  // "central-hub-eta.vercel.apphttps://central-hub-eta.vercel.app/...".
  const next = searchParams.get('next') ?? '/';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
