'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useClickOutside } from '@/app/_components/useClickOutside';
import { switchActiveGym } from '@/lib/data/gym';
import { useCoachGyms } from './CoachGymsContext';

// "Ballistic Performance - Worsley" -> "Worsley": the brand is already in the header, so only the
// site part is worth the space.
export function shortGymName(name: string): string {
  return name.replace(/^Ballistic Performance\s*[-–—:]\s*/i, '').trim() || name;
}

// Site switcher for the coach header. A coach in several gyms (e.g. Worsley and Salford Quays)
// switches here; every page then reloads for the new active gym. A coach in one gym sees nothing
// (`alwaysShow` makes it a plain label instead, used where the site name is useful context).
export function GymSwitcherMenu({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const gyms = useCoachGyms();
  const router = useRouter();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  const active = gyms.find((g) => g.isActive) ?? gyms[0];
  if (!active || (gyms.length < 2 && !alwaysShow)) return null;

  const label = (
    <span className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
      <MapPin className="h-3 w-3 text-accent" />
      {shortGymName(active.gymName)}
      {gyms.length > 1 && <ChevronDown className="h-3 w-3 text-zinc-400" />}
    </span>
  );

  if (gyms.length < 2) return <span className="rounded-full bg-black/5 px-2.5 py-1 dark:bg-white/10">{label}</span>;

  async function pick(gymId: string) {
    setOpen(false);
    if (gymId === active.gymId) return;
    await run(() => switchActiveGym(gymId), { success: 'Switched site' });
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="rounded-full bg-black/5 px-2.5 py-1 hover:bg-black/10 disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15"
      >
        {label}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-1.5 min-w-[12rem] rounded-xl border border-black/10 bg-card p-1 shadow-xl dark:border-white/10"
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
              <span className="font-medium text-black dark:text-zinc-50">{shortGymName(g.gymName)}</span>
              {g.isActive && <Check className="h-4 w-4 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
