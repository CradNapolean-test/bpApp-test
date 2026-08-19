'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/app/_components/Logo';
import { Button } from '@/app/_components/Button';
import { LegalFooterLinks } from '@/app/_components/LegalFooterLinks';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'forgot'>('sign-in');
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    // This value reaches the email template as {{ .RedirectTo }} -- the "Reset Password"
    // template in the Supabase dashboard must link to {{ .SiteURL }}/auth/confirm with
    // token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }} (see
    // app/auth/confirm/route.ts) rather than the default {{ .ConfirmationURL }}, which routes
    // through Supabase's own PKCE-bound /verify redirect and breaks whenever the email is
    // opened on a different device than the one that requested it.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  }

  if (mode === 'forgot') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
        <form
          onSubmit={handleResetRequest}
          className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <Logo variant="full" size={88} />
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Reset password</h1>
          </div>

          {resetSent ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent.
              Check your email and follow the link to set a new password.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor="reset-email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setMode('sign-in');
              setError(null);
              setResetSent(false);
            }}
            className="w-full text-center text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; Back to sign in
          </button>
        </form>
        <LegalFooterLinks />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="full" size={88} />
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Ballistic Performance</h1>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
              }}
              className="text-xs font-medium text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" variant="primary" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <LegalFooterLinks />
    </div>
  );
}
