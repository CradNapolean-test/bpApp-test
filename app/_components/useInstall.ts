'use client';

import { useEffect, useState } from 'react';
import { detectDevice } from '@/lib/utils/device';

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Where this device stands on installing the app: already the installed app (standalone), an
// iPhone/iPad (no install button, so show Share -> Add to Home Screen steps), a phone/tablet at
// all, and on Android the browser's own install prompt if it offered one.
export function useInstall() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    // Read the device after mount (it can't be known during server rendering).
    Promise.resolve().then(() => {
      setStandalone(
        window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
      );
      // iPadOS 13+ reports a Macintosh user agent; a touch screen tells it apart from a Mac (UI2).
      const device = detectDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
      setIos(device.ios);
      setMobile(device.mobile);
    });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return { standalone, ios, mobile, installEvent };
}
