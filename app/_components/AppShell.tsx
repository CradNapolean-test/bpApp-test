import type { ReactNode } from 'react';
import { SignOutButton } from './SignOutButton';

// Shared layout for every page: header (title + sign out), a top-level section bar, then
// a left sidebar (content depends on which section is active) beside the main content.
// Widened from the old max-w-4xl single-column layout to make room for the sidebar
// without cramping the main content.
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
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
        <SignOutButton />
      </div>

      {topBar && <div className="mt-4">{topBar}</div>}
      {banner}

      <div className="mt-6 flex gap-6">
        {sidebar && <aside className="w-48 shrink-0 space-y-1">{sidebar}</aside>}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
