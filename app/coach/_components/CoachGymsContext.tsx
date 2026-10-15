'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { MyGymRow } from '@/lib/data/gym';

// The gyms (sites) this coach belongs to, loaded once in app/coach/layout.tsx so the site
// switcher in every page header can read them without each page passing them down.
const CoachGymsContext = createContext<MyGymRow[]>([]);

export function useCoachGyms(): MyGymRow[] {
  return useContext(CoachGymsContext);
}

// The gym this page was drawn for: the one every write below it sends along, so a tab left open on an old gym cannot write into
// the new one (R28, lib/data/gymGuard.ts). null when the coach's gyms could not be loaded; the write is then not checked.
export function useActiveGymId(): string | null {
  return useCoachGyms().find((g) => g.isActive)?.gymId ?? null;
}

export function CoachGymsProvider({ gyms, children }: { gyms: MyGymRow[]; children: ReactNode }) {
  return <CoachGymsContext.Provider value={gyms}>{children}</CoachGymsContext.Provider>;
}
