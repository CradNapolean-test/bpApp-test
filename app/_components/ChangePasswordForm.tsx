'use client';

import { useState } from 'react';
import { useAction } from './useAction';
import { Button } from './Button';
import { createClient } from '@/lib/supabase/client';
import { fail, ok } from '@/lib/data/result';

const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

export function ChangePasswordForm() {
  const { run, busy } = useAction();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      await run(async () => fail({ message: 'Password must be at least 8 characters.' }));
      return;
    }
    if (password !== confirm) {
      await run(async () => fail({ message: 'Passwords do not match.' }));
      return;
    }
    await run(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });
        return error ? fail(error, 'Could not update password') : ok();
      },
      { success: 'Password updated', onDone: () => { setPassword(''); setConfirm(''); } }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Change password</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="password"
          placeholder="New password"
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          className={inputCls}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" variant="outline" disabled={busy || !password || !confirm}>
        {busy ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
