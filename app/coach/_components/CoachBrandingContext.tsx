'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// Mirrors ToastProvider/ConfirmProvider/MessagesDrawerProvider's pattern -- mounted once in
// app/coach/layout.tsx so every coach page's <CoachBrand /> can read the logo without each
// page threading it through individually. Just a plain value (no API object needed, unlike
// MessagesDrawerContext) since there's nothing to call, only to read.
const CoachBrandingContext = createContext<string | null>(null);

export function useCoachLogoUrl(): string | null {
  return useContext(CoachBrandingContext);
}

export function CoachBrandingProvider({ logoUrl, children }: { logoUrl: string | null; children: ReactNode }) {
  return <CoachBrandingContext.Provider value={logoUrl}>{children}</CoachBrandingContext.Provider>;
}
