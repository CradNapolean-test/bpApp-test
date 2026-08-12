'use client';

import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import type { ThemePreference } from '@/app/_components/theme';

export function CoachSettingsShell({ email, themePreference }: { email: string; themePreference: ThemePreference }) {
  return (
    <AppShell title="Account Settings" topBar={<CoachNav />} bottomBar={<CoachBottomTabBar />}>
      <div className="space-y-6">
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-zinc-500">Signed in as</p>
          <p className="text-base font-medium text-black dark:text-zinc-50">{email}</p>
          <p className="mt-4 text-sm text-zinc-500">Use &quot;Sign out&quot; in the top-right corner to end your session.</p>
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
      </div>
    </AppShell>
  );
}
