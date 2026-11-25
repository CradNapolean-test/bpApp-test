'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatLongDate } from '@/lib/utils/dates';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { Avatar } from '@/app/_components/Avatar';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachSidebar } from '@/app/coach/_components/CoachSidebar';
import { CoachPageHeader } from '@/app/coach/_components/CoachUi';
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
import { CoachPushToggle } from './CoachPushToggle';
import type { ThemePreference } from '@/app/_components/theme';
import type { GymCoachRow, MyGymRow } from '@/lib/data/gym';

const cardCls = 'rounded-[20px] border border-black/[.08] bg-card p-5 dark:border-white/10';

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
  referralUrl = null,
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
  referralUrl?: string | null;
  gymRoster?: GymCoachRow[];
  myGyms?: MyGymRow[];
  currentUserId?: string;
}) {
  // The switcher must show for any coach who belongs to more than one gym, not just admins --
  // the row itself (and the switcher inside it) is ungated by admin status; only the
  // name-edit/roster/add-coach section further down stays admin-only.
  const showGymRow = isGymAdmin || myGyms.length > 1;
  // Changing the email or the password opens its form inside the profile card.
  const [changing, setChanging] = useState<'email' | 'password' | null>(null);
  const logoUrl = useCoachLogoUrl();
  const router = useRouter();
  const todayLabel = formatLongDate(new Date());
  // No self-avatar here on purpose -- unlike every other coach hub page, this page's own
  // first section already is that avatar (the big profile card below), and a header link
  // back to /coach/settings while already on /coach/settings is a no-op.
  const headerExtras = (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-zinc-500 sm:inline">{todayLabel}</span>
      <CoachMessagesButton unreadCount={unreadCount} />
    </div>
  );
  // The back arrow is a real button now (CV7): it used to be a picture of one. Back to wherever the coach came from, or to the
  // dashboard when Settings was opened on its own (a link, a new tab).
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/coach');
  }
  const mobileHeader = (
    <div className="flex min-w-0 items-center gap-2.5">
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/5 text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </button>
      <p className="truncate text-lg font-bold text-black dark:text-zinc-50">Account</p>
    </div>
  );

  return (
    <ClientOnly fallback={<PageSkeleton />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={headerExtras}
      coachSidebar={<CoachSidebar unreadCount={unreadCount} email={email} />}
      mobileHeader={mobileHeader}
      pageTitle="Account"
    >
      <CoachPageHeader eyebrow={`Your account${gymName ? ` and ${gymName}` : ''}`} title="Settings" />
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* ---- Your profile ---- */}
          <section className={`${cardCls} space-y-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={displayName || email} size="lg" variant="self" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-extrabold text-black dark:text-zinc-50">{displayName || 'Coach'}</h2>
                <p className="truncate text-sm text-zinc-500">{email}</p>
              </div>
            </div>
            <CoachProfileForm initialName={displayName} logoUrl={logoUrl} />
            <div className="space-y-4 border-t border-black/[.07] pt-5 dark:border-white/10">
              <div className="flex flex-wrap gap-2">
                {(['email', 'password'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-expanded={changing === k}
                    onClick={() => setChanging(changing === k ? null : k)}
                    className={`inline-flex h-11 items-center rounded-xl px-4 text-sm font-bold ${
                      changing === k
                        ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
                        : 'border-[1.5px] border-black/20 text-black dark:border-white/25 dark:text-zinc-50'
                    }`}
                  >
                    {k === 'email' ? 'Change email' : 'Change password'}
                  </button>
                ))}
              </div>
              {changing === 'email' && <ChangeEmailForm currentEmail={email} />}
              {changing === 'password' && <ChangePasswordForm />}
            </div>
          </section>

          {/* ---- The gym: switching gyms, and for an admin its name, booking rules, referral link and coaches ---- */}
          {showGymRow && (
            <section className={`${cardCls} space-y-6`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">The gym{gymName ? ` · ${gymName}` : ''}</h2>
                {isGymAdmin && (
                  <span className="inline-flex h-6 items-center rounded-full bg-[#1d1d1b] px-2.5 text-xs font-extrabold text-white dark:bg-zinc-100 dark:text-[#1d1d1b]">
                    You are an admin
                  </span>
                )}
              </div>
              {myGyms.length > 1 && <GymSwitcher gyms={myGyms} />}
              {isGymAdmin && (
                <GymAdminSection
                  gymName={gymName}
                  timezone={gymTimezone}
                  blackoutStart={blackoutStart}
                  blackoutEnd={blackoutEnd}
                  referralUrl={referralUrl}
                  roster={gymRoster}
                  currentUserId={currentUserId}
                />
              )}
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          {currentUserId && (
            <section className={cardCls}>
              <CoachPushToggle userId={currentUserId} />
            </section>
          )}
          <section className={cardCls}>
            <DefaultCheckinReminderForm initialDays={defaultCheckinReminderDays} />
          </section>
          <section className={`${cardCls} space-y-3`}>
            <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Appearance</h2>
            <ThemeToggle initial={themePreference} />
          </section>
          <SignOutButton variant="danger-soft" className="h-12 w-full !rounded-xl" />
          <LegalFooterLinks />
        </div>
      </div>
    </AppShell>
    </ClientOnly>
  );
}
