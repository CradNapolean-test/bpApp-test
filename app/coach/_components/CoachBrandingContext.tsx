'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// The coach's uploaded logo (0047) and their name, resolved once in app/coach/layout.tsx so every page's brand and the desktop sidebar
// can read them without each page fetching them itself.
const CoachBrandingContext = createContext<{ logoUrl: string | null; coachName: string | null }>({ logoUrl: null, coachName: null });

export function useCoachLogoUrl(): string | null {
  return useContext(CoachBrandingContext).logoUrl;
}

export function useCoachName(): string | null {
  return useContext(CoachBrandingContext).coachName;
}

export function CoachBrandingProvider({ logoUrl, coachName = null, children }: { logoUrl: string | null; coachName?: string | null; children: ReactNode }) {
  return <CoachBrandingContext.Provider value={{ logoUrl, coachName }}>{children}</CoachBrandingContext.Provider>;
}
