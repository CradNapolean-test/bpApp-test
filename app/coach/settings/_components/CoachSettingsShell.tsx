'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { useCoachLogoUrl } from '@/app/coach/_components/CoachBrandingContext';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { LegalFooterLinks } from '@/app/_components/LegalFooterLinks';
import { CoachProfileForm } from './CoachProfileForm';
import { DefaultCheckinReminderForm } from './DefaultCheckinReminderForm';
import type { ThemePreference } from '@/app/_components/theme';

type RowKey = 'password' | 'email' | 'profile' | 'notifications';

export function CoachSettingsShell({
  email,
  themePreference,
  displayName,
  defaultCheckinReminderDays,
  unreadCount,
}: {
  email: string;
  themePreference: ThemePreference;
  displayName: string | null;
  defaultCheckinReminderDays: number;
  unreadCount: number;
}) {
  const [openRow, setOpenRow] = useState<RowKey | null>(null);
  const logoUrl = useCoachLogoUrl();
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  // No self-avatar here on purpose -- unlike every other coach hub page, this page's own
  // first section already is that avatar (the big profile card below), and a header link
  // back to /coach/settings while already on /coach/settings is a no-op.
  const headerExtras = (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{todayLabel}</span>
      <CoachMessagesButton unreadCount={unreadCount} />
    </div>
  );
  const mobileHeader = (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
        <ArrowLeft className="h-4 w-4" />
      </span>
      <p className="truncate text-lg font-bold text-black dark:text-zinc-50">Account</p>
    </div>
  );

  const rowCls =
    'flex w-full items-center justify-between border-b border-black/5 px-4 py-3.5 text-left last:border-b-0 dark:border-white/5';

  return (
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={headerExtras}
      mobileHeader={mobileHeader}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <Avatar name={displayName || email} size="lg" variant="self" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-black dark:text-zinc-50">{displayName || 'Coach'}</p>
            <p className="truncate text-xs text-zinc-500">{email}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[.05] !p-0 dark:border-white/10">
          <button type="button" onClick={() => setOpenRow(openRow === 'password' ? null : 'password')} className={rowCls}>
            <span className="font-semibold text-black dark:text-zinc-50">Change password</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
          <button type="button" onClick={() => setOpenRow(openRow === 'email' ? null : 'email')} className={rowCls}>
            <span className="font-semibold text-black dark:text-zinc-50">Change email</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
          <button type="button" onClick={() => setOpenRow(openRow === 'profile' ? null : 'profile')} className={rowCls}>
            <span className="font-semibold text-black dark:text-zinc-50">Coach profile</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
          <button type="button" onClick={() => setOpenRow(openRow === 'notifications' ? null : 'notifications')} className={rowCls}>
            <span className="font-semibold text-black dark:text-zinc-50">Notification preferences</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        </div>

        {openRow === 'password' && (
          <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
            <ChangePasswordForm />
          </div>
        )}

        {openRow === 'email' && (
          <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
            <ChangeEmailForm currentEmail={email} />
          </div>
        )}

        {openRow === 'profile' && (
          <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
            <CoachProfileForm initialName={displayName} logoUrl={logoUrl} />
          </div>
        )}

        {openRow === 'notifications' && (
          <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Notification preferences</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Per-channel notification controls aren&apos;t available yet — every alert type is on by default.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <DefaultCheckinReminderForm initialDays={defaultCheckinReminderDays} />
        </div>

        <ThemeToggle initial={themePreference} />

        <SignOutButton variant="danger-soft" className="w-full py-3" />

        <LegalFooterLinks />
      </div>
    </AppShell>
  );
}
