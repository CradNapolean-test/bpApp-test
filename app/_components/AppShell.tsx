'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';

// Shared layout for every page: header (title + sign out), a top-level section bar, then
// a left sidebar (content depends on which section is active) beside the main content.
// Below md the sidebar collapses into a slide-over drawer.
export function AppShell({
  title,
  subtitle,
  topBar,
  banner,
  sidebar,
  bottomBar,
  headerAction,
  coachSummary,
  isCoachView,
  mobileHeader,
  children,
}: {
  title: string;
  subtitle?: string;
  topBar?: ReactNode;
  banner?: ReactNode;
  sidebar?: ReactNode;
  // Mobile-only bottom tab bar (client dashboard). When present it replaces the hamburger
  // drawer as the primary mobile nav instead of stacking both -- coach hub pages that don't
  // pass this keep the drawer unchanged.
  bottomBar?: ReactNode;
  // Small header-row icon button, e.g. the Account Settings shortcut that isn't one of the
  // bottom tab bar's 5 tabs.
  headerAction?: ReactNode;
  // A coach viewing a specific client's dashboard gets a distinct strip here instead of a
  // generic "Viewing as coach" subtitle string.
  coachSummary?: ReactNode;
  // Stamps data-view="coach" on the root element so globals.css can shift the accent tone
  // for this view without forking any component structure.
  isCoachView?: boolean;
  // Replaces the logo+title block on narrow viewports only (desktop keeps logo+title
  // unchanged) -- the mobile redesign's per-screen header (avatar chip + greeting on Home,
  // plain screen title elsewhere). Also hides SignOutButton on mobile when set, since the
  // screens that pass this put Sign out inside Account instead of a persistent header button.
  mobileHeader?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      data-view={isCoachView ? 'coach' : undefined}
      className={`mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 ${bottomBar ? 'pb-20 md:pb-10' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {sidebar && !bottomBar && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="-ml-1 rounded-md p-1.5 text-zinc-500 hover:bg-black/5 md:hidden dark:hover:bg-white/5"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          {mobileHeader && <div className="min-w-0 flex-1 md:hidden">{mobileHeader}</div>}
          <div className={`min-w-0 items-center gap-2 ${mobileHeader ? 'hidden md:flex' : 'flex'}`}>
            <Logo size={28} className="hidden shrink-0 sm:block" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">{title}</h1>
              {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerAction}
          <span className={mobileHeader ? 'hidden md:inline-flex' : undefined}>
            <SignOutButton />
          </span>
        </div>
      </div>

      {topBar && <div className="mt-4 overflow-x-auto">{topBar}</div>}
      {coachSummary}
      {banner}

      <div className="mt-6 flex gap-6">
        {sidebar && (
          <aside className="hidden w-52 shrink-0 space-y-1 rounded-2xl bg-black/[.02] p-3 md:block dark:bg-white/[.03]">
            {sidebar}
          </aside>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {sidebar && !bottomBar && drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto rounded-r-2xl border-r border-black/10 bg-[var(--background)] p-4 shadow-xl dark:border-white/10">
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Closes on any click inside so tapping a nav item navigates and dismisses. */}
            <div className="space-y-1" onClick={() => setDrawerOpen(false)}>
              {sidebar}
            </div>
          </aside>
        </div>
      )}

      {bottomBar}
    </div>
  );
}
