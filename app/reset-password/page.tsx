'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthFrame, authButton, authCard, authInput, authLabel, authLink } from '@/app/_components/AuthFrame';

// Reached via the link in the password-reset email (supabase.auth.resetPasswordForEmail's
// redirectTo, set on /login). This app's Supabase browser client (lib/supabase/client.ts,
// createBrowserClient from @supabase/ssr) defaults to PKCE flow, not implicit -- so a real
// recovery email redirects here with `?code=...` in the query string, and the session has to
// be established via exchangeCodeForSession(), using the code_verifier the client already
// stashed in its own storage when resetPasswordForEmail() was called.
//
// The hash-fragment branch below (#access_token=...&type=recovery) is kept only because
// links generated through the admin API (supabase.auth.admin.generateLink, used for manual
// testing) aren't PKCE-bound and come back that way -- real user-facing links never do. An
// earlier version of this page only handled the hash-fragment case, which meant it never
// actually worked for a real user: every forgot-password email hit a `?code=` link, found
// nothing in the hash, found no session either, and sat on "waiting for a valid reset link"
// indefinitely.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const hashType = hashParams.get('type');

    const code = new URLSearchParams(window.location.search).get('code');

    if (accessToken && refreshToken && hashType === 'recovery') {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            // Previously silently ignored -- left the page stuck on "waiting for a valid
            // link" with zero indication of what actually went wrong.
            setError(`Could not verify reset link: ${error.message}`);
            return;
          }
          window.history.replaceState(null, '', window.location.pathname);
          setReady(true);
        })
        .catch((err: unknown) => {
          setError(`Could not verify reset link: ${err instanceof Error ? err.message : 'unknown error'}`);
        });
      return;
    }

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            setError(`Could not verify reset link: ${error.message}`);
            return;
          }
          window.history.replaceState(null, '', window.location.pathname);
          setReady(true);
        })
        .catch((err: unknown) => {
          setError(`Could not verify reset link: ${err instanceof Error ? err.message : 'unknown error'}`);
        });
      return;
    }

    // No recovery code/fragment present -- fall back to checking for an already-established
    // session (e.g. this is a page refresh after the exchange already ran once and cleared the
    // URL).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <AuthFrame title="Set a new password" lead={ready && !done ? 'At least 8 characters.' : undefined}>
      <div className={authCard}>
        {done ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Your password has been updated.
            </p>
            <button type="button" className={authButton} onClick={() => router.push('/')}>
              Continue
            </button>
          </>
        ) : !ready ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {error ? error : 'Waiting for a valid reset link — open this page from the link in your reset email.'}
            </p>
            {error && (
              <button type="button" className={authLink} onClick={() => router.push('/login')}>
                &larr; Back to sign in
              </button>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="new-password" className={authLabel}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={authInput}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className={authLabel}>
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={authInput}
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button type="submit" disabled={submitting} className={authButton}>
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}
