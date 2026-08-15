'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/_components/ToastProvider';

export function AddClientForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/coach/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();

      if (!res.ok) {
        const message = body.error ?? 'Failed to create client';
        setError(message);
        toast.error(message);
        return;
      }

      setCreated({ email: body.email, password: body.password });
      setEmail('');
      toast.success('Client created');
      router.refresh();
    } catch {
      // A network failure never reached the JSON parse above, so it had no path to the
      // user at all before this.
      const message = 'Could not reach the server. Check your connection and try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-md border border-emerald-600/30 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
        <p className="font-medium text-emerald-800 dark:text-emerald-300">Client created</p>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">
          Email: <span className="font-mono">{created.email}</span>
          <br />
          Temp password: <span className="font-mono">{created.password}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          This password is shown once — pass it to the client now; it can&apos;t be retrieved later.
        </p>
        <button
          onClick={() => setCreated(null)}
          className="mt-3 text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="client-email" className="text-sm font-medium text-zinc-500">
          New client email
        </label>
        <input
          id="client-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add client'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
