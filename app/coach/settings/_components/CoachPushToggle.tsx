'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/_components/Button';
import { useToast } from '@/app/_components/ToastProvider';
import {
  disablePushNotifications,
  enablePushNotifications,
  getExistingPushSubscription,
  isPushSupported,
  refreshPushRegistration,
} from '@/app/_components/pushNotifications';

type State = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

// A coach turns on notifications for members' messages here (R40). It is the member's push opt-in, for a coach: one tap, because browsers
// insist a person grants permission. The subscription is saved against the coach's own profile; /lib/chatNotify.ts sends to it.
export function CoachPushToggle({ userId }: { userId: string }) {
  const toast = useToast();
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isPushSupported())) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      const existing = await getExistingPushSubscription();
      if (cancelled) return;
      setState(existing && Notification.permission === 'granted' ? 'on' : 'off');
      // A subscription already on this browser goes to whoever is signed in now (a shared computer), as it does for members (R18).
      if (existing) refreshPushRegistration(userId).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function turnOn() {
    setBusy(true);
    try {
      await enablePushNotifications();
      setState('on');
      toast.success('Message notifications are on for this device');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not turn notifications on.');
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setState('denied');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePushNotifications();
      setState('off');
      toast.success('Message notifications are off for this device');
    } catch {
      toast.error('Could not turn notifications off. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Message notifications</h3>
      <p className="text-xs text-zinc-500">
        Get a notification on this device when a member messages you. It says who it is from, never what they wrote. There are none between 9 pm and
        7 am gym time (the number in the app still counts them), and a run of messages from one member gives one notification.
      </p>
      {state === 'checking' && <p className="text-xs text-zinc-500">Checking this device…</p>}
      {state === 'unsupported' && (
        <p className="text-xs text-zinc-500">This browser can&apos;t show notifications. On an iPhone, add the app to your Home Screen first, then come back here.</p>
      )}
      {state === 'denied' && (
        <p className="text-xs text-warning">Notifications are blocked for this site in the browser. Allow them in the browser&apos;s site settings, then come back here.</p>
      )}
      {state === 'off' && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void turnOn()}>
          {busy ? 'Turning on…' : 'Turn on notifications'}
        </Button>
      )}
      {state === 'on' && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-success">On for this device</span>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void turnOff()}>
            {busy ? 'Turning off…' : 'Turn off'}
          </Button>
        </div>
      )}
    </div>
  );
}
