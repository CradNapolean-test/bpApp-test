import { useMutation, useMutationState, type QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';

import { isNetworkFailure, retryDelayMs } from '@ballistic/shared/utils/syncStatus';

import { queryClient } from '@/lib/queryClient';
import { WRITE_SCOPE } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { AbandonedWrite, isAbandoned } from '@/lib/syncState';

// The offline write queue: sets logged in the gym, food added to the diary and check-in figures keep working with no signal.
//
// How it works. A write (see queuedWrites.ts) is a TanStack Query mutation with a name, a scope, and a function that carries
// it out. The screen updates itself at once (as before), then the write runs. If the server cannot be reached (connectivity.ts
// knows), the write waits and is repeated, and TanStack Query keeps it on the phone with the cache, so it survives the app
// being closed. When the connection is back the waiting writes run first, in the order they were made, then the screens
// refresh. Credits, bookings, memberships and chat are never queued: they need the server's answer.
//
// Safe to repeat: every write can be run twice with the same result (inserts carry an id made on the phone, updates and deletes
// are by id, upserts are by their natural key). RLS is still the boundary: a queued write runs under the member's own sign-in.

export type WriteVars = { userId: string };
export type Invalidation = { key: QueryKey; refetch?: boolean };

// Refetches wanted by writes that already finished while others are still waiting. They run once the queue is empty, so a
// screen is not refreshed from the server (which does not have the later writes yet) in the middle of a run.
const pendingRefresh = new Map<string, { key: QueryKey; refetch: boolean }>();

const isQueued = (m: { options: { scope?: { id: string } } }) => m.options.scope?.id === WRITE_SCOPE;

// Writes not yet saved, counting the one that is just finishing when called from its own onSettled.
function unsavedWrites(): number {
  return queryClient.getMutationCache().findAll({ predicate: (m) => isQueued(m) && m.state.status === 'pending' }).length;
}

// A queued write only ever runs for the member who made it: if someone else is signed in by now, it is dropped (and counted
// as a change that could not be saved). Reading the session needs no network unless the sign-in has to be refreshed.
async function assertSameMember(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) throw new Error('This change was made by a different member and was not saved.');
}

export type WriteKey = readonly ['write', string];

export function defineWrite<TVars extends WriteVars>(
  name: string,
  config: { run: (vars: TVars) => Promise<void>; invalidate: (vars: TVars) => Invalidation[] },
): WriteKey {
  const key = ['write', name] as const;
  queryClient.setMutationDefaults(key, {
    scope: { id: WRITE_SCOPE },
    networkMode: 'online', // waits while offline instead of failing
    // Only "could not reach the server" is tried again (and again, with a growing pause, while the phone is offline).
    // An answer from the server, even a refusal, is final.
    retry: (_count, error) => isNetworkFailure(error),
    retryDelay: retryDelayMs,
    mutationFn: async (variables: unknown) => {
      if (isAbandoned(variables)) throw new AbandonedWrite();
      const vars = variables as TVars;
      await assertSameMember(vars.userId);
      await config.run(vars);
    },
    onSettled: (_data, error, variables) => {
      // After a refusal the screens must be refetched to undo what they showed; after a success the cached copy is already right.
      for (const { key: k, refetch = true } of config.invalidate(variables as TVars)) {
        const id = JSON.stringify(k);
        const wasRefetch = pendingRefresh.get(id)?.refetch ?? false;
        pendingRefresh.set(id, { key: k, refetch: wasRefetch || refetch || !!error });
      }
      if (unsavedWrites() > 1) return; // others are still waiting: refresh when the last one is done
      for (const { key: k, refetch } of pendingRefresh.values()) {
        void queryClient.invalidateQueries({ queryKey: k, refetchType: refetch ? 'active' : 'none' });
      }
      pendingRefresh.clear();
    },
  });
  return key;
}

// The hook a screen uses. `apply` updates the screens straight away from the member's input; `toVars` is the plain,
// small description of the write that is kept on the phone and sent. `isPending` stays true while the write waits for a
// connection and `isSuccess` turns true once it is saved on the server, for the few screens that show "saving" and "saved".
export function useQueuedWrite<TInput, TVars extends WriteVars>(opts: {
  key: WriteKey;
  toVars: (input: TInput) => TVars;
  apply: (input: TInput, vars: TVars) => Promise<void> | void;
}) {
  const { key, toVars, apply } = opts;
  const { mutate, isPending, isSuccess } = useMutation<void, Error, TVars>({ mutationKey: key });
  const run = useCallback(
    (input: TInput) => {
      const vars = toVars(input);
      // Whatever happens to the screen update, the write itself must still be queued.
      Promise.resolve()
        .then(() => apply(input, vars))
        .catch(() => {})
        .then(() => mutate(vars));
    },
    [toVars, apply, mutate],
  );
  return { mutate: run, isPending, isSuccess };
}

// How many writes are waiting to be saved (for the line under the header).
export function useWaitingWrites(): number {
  return useMutationState({ filters: { predicate: (m) => isQueued(m) && m.state.status === 'pending' }, select: () => 1 }).length;
}

// After a restart the writes that were waiting come back from the phone's storage without anything running them. Called once
// the saved cache has been restored and the member is signed in again.
let resumed = false;
export function resumeQueuedWrites() {
  if (resumed) return;
  resumed = true;
  for (const m of queryClient.getMutationCache().findAll({ predicate: (mu) => isQueued(mu) && mu.state.status === 'pending' })) {
    void m.continue().catch(() => {});
  }
}

// ---------- helpers the write functions share ----------

// Inserts rows that carry an id made on the phone. If an earlier try already saved them (the answer was lost on the way back)
// the second try hits the primary key: that counts as done, but only when the rows really are there for this member.
export async function insertOnce(table: string, rows: ({ id: string } & Record<string, unknown>)[]) {
  const { error } = await supabase.from(table).insert(rows);
  if (!error) return;
  if (error.code === '23505') {
    const ids = rows.map((r) => r.id);
    const { data, error: checkError } = await supabase.from(table).select('id').in('id', ids);
    // The check could not run (no signal again): throw that error, so a lost connection is waited out and not reported as a refusal.
    if (checkError) throw checkError;
    if ((data ?? []).length === ids.length) return;
  }
  throw error;
}
