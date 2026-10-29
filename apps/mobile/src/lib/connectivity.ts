import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { isTransientStatus, PROBE_INTERVAL_MS, REQUEST_TIMEOUT_MS } from '@ballistic/shared/utils/syncStatus';

// Whether the phone can actually reach the server. Every request the app makes goes through trackedFetch (set up in
// supabase.ts): an answer of any kind means we are online, a request that cannot get through (no signal, airplane mode, a
// hang, a gateway error) means offline. Offline, a small request is repeated until the server answers again.
// The offline write queue (writeQueue.ts) and the paused screens read this through TanStack Query's onlineManager.

// Only this module tells TanStack Query whether we are online. Its own browser listener would flip us back to "online" on
// the strength of the browser's guess, before the server can really be reached.
onlineManager.setEventListener(() => () => {});

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

// What a failed request looks like to the rest of the app. The message is written for a member to read; the name is what
// isNetworkFailure (shared) recognises, including after supabase-js has turned the error into text.
export class NetworkError extends Error {
  constructor(message = 'You seem to be offline. Check your connection and try again.') {
    super(message);
    this.name = 'BpNetworkError';
  }
}

let online = true;
const listeners = new Set<() => void>();
let probeTimer: ReturnType<typeof setInterval> | null = null;

export const isOnline = () => online;

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  onlineManager.setOnline(next); // when this turns true, TanStack Query first resumes paused writes, then refetches
  listeners.forEach((l) => l());
  if (next) stopProbing();
  else startProbing();
}

function startProbing() {
  if (probeTimer) return;
  probeTimer = setInterval(() => void checkConnectionNow(), PROBE_INTERVAL_MS);
}

function stopProbing() {
  if (!probeTimer) return;
  clearInterval(probeTimer);
  probeTimer = null;
}

// Test hook, development builds only (never active in a release build): localStorage "bp-debug-net" = "offline" makes every
// request fail like a dead connection; "reject" makes every database write answer "permission denied" like a server refusal.
function debugMode(): string | null {
  if (!__DEV__) return null;
  try {
    return globalThis.localStorage?.getItem('bp-debug-net') ?? null;
  } catch {
    return null;
  }
}

// Asks the server's health address (public, needs only the publishable key). Any answer at all means it can be reached.
export async function checkConnectionNow(): Promise<boolean> {
  if (debugMode() === 'offline') return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    await globalThis.fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabasePublishableKey }, signal: controller.signal });
    setOnline(true);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// File uploads and downloads can legitimately take a long time, so only ordinary requests get a time limit.
const NO_TIME_LIMIT = /\/storage\/v1\//;

export const trackedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const limited = !NO_TIME_LIMIT.test(url);
  const timeout = limited ? new AbortController() : null;
  const caller = init?.signal;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeout) {
    timer = setTimeout(() => {
      timedOut = true;
      timeout.abort();
    }, REQUEST_TIMEOUT_MS);
    if (caller) {
      if (caller.aborted) timeout.abort();
      else caller.addEventListener('abort', () => timeout.abort(), { once: true });
    }
  }
  try {
    const mode = debugMode();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    if (mode === 'reject' && method !== 'GET' && method !== 'HEAD' && url.includes('/rest/v1/')) {
      setOnline(true);
      return new Response(JSON.stringify({ code: '42501', message: 'Simulated refusal', details: null, hint: null }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }
    const res = await globalThis.fetch(input, timeout ? { ...init, signal: timeout.signal } : init);
    if (isTransientStatus(res.status)) throw new NetworkError();
    setOnline(true);
    return res;
  } catch (e) {
    // The caller cancelled it itself (a screen that no longer needs the answer): that says nothing about the connection.
    if (caller?.aborted && !timedOut) throw e;
    setOnline(false);
    throw e instanceof NetworkError ? e : new NetworkError();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

// Quick hints that the connection may have changed. The probe above is what actually decides.
AppState.addEventListener('change', (state) => {
  if (state === 'active' && !online) void checkConnectionNow();
});
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('offline', () => setOnline(false));
  window.addEventListener('online', () => void checkConnectionNow());
}
