'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { Avatar } from '@/app/_components/Avatar';
import { Checkbox } from '@/app/_components/Checkbox';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import type { ThemePreference } from '@/app/_components/theme';
import { updateNotificationsEnabled } from '@/lib/data/clientProfile';
import type { Category, Screen } from './categories';

const cardCls = 'rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

type RowKey = 'password' | 'email';

export function AccountTab({
  clientId,
  name,
  email,
  notificationsEnabled,
  themePreference,
  onNavigate,
}: {
  clientId: string;
  name: string;
  email: string;
  notificationsEnabled: boolean;
  themePreference: ThemePreference;
  onNavigate: (category: Category, screen?: Screen) => void;
}) {
  const { run } = useAction();
  const [enabled, setEnabled] = useState(notificationsEnabled);
  const [openRow, setOpenRow] = useState<RowKey | null>(null);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    await run(() => updateNotificationsEnabled(clientId, next));
  }

  const rowCls =
    'flex w-full items-center justify-between border-b border-black/5 px-4 py-3.5 text-left last:border-b-0 dark:border-white/5';

  return (
    <div className="space-y-6">
      <div className={`${cardCls} flex items-center gap-3`}>
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-black dark:text-zinc-50">{name}</p>
          <p className="truncate text-xs text-zinc-500">{email}</p>
        </div>
      </div>

      <div className={`${cardCls} !p-0`}>
        <button type="button" onClick={() => setOpenRow(openRow === 'password' ? null : 'password')} className={rowCls}>
          <span className="text-sm font-medium text-black dark:text-zinc-50">Change password</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
        <button type="button" onClick={() => setOpenRow(openRow === 'email' ? null : 'email')} className={rowCls}>
          <span className="text-sm font-medium text-black dark:text-zinc-50">Change email</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
        <button type="button" onClick={() => onNavigate('Account Settings', 'Setup')} className={rowCls}>
          <span className="text-sm font-medium text-black dark:text-zinc-50">Setup / Profile details</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
        <button type="button" onClick={() => onNavigate('Account Settings', 'Credits')} className={rowCls}>
          <span className="text-sm font-medium text-black dark:text-zinc-50">Credits &amp; Membership</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      </div>

      {openRow === 'password' && (
        <div className={cardCls}>
          <ChangePasswordForm />
        </div>
      )}

      {openRow === 'email' && (
        <div className={cardCls}>
          <ChangeEmailForm currentEmail={email} />
        </div>
      )}

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
