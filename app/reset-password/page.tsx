'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/app/_components/Logo';
import { Button } from '@/app/_components/Button';

// Reached via the link in the password-reset email (supabase.auth.resetPasswordForEmail's
// redirectTo, set on /login). Supabase's recovery link redirects here with the session tokens
// in the URL *fragment* (#access_token=...&refresh_token=...&type=recovery) -- confirmed
// directly against this project by generating a real recovery link via the admin API and
// following it.
//
// This does NOT rely on the client SDK's automatic detectSessionInUrl: this app's Supabase
// client is created via @supabase/ssr's createBrowserClient (cookie-based storage, so the
// server can read the session too), and in practice that combination never processed the
// fragment automatically here -- confirmed live: loading a real, valid recovery link produced
// zero network calls to Supabase and an empty localStorage, meaning detectSessionInUrl simply
// never engaged. So instead: parse the fragment directly and call setSession() explicitly,
// which establishes the session through whatever storage adapter the client is actually
// configured with, regardless of whether automatic detection would have worked.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // TEMPORARY diagnostic -- remove once the recovery-link issue is confirmed fixed live.
  const [debug, setDebug] = useState('effect not yet run');

  useEffect(() => {
    setDebug(`effect ran; hash.length=${window.location.hash.length}`);
    const supabase = createClient();

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && type === 'recovery') {
      setDebug((d) => d + ' | calling setSession');
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          setDebug((d) => d + ` | setSession resolved, error=${error ? error.message : 'none'}`);
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
          setDebug((d) => d + ` | setSession THREW: ${err instanceof Error ? err.message : String(err)}`);
          setError(`Could not verify reset link: ${err instanceof Error ? err.message : 'unknown error'}`);
        });
      return;
    }

    setDebug((d) => d + ' | no recovery params found, falling back to getSession');
    // No recovery fragment present -- fall back to checking for an already-established
    // session (e.g. detectSessionInUrl did work, or this is a page refresh after setSession
    // already ran once and cleared the fragment).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setDebug((d) => d + ` | getSession resolved, hasSession=${!!session}`);
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="full" size={88} />
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Set a new password</h1>
        </div>

        {done ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Your password has been updated.
            </p>
            <Button variant="primary" className="w-full" onClick={() => router.push('/')}>
              Continue
            </Button>
          </>
        ) : !ready ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {error ? error : 'Waiting for a valid reset link — open this page from the link in your reset email.'}
            </p>
            <p className="break-all text-xs text-zinc-400">DEBUG: {debug}</p>
            {error && (
              <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
                Back to login
              </Button>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="new-password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
