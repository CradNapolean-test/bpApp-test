'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddClientForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/coach/create-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error ?? 'Failed to create client');
      setSubmitting(false);
      return;
    }

    setCreated({ email: body.email, password: body.password });
    setEmail('');
    setSubmitting(false);
    router.refresh();
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
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <label htmlFor="client-email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          New client email
        </label>
        <input
          id="client-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add client'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
