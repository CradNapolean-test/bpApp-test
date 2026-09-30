import type { ReactNode } from 'react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachBrand } from './CoachBrand';
import { CoachNav } from './CoachNav';
import { CoachBottomTabBar } from './CoachBottomTabBar';

// Shared shell for every app/coach/**/loading.tsx -- renders the real (data-independent) nav
// components immediately so a tab tap gets instant feedback and a stable nav bar instead of a
// blank screen for the full server round-trip, then a body-specific skeleton fills in below.
// Deliberately omits CoachHeaderExtras (unread count/avatar) -- those need the same server
// data the page itself is still fetching, so they simply pop in once the real page mounts.
export function CoachRouteSkeleton({ children }: { children: ReactNode }) {
  return (
    <AppShell title={<CoachBrand />} isCoachView topBar={<CoachNav />} bottomBar={<CoachBottomTabBar />}>
      {children}
    </AppShell>
  );
}
