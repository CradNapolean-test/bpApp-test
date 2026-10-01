'use client';

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useToast } from '@/app/_components/ToastProvider';
import { enablePushNotifications, getExistingPushSubscription, isPushSupported } from '@/app/_components/pushNotifications';

const SNOOZE_KEY = 'push-prompt-snoozed-until';
const SNOOZE_DAYS = 7;

function isInstalledApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

// Offered once the app is installed to the home screen (the point at which phones allow push --
// iPhones only allow it from an installed app). Browsers insist a person taps to grant
// notification permission, so this can't flip it on silently: it's one friendly tap, then done.
// If permission was already granted but this device has no subscription yet, it just subscribes.
export function PushPrompt({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isPushSupported()) || !isInstalledApp() || Notification.permission === 'denied') return;
      const existing = await getExistingPushSubscription();
      if (cancelled || existing) return;
      if (Notification.permission === 'granted') {
        // Already allowed on this device, just not subscribed (fresh install / cleared data).
        enablePushNotifications(clientId).catch(() => {});
        return;
      }
      if (!snoozed()) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!show) return null;

  async function turnOn() {
    setBusy(true);
    try {
      await enablePushNotifications(clientId);
      toast.success('Notifications are on');
      setShow(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not turn notifications on.');
      setShow(false);
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-[55] mx-auto max-w-md rounded-2xl border border-accent/30 bg-card p-4 shadow-xl md:bottom-6">
      <button type="button" aria-label="Not now" onClick={notNow} className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-zinc-400">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <BellRing className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-black dark:text-zinc-50">Never miss a message from your coach</p>
          <p className="mt-0.5 text-xs text-zinc-500">Turn on notifications and we&apos;ll ping you when your coach replies, plus check-in reminders.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={turnOn}
          className="flex-1 rounded-full bg-accent py-2.5 text-sm font-extrabold text-accent-foreground disabled:opacity-60"
        >
          {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
        <button type="button" onClick={notNow} className="rounded-full px-4 py-2.5 text-sm font-semibold text-zinc-500">
          Not now
        </button>
      </div>
    </div>
  );
}
