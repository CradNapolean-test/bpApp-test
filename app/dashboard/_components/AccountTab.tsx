'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { Avatar } from '@/app/_components/Avatar';
import { Checkbox } from '@/app/_components/Checkbox';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import type { ThemePreference } from '@/app/_components/theme';
import { updateNotificationsEnabled } from '@/lib/data/clientProfile';

const cardCls = 'rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

export function AccountTab({
  clientId,
  name,
  email,
  notificationsEnabled,
  themePreference,
}: {
  clientId: string;
  name: string;
  email: string;
  notificationsEnabled: boolean;
  themePreference: ThemePreference;
}) {
  const { run } = useAction();
  const [enabled, setEnabled] = useState(notificationsEnabled);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    await run(() => updateNotificationsEnabled(clientId, next));
  }

  return (
    <div className="space-y-6">
      <div className={`${cardCls} flex items-center gap-3`}>
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-black dark:text-zinc-50">{name}</p>
          <p className="truncate text-xs text-zinc-500">{email}</p>
        </div>
      </div>

      <div className={cardCls}>
        <ChangePasswordForm />
      </div>

      <div className={cardCls}>
        <ChangeEmailForm currentEmail={email} />
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Reminder notifications</h3>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <Checkbox checked={enabled} onChange={handleToggle} />
          Get a nudge if I haven&apos;t checked in for a while
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          This only affects automated inactivity reminders — you&apos;ll still get notified about
          things like waitlist promotions either way.
        </p>
      </div>

      <div className={cardCls}>
        <ThemeToggle initial={themePreference} />
      </div>

      <div className={`${cardCls} flex justify-end md:hidden`}>
        <SignOutButton variant="danger-solid" />
      </div>
    </div>
  );
}
