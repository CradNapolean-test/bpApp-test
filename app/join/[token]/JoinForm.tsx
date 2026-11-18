'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { authButton, authInput, authLabel } from '@/app/_components/AuthFrame';

export function JoinForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set when the member has to confirm their email before they can sign in (the default, D17).
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong. Please try again.');
        return;
      }
      if (body.confirm) {
        setCheckEmail(true);
        return;
      }
      const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Your account was created. Please log in to continue.');
        router.push('/login');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = authInput;

  if (checkEmail) {
    return (
      <div className="space-y-3 text-center" role="status">
        <h2 className="text-lg font-bold text-black dark:text-zinc-50">Check your email</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          We sent a link to confirm your email address. Open it, then log in with the password you just chose.
        </p>
        <p className="text-xs text-zinc-500">Nothing there after a few minutes? Look in your spam folder, or ask your coach to help.</p>
        <Link href="/login" className="inline-block text-sm font-semibold text-accent">
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="join-email" className={authLabel}>Email</label>
        <input id="join-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </div>
      <div className="space-y-1">
        <label htmlFor="join-password" className={authLabel}>Choose a password</label>
        <input id="join-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        <p className="text-xs text-zinc-500">At least 8 characters.</p>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={submitting} className={authButton}>
        {submitting ? 'Creating your account…' : 'Create my account'}
      </button>
      <p className="text-center text-xs text-zinc-500">
        By continuing you agree to our <Link href="/legal/terms" className="underline">terms</Link> and{' '}
        <Link href="/legal/privacy" className="underline">privacy policy</Link>.
      </p>
      <p className="text-center text-sm text-zinc-500">
        Already have an account? <Link href="/login" className="font-semibold text-accent">Log in</Link>
      </p>
    </form>
  );
}
