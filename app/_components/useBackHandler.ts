'use client';

import { useEffect, useRef } from 'react';

// The phone's back button / swipe-back should close whatever is on top (a sheet, a full-screen
// panel, a photo viewer) before it goes back a screen. Anything that can be "on top" registers a
// handler here while it is open; the dashboard's back-button handler calls the newest one first.
const handlers: (() => void)[] = [];

// Closes the newest open overlay. Returns true if there was one.
export function closeTopOverlay(): boolean {
  const top = handlers[handlers.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function useBackHandler(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    const fn = () => ref.current();
    handlers.push(fn);
    return () => {
      const i = handlers.lastIndexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}
