'use client';

import Image from 'next/image';
import { useCoachLogoUrl } from './CoachBrandingContext';
import { GymSwitcherMenu } from './GymSwitcherMenu';

// Two-tone wordmark shown in place of a generic page title on every coach desktop page
// (Dashboard/Clients/Classes/Library/Messages/Settings) -- matches the design handoff's
// header, which never repeats the section name up top (that shows up as the page's own H1
// below instead). Sizing/weight are inherited from AppShell's own <h1> wrapper.
// Swaps in the coach's uploaded logo (0047) in place of the wordmark when one exists --
// "use client" so it can read CoachBrandingContext (mounted once in app/coach/layout.tsx)
// instead of every one of this component's ~7 call sites fetching/passing it down individually.
export function CoachBrand() {
  const logoUrl = useCoachLogoUrl();

  const mark = logoUrl ? (
    <Image src={logoUrl} alt="" width={28} height={28} unoptimized className="h-7 w-auto rounded" />
  ) : (
    <>
      Ballistic <span className="text-accent">Performance</span>
    </>
  );

  // The site switcher only renders for a coach who belongs to more than one gym.
  return (
    <>
      {mark}
      <span className="ml-3 hidden align-middle md:inline-block">
        <GymSwitcherMenu />
      </span>
    </>
  );
}
