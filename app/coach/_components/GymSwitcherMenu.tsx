'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useClickOutside } from '@/app/_components/useClickOutside';
import { useMenuKeys } from '@/app/_components/useMenuKeys';
import { switchActiveGym } from '@/lib/data/gym';
import { shortGymName } from '@/lib/gymNames';
import { placeUnder } from '@/lib/menuPlacement';
import { useCoachGyms } from './CoachGymsContext';

// The list's narrowest width (min-w-[12rem]), for keeping it inside the window.
const MENU_WIDTH = 192;

// Site switcher for the coach header. A coach in several gyms (e.g. Worsley and Salford Quays)
// switches here; every page then reloads for the new active gym. A coach in one gym sees nothing
// (`alwaysShow` makes it a plain label instead, used where the site name is useful context).
//
// The list of sites is drawn in the page's body, fixed under the pill, not inside the pill's own boxes. Inside them it could not be
// used: on a tablet the pill sits in the header title, whose `truncate` (overflow: hidden) cut the list off completely, so a tap showed
// nothing; on a laptop it sits in the black sidebar, whose "light text" rule for the pill also turned the site names in the white list
// pale grey, so the list looked empty.
export function GymSwitcherMenu({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const gyms = useCoachGyms();
  const router = useRouter();
  const { run, busy } = useAction();
  // Where the list is drawn while it is open (null while it is closed), measured from the pill when it opens.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const open = at !== null;
  const close = () => setAt(null);
  // Arrow keys, Home, End and Escape work from the trigger and from inside the list; focus returns to the trigger (GS2).
  const { menuRef, triggerRef } = useMenuKeys<HTMLDivElement, HTMLButtonElement>(open, close);
  // A tap on the list is not a tap outside, although the list is not inside the pill.
  const ref = useClickOutside<HTMLDivElement>(close, open, menuRef);
  // The list stays where it was drawn, so scrolling or resizing closes it rather than leaving it away from the pill.
  useEffect(() => {
    if (!open) return;
    const shut = () => setAt(null);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  const active = gyms.find((g) => g.isActive) ?? gyms[0];
  if (!active || (gyms.length < 2 && !alwaysShow)) return null;
  const siblings = gyms.map((g) => g.gymName);

  const label = (
    <span className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
      <MapPin className="h-3 w-3 text-accent" />
      {shortGymName(active.gymName, { siblings })}
      {gyms.length > 1 && <ChevronDown className="h-3 w-3 text-zinc-400" />}
    </span>
  );

  if (gyms.length < 2) return <span className="rounded-full bg-black/5 px-2.5 py-1 dark:bg-white/10">{label}</span>;

  function toggle() {
    if (open) {
      close();
      return;
    }
    const pill = triggerRef.current?.getBoundingClientRect();
    if (pill) setAt(placeUnder(pill, MENU_WIDTH, window.innerWidth));
  }

  async function pick(gymId: string) {
    close();
    if (gymId === active.gymId) return;
    await run(() => switchActiveGym(gymId), { success: 'Switched site' });
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={`Site: ${shortGymName(active.gymName, { siblings })}. Change site`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="min-h-9 rounded-full bg-black/5 px-3 py-1 hover:bg-black/10 disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15"
      >
        {label}
      </button>
      {at &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Sites"
            // The coach screens' accent colour for the tick (globals.css), which the body does not carry.
            data-ui="coach"
            style={{ top: at.top, left: at.left }}
            className="fixed z-50 min-w-[12rem] max-w-[calc(100vw-16px)] rounded-xl border border-black/10 bg-card p-1 shadow-xl dark:border-white/10"
          >
            {gyms.map((g) => (
              <button
                key={g.gymId}
                type="button"
                role="option"
                aria-selected={g.isActive}
                onClick={() => pick(g.gymId)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="font-medium text-black dark:text-zinc-50">{shortGymName(g.gymName, { siblings })}</span>
                {g.isActive && <Check className="h-4 w-4 text-accent" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
