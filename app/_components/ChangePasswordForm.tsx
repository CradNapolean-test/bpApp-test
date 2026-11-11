'use client';

import { useState } from 'react';
import { useAction } from './useAction';
import { Button } from './Button';
import { createClient } from '@/lib/supabase/client';
import { fail, ok } from '@/lib/data/result';
import { checkCurrentPassword, newPasswordProblem } from '@/lib/currentPassword';

const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

// Shared by the owner's, a coach's and a member's account screens. Asks for the current password first (SE22).
export function ChangePasswordForm() {
  const { run, busy } = useAction();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = newPasswordProblem(current, password, confirm);
    if (problem) {
      await run(async () => fail({ message: problem }));
      return;
    }
    await run(
      async () => {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const wrong = await checkCurrentPassword(data.user?.email ?? '', current);
        if (wrong) return fail({ message: wrong });
        const { error } = await supabase.auth.updateUser({ password });
        return error ? fail(error, 'Could not update password') : ok();
      },
      {
        success: 'Password updated',
        onDone: () => {
          setCurrent('');
          setPassword('');
          setConfirm('');
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Change password</h3>
      <input
        type="password"
        placeholder="Current password"
        aria-label="Current password"
        className={inputCls}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="password"
          placeholder="New password"
          aria-label="New password"
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          aria-label="Confirm new password"
          className={inputCls}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <p className="text-xs text-zinc-500">Forgotten your current password? Sign out, then use “Forgot password?” on the sign-in page.</p>
      <Button type="submit" variant="outline" disabled={busy || !current || !password || !confirm}>
        {busy ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
