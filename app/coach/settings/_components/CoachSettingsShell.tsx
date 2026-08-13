'use client';

import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import type { ThemePreference } from '@/app/_components/theme';

export function CoachSettingsShell({ email, themePreference }: { email: string; themePreference: ThemePreference }) {
  const mobileHeader = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={email} size="md" />
      <p className="truncate text-lg font-bold text-black dark:text-zinc-50">Account Settings</p>
    </div>
  );

  return (
    <AppShell title="Account Settings" topBar={<CoachNav />} bottomBar={<CoachBottomTabBar />} mobileHeader={mobileHeader}>
      <div className="space-y-6">
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-zinc-500">Signed in as</p>
          <p className="text-base font-medium text-black dark:text-zinc-50">{email}</p>
        </div>

        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <ChangePasswordForm />
        </div>

        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <ChangeEmailForm currentEmail={email} />
        </div>

        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <ThemeToggle initial={themePreference} />
        </div>

        <div className="flex justify-end rounded-lg border border-black/10 p-4 md:hidden dark:border-white/10">
          <SignOutButton variant="danger-solid" />
        </div>
      </div>
    </AppShell>
  );
}
