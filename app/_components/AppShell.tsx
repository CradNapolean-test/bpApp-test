'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { SignOutButton } from './SignOutButton';

// Shared layout for every page: header (title + sign out), a top-level section bar, then
// a left sidebar (content depends on which section is active) beside the main content.
// Below md the sidebar collapses into a slide-over drawer -- same fixed-overlay pattern
// ChatPopup already uses, rather than introducing a second drawer idiom.
export function AppShell({
  title,
  subtitle,
  topBar,
  banner,
  sidebar,
  children,
}: {
  title: string;
  subtitle?: string;
  topBar?: ReactNode;
  banner?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {sidebar && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="-ml-1 rounded-md p-1.5 text-zinc-500 hover:bg-black/5 md:hidden dark:hover:bg-white/5"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">{title}</h1>
            {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
          </div>
        </div>
        <SignOutButton />
      </div>

      {topBar && <div className="mt-4 overflow-x-auto">{topBar}</div>}
      {banner}

      <div className="mt-6 flex gap-6">
        {sidebar && <aside className="hidden w-48 shrink-0 space-y-1 md:block">{sidebar}</aside>}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {sidebar && drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-black/10 bg-[var(--background)] p-4 shadow-xl dark:border-white/10">
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
    </div>
  );
}
