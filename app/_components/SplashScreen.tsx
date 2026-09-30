'use client';

import { useEffect, useRef } from 'react';
import { Logo } from './Logo';

// Ballistic Performance splash: the logo on black for about a second when the app is opened,
// then fades out. Shown once per browser session (not on every navigation). The fade is pure
// CSS (see .bp-splash in globals.css) so the overlay always disappears even if this component
// never hydrates; the effect below just hides it straight away on repeat visits. It only ever
// changes the element's style -- removing a React-rendered node from the DOM by hand makes
// React throw removeChild/insertBefore errors on the next update.
const KEY = 'bp-splash-seen';

export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      if (sessionStorage.getItem(KEY)) {
        el.style.display = 'none';
        return;
      }
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* storage blocked -- the CSS fade still hides it */
    }
    const t = setTimeout(() => {
      el.style.display = 'none';
    }, 1800);
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
