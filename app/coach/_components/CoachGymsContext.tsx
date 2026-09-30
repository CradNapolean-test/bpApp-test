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

export function CoachGymsProvider({ gyms, children }: { gyms: MyGymRow[]; children: ReactNode }) {
  return <CoachGymsContext.Provider value={gyms}>{children}</CoachGymsContext.Provider>;
}
