'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getDataVersion, getServerDataVersion, subscribeDataVersion } from '@/lib/refreshSignal';

// Data a screen fetches itself when it opens, instead of every page load carrying it (R13/M1: the dashboard document was 347 KB, most of
// it screens the member had not opened). It reads again after a save (see lib/refreshSignal.ts) and when `key` changes. While a read is
// in flight the last answer stays on screen; `loading` is true only until the first answer for this key arrives.
export function useOnDemand<T>(loader: () => Promise<T>, key: string): { data: T | null; loading: boolean; error: boolean; reload: () => void } {
  const version = useSyncExternalStore(subscribeDataVersion, getDataVersion, getServerDataVersion);
  const [reloads, setReloads] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; data: T | null; error: boolean } | null>(null);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const requestKey = `${version}:${reloads}`;

  useEffect(() => {
    let live = true;
    loaderRef
      .current()
      .then((data) => {
        if (live) setAnswer({ key, data, error: false });
      })
      .catch(() => {
        // Keep the last good answer for this key; only a screen that never got one shows the error.
        if (live) setAnswer((prev) => (prev && prev.key === key && prev.data != null ? prev : { key, data: null, error: true }));
      });
    return () => {
      live = false;
    };
  }, [key, requestKey]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const current = answer && answer.key === key ? answer : null;
  return { data: current?.data ?? null, loading: current == null, error: current?.error ?? false, reload };
}
