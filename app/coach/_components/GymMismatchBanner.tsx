'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MapPin, X } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { switchActiveGym } from '@/lib/data/gym';
import { shortGymName } from '@/lib/gymNames';
import { mismatchMessage } from '@/lib/gymMismatch';
import { useCoachGyms, useGymMismatch } from './CoachGymsContext';

const dismissKey = (gymId: string) => `gym-mismatch-dismissed:${gymId}`;

// "Your members are at Salford Quays but you are viewing Worsley. Switch". Shown on the coach pages when most of the coach's own
// members belong to a different gym from the active one, because every gym-wide screen (today's timetable, plans, red flags, the
// "whole gym" list) then describes the other gym. One button switches; the cross sets it aside for this visit.
export function GymMismatchBanner() {
  const mismatch = useGymMismatch();
  const gyms = useCoachGyms();
  const pathname = usePathname();
  const { run, busy } = useAction();
  // Hidden until the browser has been asked whether this visit already dismissed it, so a dismissed banner never flashes.
  const [dismissed, setDismissed] = useState(true);

  const activeGymId = mismatch?.activeGymId ?? null;
  useEffect(() => {
    if (!activeGymId) return;
    let hidden = false;
    try {
      hidden = window.sessionStorage.getItem(dismissKey(activeGymId)) === '1';
    } catch {
      // Storage can be blocked (private window); the banner then just shows every time.
    }
    // Deferred a tick: reading the browser's storage cannot happen while rendering on the server.
    Promise.resolve().then(() => setDismissed(hidden));
  }, [activeGymId]);

  // A member's own page already describes that member's gym, so the warning belongs to the other pages.
  if (!mismatch || dismissed || /^\/coach\/clients\/[^/]+/.test(pathname)) return null;

  const names = gyms.map((g) => g.gymName);
  const name = (gymName: string) => shortGymName(gymName, { siblings: names });

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(dismissKey(mismatch!.activeGymId), '1');
    } catch {
      // Not remembered; fine.
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3">
        <MapPin className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-300">{mismatchMessage(mismatch, name)}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => switchActiveGym(mismatch.target.gymId), { success: `Switched to ${name(mismatch.target.gymName)}` })}
          className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Switching…' : `Switch to ${name(mismatch.target.gymName)}`}
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
