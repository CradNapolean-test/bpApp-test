'use client';

import { Logo } from '@/app/_components/Logo';
import { useCoachGyms } from './CoachGymsContext';
import { GymSwitcherMenu } from './GymSwitcherMenu';

// Phone header for coach pages: the brand mark and wordmark, matching the member Home header. A
// coach in more than one gym gets the site switcher where the "Performance" subtitle would be.
export function CoachMobileBrand() {
  const multiSite = useCoachGyms().length > 1;
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={32} />
      <div className="leading-tight">
        <p className="text-[15px] font-black text-black dark:text-zinc-50">Ballistic</p>
        {multiSite ? (
          <GymSwitcherMenu />
        ) : (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Performance</p>
        )}
      </div>
    </div>
  );
}
