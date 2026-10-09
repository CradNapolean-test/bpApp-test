'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
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
import { GymAdminSection } from './GymAdminSection';
import { GymSwitcher } from './GymSwitcher';
import type { ThemePreference } from '@/app/_components/theme';
import type { GymCoachRow, MyGymRow } from '@/lib/data/gym';

type RowKey = 'password' | 'email' | 'profile' | 'gym';

export function CoachSettingsShell({
  email,
  themePreference,
  displayName,
  defaultCheckinReminderDays,
  unreadCount,
  isGymAdmin = false,
  gymName = '',
  gymTimezone = 'UTC',
  blackoutStart = null,
  blackoutEnd = null,
  gymRoster = [],
  myGyms = [],
  currentUserId = '',
}: {
  email: string;
  themePreference: ThemePreference;
  displayName: string | null;
  defaultCheckinReminderDays: number;
  unreadCount: number;
  isGymAdmin?: boolean;
  gymName?: string;
  gymTimezone?: string;
  blackoutStart?: string | null;
  blackoutEnd?: string | null;
  gymRoster?: GymCoachRow[];
  myGyms?: MyGymRow[];
  currentUserId?: string;
}) {
  // The switcher must show for any coach who belongs to more than one gym, not just admins --
  // the row itself (and the switcher inside it) is ungated by admin status; only the
  // name-edit/roster/add-coach section further down stays admin-only.
  const showGymRow = isGymAdmin || myGyms.length > 1;
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
    'flex w-full items-center justify-between px-4 py-3.5 text-left';

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={headerExtras}
      mobileHeader={mobileHeader}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
          <Avatar name={displayName || email} size="lg" variant="self" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-black dark:text-zinc-50">{displayName || 'Coach'}</p>
            <p className="truncate text-xs text-zinc-500">{email}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/[.05] bg-card dark:border-white/10">
          {(
            [
              { key: 'password', label: 'Change password', show: true, panel: <ChangePasswordForm /> },
              { key: 'email', label: 'Change email', show: true, panel: <ChangeEmailForm currentEmail={email} /> },
              { key: 'profile', label: 'Coach profile', show: true, panel: <CoachProfileForm initialName={displayName} logoUrl={logoUrl} /> },
              {
                key: 'gym',
                label: 'Gym',
                show: showGymRow,
                panel: (
                  <div className="space-y-6">
                    {myGyms.length > 1 && <GymSwitcher gyms={myGyms} />}
                    {isGymAdmin && (
                      <GymAdminSection
                        gymName={gymName}
                        timezone={gymTimezone}
                        blackoutStart={blackoutStart}
                        blackoutEnd={blackoutEnd}
                        roster={gymRoster}
                        currentUserId={currentUserId}
                      />
                    )}
                  </div>
                ),
              },
            ] as { key: RowKey; label: string; show: boolean; panel: React.ReactNode }[]
          )
            .filter((r) => r.show)
            .map((r) => (
              <div key={r.key} className="border-b border-black/5 last:border-b-0 dark:border-white/5">
                <button type="button" aria-expanded={openRow === r.key} onClick={() => setOpenRow(openRow === r.key ? null : r.key)} className={rowCls}>
                  <span className="font-semibold text-black dark:text-zinc-50">{r.label}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${openRow === r.key ? 'rotate-180' : ''}`} />
                </button>
                {openRow === r.key && <div className="border-t border-black/5 px-4 py-4 dark:border-white/5">{r.panel}</div>}
              </div>
            ))}
        </div>

        <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
          <DefaultCheckinReminderForm initialDays={defaultCheckinReminderDays} />
        </div>

        <ThemeToggle initial={themePreference} />

        <SignOutButton variant="danger-soft" className="w-full py-3" />

        <LegalFooterLinks />
      </div>
    </AppShell>
    </ClientOnly>
  );
}
