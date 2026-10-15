'use client';

import { shortGymName } from '@/lib/gymNames';
import { useCoachGyms } from './CoachGymsContext';

// " · Worsley" after a screen's title, for a coach who works in more than one gym: these screens show the ACTIVE gym's timetable, plans,
// forms and templates, and the coach should not have to guess which gym that is. Renders nothing for a coach in one gym.
export function ActiveGymTag({ className = '' }: { className?: string }) {
  const gyms = useCoachGyms();
  const active = gyms.find((g) => g.isActive);
  if (gyms.length < 2 || !active) return null;
  return (
    <span className={`font-semibold text-zinc-500 ${className}`}>
      {' · '}
      {shortGymName(active.gymName, { siblings: gyms.map((g) => g.gymName) })}
    </span>
  );
}
