import { unregisterPushOnSignOut } from '@/lib/pushDevice';
import { supabase } from '@/lib/supabase';

// The "forgot password" calls. Each returns the message to show, or null when it worked.

// Supabase answers the same whether or not the address has an account (so nobody can probe for members); the email
// only goes out when it does. Needs the sandbox "Reset Password" email template to contain {{ .Token }} (docs/SLICE_8_SETUP.md).
export async function requestResetCode(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? error.message : null;
}

// Someone else may be signed in on this phone. Their sign-out clears their saved data (see SessionProvider) before the
// account the code belongs to is signed in, so one member never sees another's cached screens.
async function leaveCurrentAccount() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await unregisterPushOnSignOut();
    await supabase.auth.signOut();
  }
}

// Supabase says "Token has expired or is invalid" for a wrong, used or old code; say it the way a member would read it.
// Anything else (too many tries, no connection) keeps the server's own wording.
const isBadToken = (e: { code?: string; message: string }) => e.code === 'otp_expired' || /expired|invalid/i.test(e.message);

// The code proves the member owns the email address; it signs them in so they can choose a new password.
export async function verifyResetCode(email: string, code: string): Promise<string | null> {
  await leaveCurrentAccount();
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
  if (!error) return null;
  return isBadToken(error) ? 'That code is not right, or it has expired. Check it, or ask for a new one.' : error.message;
}

// The same, from a ballistic://reset-password?token_hash=... link (works from any device: no PKCE verifier is involved).
export async function verifyResetLink(tokenHash: string): Promise<string | null> {
  await leaveCurrentAccount();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  if (!error) return null;
  return isBadToken(error) ? 'This reset link has expired or was already used. Go back to sign in and ask for a new code.' : error.message;
}

export async function setNewPassword(password: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? error.message : null;
}
