'use client';

import { useState } from 'react';
import { useAction } from './useAction';
import { Button } from './Button';
import { createClient } from '@/lib/supabase/client';
import { fail, ok } from '@/lib/data/result';
import { checkCurrentPassword } from '@/lib/currentPassword';

const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

// Shared by the owner's, a coach's and a member's account screens. Asks for the current password first (SE22), so a signed-in device
// left open cannot move the login to someone else's address.
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const { run, busy } = useAction();
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const wrong = await checkCurrentPassword(data.user?.email ?? '', current);
        if (wrong) return fail({ message: wrong });
        const { error } = await supabase.auth.updateUser({ email });
        return error ? fail(error, 'Could not update email') : ok();
      },
      {
        success: 'Confirmation email sent',
        onDone: () => {
          setCurrent('');
          setSent(true);
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Change email</h3>
      <p className="text-xs text-zinc-500">Currently: {currentEmail}</p>
      <input
        type="email"
        placeholder="New email address"
        aria-label="New email address"
        className={inputCls}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <input
        type="password"
        placeholder="Your current password"
        aria-label="Your current password"
        className={inputCls}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
      />
      <Button type="submit" variant="outline" disabled={busy || !email || !current}>
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
