'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/app/_components/Button';

export function JoinForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-3 text-base dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="join-email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
        <input id="join-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </div>
      <div className="space-y-1">
        <label htmlFor="join-password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Choose a password</label>
        <input id="join-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        <p className="text-xs text-zinc-500">At least 8 characters.</p>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting} className="w-full !rounded-full py-3 text-base">
        {submitting ? 'Creating your account…' : 'Create my account'}
      </Button>
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
