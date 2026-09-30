'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

// Renders its children in the browser only. Used around the signed-in app shells, whose screens
// format dates, times, numbers and greetings from the viewer's locale and timezone. The server
// can't know those, so server-rendered HTML disagreed with the first client render ("Wed, 30
// Sept" vs "Wed, Sep 30", "Good afternoon" vs "Good morning"). React answers a hydration
// mismatch by rebuilding the tree, which is what threw the removeChild / insertBefore errors.
// These pages are behind login, so nothing is lost by skipping server rendering.
//
// useSyncExternalStore gives `false` during server render and hydration, then `true`.
const subscribe = () => () => {};

export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{mounted ? children : fallback}</>;
}
