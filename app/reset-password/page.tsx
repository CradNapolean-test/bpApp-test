'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/app/_components/Logo';
import { Button } from '@/app/_components/Button';

// Reached via the link in the password-reset email (supabase.auth.resetPasswordForEmail's
// redirectTo, set on /login). Supabase's client SDK auto-detects the recovery token in the
// URL fragment and opens a temporary session -- this page just needs to wait for that (the
// PASSWORD_RECOVERY auth event) before showing the form, since navigating here directly
// without a valid link leaves no session to update.
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // Covers the case where the event already fired before this listener attached.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Waiting for a valid reset link — open this page from the link in your reset email.
          </p>
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
