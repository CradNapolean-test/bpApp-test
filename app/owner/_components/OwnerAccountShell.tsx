'use client';

import Link from 'next/link';
import { ArrowLeft, Building2, UserRound } from 'lucide-react';
import { CoachSidebar } from '@/app/coach/_components/CoachSidebar';

const OWNER_NAV = [
  { href: '/owner', label: 'Gyms', Icon: Building2 },
  { href: '/owner/account', label: 'Account', Icon: UserRound },
] as const;
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { ChangePasswordForm } from '@/app/_components/ChangePasswordForm';
import { ChangeEmailForm } from '@/app/_components/ChangeEmailForm';
import { ThemeToggle } from '@/app/_components/ThemeToggle';
import { SignOutButton } from '@/app/_components/SignOutButton';
import { LegalFooterLinks } from '@/app/_components/LegalFooterLinks';
import { brandParts } from '@/lib/gymNames';
import type { ThemePreference } from '@/app/_components/theme';

const card = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';

// The owner's account page (R37): the same password, email and theme controls a coach has, and a Sign out that works on a phone.
export function OwnerAccountShell({ email, themePreference, orgName }: { email: string; themePreference: ThemePreference; orgName: string | null }) {
  const brand = brandParts(orgName ?? 'Owner');
  return (
    <ClientOnly fallback={<PageSkeleton />}>
      <AppShell
        title={
          <>
            {brand.lead}
            {brand.accent && <span className="text-accent"> {brand.accent}</span>}
          </>
        }
        headerAction={
          <Link href="/owner" className="rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5">
            Overview
          </Link>
        }
        coachSidebar={<CoachSidebar email={email} nav={OWNER_NAV} roleLabel="Owner" settingsHref="/owner/account" homeHref="/owner" />}
        mobileHeader={
          <Link href="/owner" className="flex min-w-0 items-center gap-2.5" aria-label="Back to the overview">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
              <ArrowLeft className="h-4 w-4" />
            </span>
            <p className="truncate text-lg font-bold text-black dark:text-zinc-50">Account</p>
          </Link>
        }
      >
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em] text-black sm:text-[32px] dark:text-zinc-50">Account</h1>

          <div className={`flex items-center gap-3 ${card}`}>
            <Avatar name={email} size="lg" variant="self" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-black dark:text-zinc-50">Owner</p>
              <p className="truncate text-xs text-zinc-500">{email}</p>
              {orgName && <p className="truncate text-xs text-zinc-400">{orgName}</p>}
            </div>
          </div>

          <div className={card}>
            <ChangePasswordForm />
          </div>

          <div className={card}>
            <ChangeEmailForm currentEmail={email} />
          </div>

          <section className={`${card} space-y-3`}>
            <h2 className="text-base font-extrabold text-black dark:text-zinc-50">Appearance</h2>
            <ThemeToggle initial={themePreference} />
          </section>

          <SignOutButton variant="danger-soft" className="w-full py-3" />

          <LegalFooterLinks />
        </div>
      </AppShell>
    </ClientOnly>
  );
}
