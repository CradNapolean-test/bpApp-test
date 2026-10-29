import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { MutationCache, QueryClient, type Mutation } from '@tanstack/react-query';

import { isNetworkFailure } from '@ballistic/shared/utils/syncStatus';

import { authStorage } from '@/lib/authStorage';
import { outboxClear } from '@/lib/chatOutbox';
import { clearAllDrafts } from '@/lib/drafts';
import { clearPushLocal } from '@/lib/pushDevice';
import { WRITE_SCOPE } from '@/lib/queryKeys';
import { abandonWrite, AbandonedWrite, dismissFailedWrites, reportFailedWrite } from '@/lib/syncState';

const DAY_MS = 24 * 60 * 60 * 1000;

const isQueuedWrite = (mutation: Mutation<any, any, any, any>) => mutation.options.scope?.id === WRITE_SCOPE;

// One cache for the whole app. Each screen asks only for what it shows (no startup "bundle"), and the cache is
// saved on the device so a screen opens instantly from the last-known data while it refreshes in the background.
export const queryClient = new QueryClient({
  // A queued write the server refuses (it never gets here for a lost connection: those are simply tried again) is undone
  // by the refetch that follows it; the member is told with a line under the header (components/sync.tsx).
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (isQueuedWrite(mutation) && !isNetworkFailure(error) && !(error instanceof AbandonedWrite)) reportFailedWrite();
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 7 * DAY_MS, retry: 1, refetchOnWindowFocus: false },
    // Offline, a screen waits and shows what is saved on the phone. An ordinary action (booking, credits, forms ...) must not
    // wait silently: it runs at once and fails with a plain "you seem to be offline". Only the queued writes in
    // writeQueue.ts wait for the connection.
    mutations: { networkMode: 'always' },
  },
});

// The saver waits up to a second before writing, and a write scheduled just before sign-out would land after the clean-up
// below and put the previous member's copy (including writes still waiting to be saved) back on the phone. So nothing is
// saved for a moment after a clear; by then the stale write has come and gone, and anything new is saved again soon enough.
const SAVE_BLOCK_MS = 2000;
let noSaveUntil = 0;
const guardedStorage = {
  getItem: (key: string) => authStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (Date.now() >= noSaveUntil) authStorage.setItem(key, value);
  },
  removeItem: (key: string) => authStorage.removeItem(key),
} as Storage; // the saver only uses these three

export const persister = createSyncStoragePersister({ storage: guardedStorage, key: 'bp-query-cache', throttleTime: 1000 });

// Bump to discard everyone's saved cache after a shape change.
export const CACHE_BUSTER = 'v1';
// A week, so a set logged in a basement gym with no signal is still there to save if the app is not opened for a few days.
// (gcTime must be at least this long, or restored queries would be dropped at once.)
export const CACHE_MAX_AGE = 7 * DAY_MS;

// On sign-out (or an expired session) nothing of the previous member may remain on the device.
export function clearCachedData() {
  noSaveUntil = Date.now() + SAVE_BLOCK_MS;
  // Writes still waiting to be saved belong to the member who just left: they are dropped with the cache, and any that is
  // still waiting for the connection in memory is told not to run.
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (isQueuedWrite(mutation) && mutation.state.variables) abandonWrite(mutation.state.variables as object);
  }
  queryClient.clear();
  persister.removeClient();
  outboxClear();
  clearAllDrafts();
  clearPushLocal();
  dismissFailedWrites();
}

// Short-lived signed links to private photos and voice notes are kept in memory only, never saved to the device.
// So is where push notifications stand: it is a fact about this phone's permission, read fresh each time.
export function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }) {
  return query.state.status === 'success' && query.queryKey[0] !== 'signed' && query.queryKey[0] !== 'push-status';
}

// Writes waiting to be saved (or being saved right now: if the app is closed in that moment they are simply done again,
// which is safe because every queued write can be repeated) are kept on the device with the cache.
export function shouldPersistMutation(mutation: Mutation<any, any, any, any>) {
  return isQueuedWrite(mutation) && mutation.state.status === 'pending';
}
