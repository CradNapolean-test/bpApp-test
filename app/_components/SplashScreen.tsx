'use client';

import { useEffect, useRef } from 'react';
import { Logo } from './Logo';

// Ballistic Performance splash: the logo on black for about a second when the app is opened,
// then fades out. Shown once per browser session (not on every navigation). The fade is pure
// CSS (see .bp-splash in globals.css) so the overlay always disappears even if this component
// never hydrates; the effect below just removes it straight away on repeat visits, and
// removes the element once the fade has finished.
const KEY = 'bp-splash-seen';

export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      if (sessionStorage.getItem(KEY)) {
        el.remove();
        return;
      }
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* storage blocked -- the CSS fade still hides it */
    }
    const t = setTimeout(() => el.remove(), 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} className="bp-splash" aria-hidden="true" suppressHydrationWarning>
      <Logo size={120} variant="full" />
      <p className="mt-4 text-lg font-black tracking-tight text-white">Ballistic</p>
      <p className="text-[10px] font-semibold uppercase tracking-[4px] text-zinc-500">Performance</p>
    </div>
  );
}
