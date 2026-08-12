'use client';

import { useState } from 'react';
import { useAction } from './useAction';
import { Button } from './Button';
import { createClient } from '@/lib/supabase/client';
import { fail, ok } from '@/lib/data/result';

const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const { run, busy } = useAction();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ email });
        return error ? fail(error, 'Could not update email') : ok();
      },
      { success: 'Confirmation email sent', onDone: () => setSent(true) }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Change email</h3>
      <p className="text-xs text-zinc-500">Currently: {currentEmail}</p>
      <input
        type="email"
        placeholder="New email address"
        className={inputCls}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <Button type="submit" variant="outline" disabled={busy || !email}>
        {busy ? 'Sending…' : 'Update email'}
      </Button>
      {sent && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Check both your old and new inbox — the change only takes effect once you confirm it via the link sent to the new address.
        </p>
      )}
    </form>
  );
}
