import { useSyncExternalStore } from 'react';

// How many saved-later changes the server refused (and the app therefore undid) that the member has not dismissed yet.
// Kept apart from the query cache on purpose: nothing about it is saved on the device.
let failed = 0;
const listeners = new Set<() => void>();

function emit(next: number) {
  failed = next;
  listeners.forEach((l) => l());
}

export function reportFailedWrite() {
  emit(failed + 1);
}

export function dismissFailedWrites() {
  emit(0);
}

// Writes thrown away by a sign-out. Clearing the cache removes them from the list, but a write that is waiting for the
// connection still exists in memory and would try again later (as the next member, or the same one after they chose to lose
// it), so each is marked and refuses to run. Not counted as a failed change either: nobody wanted it saved.
const abandoned = new WeakSet<object>();

export class AbandonedWrite extends Error {
  constructor() {
    super('This change was discarded when the member signed out.');
    this.name = 'AbandonedWrite';
  }
}

export const abandonWrite = (variables: object) => abandoned.add(variables);
export const isAbandoned = (variables: unknown) => typeof variables === 'object' && variables !== null && abandoned.has(variables);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFailedWrites(): number {
  return useSyncExternalStore(subscribe, () => failed, () => 0);
}
