'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { OnboardingFlow } from './OnboardingFlow';
import { detailsSnoozeKey as key, snoozedRecently } from '@/lib/detailsConfirm';
import type { ClientProfileRow } from '@/lib/data/types';

// "Your coach asked you to check your details" (CH3). Shown on Home while the coach's request is open. It never blocks the app:
// "Later" hides it for a day, and finishing the quick check clears the request.

export function DetailsConfirmBanner({
  clientId,
  email,
  profile,
}: {
  clientId: string;
  email: string;
  profile: ClientProfileRow;
}) {
  const [hidden, setHidden] = useState(true); // hidden until we know the snooze state, so it does not flash
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setHidden(snoozedRecently(localStorage.getItem(key(clientId))));
    } catch {
      setHidden(false);
    }
  }, [clientId]);

  if (!profile.details_confirm_requested_at) return null;

  if (open) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--background)]">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close and go back to Home"
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 rounded-full p-2 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
        >
          <X className="h-5 w-5" />
        </button>
        <OnboardingFlow clientId={clientId} email={email} coachFirstName={null} existing={profile} />
      </div>
    );
  }

  if (hidden) return null;

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-3.5">
      <p className="flex items-center gap-2 text-sm font-extrabold text-black dark:text-zinc-50">
        <ClipboardCheck className="h-4 w-4 text-accent" /> Your coach asked you to check your details
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">It takes about a minute: contact details, your goal and how you track food.</p>
      <div className="mt-2.5 flex items-center gap-4">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground">
          Check now
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(key(clientId), String(Date.now()));
            } catch {
              /* no storage: it just hides until the next visit */
            }
            setHidden(true);
          }}
          className="text-xs font-semibold text-zinc-500 underline"
        >
          Later
        </button>
      </div>
    </div>
  );
}
