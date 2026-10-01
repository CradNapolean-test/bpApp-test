'use client';

import { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import { useInstall } from '@/app/_components/useInstall';

const SNOOZE_KEY = 'install-banner-snoozed-until';
const SNOOZE_DAYS = 30;

// Home-screen nudge for members using the website on a phone. Android gets a real Install button;
// iPhone has none, so it shows the Share -> Add to Home Screen steps. Hidden once installed, and
// dismissing it silences it for a month.
export function InstallBanner() {
  const { standalone, ios, mobile, installEvent } = useInstall();
  const [snoozed, setSnoozed] = useState(true);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setSnoozed(Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now());
      } catch {
        setSnoozed(false);
      }
    });
  }, []);

  if (standalone || !mobile || snoozed) return null;
  if (!ios && !installEvent) return null;

  function dismiss() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    } catch {
      /* ignore */
    }
    setSnoozed(true);
  }

  return (
    <div className="relative rounded-2xl border border-accent/30 bg-accent-soft p-3.5">
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-2 top-2 rounded-full p-1.5 text-zinc-400">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Download className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-black dark:text-zinc-50">Get the Ballistic app</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Add it to your home screen for quicker access and message notifications.</p>
          {installEvent ? (
            <button
              type="button"
              onClick={() => installEvent.prompt()}
              className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold text-accent-foreground"
            >
              Install
            </button>
          ) : steps ? (
            <ol className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-center gap-1.5"><b className="text-accent">1.</b> Tap <Share className="inline h-3.5 w-3.5" /> Share in Safari</li>
              <li className="flex items-center gap-1.5"><b className="text-accent">2.</b> Choose <PlusSquare className="inline h-3.5 w-3.5" /> Add to Home Screen</li>
            </ol>
          ) : (
            <button
              type="button"
              onClick={() => setSteps(true)}
              className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold text-accent-foreground"
            >
              Show me how
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
