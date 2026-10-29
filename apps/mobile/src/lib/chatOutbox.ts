import { useMemo, useSyncExternalStore } from 'react';

import type { MessageKind } from '@ballistic/shared/utils/chat';

// Messages being sent (or that failed to send) in this app session. Kept out of the query cache on purpose: that
// cache is saved on the device, and a half-sent message must not come back as "sending..." after a restart.
// A proper offline queue that survives restarts is slice 8.
export type OutboxItem = {
  localId: string;
  clientId: string;
  kind: MessageKind;
  createdAt: string;
  status: 'sending' | 'failed';
  text?: string;
  uri?: string; // the photo as picked, or the recorded voice note, on the device
  width?: number;
  height?: number;
  shrunkUri?: string; // the photo after shrinking, ready to upload
  seconds?: number;
  uploadedPath?: string; // set once the file reached storage, so a retry does not upload it twice
  error?: string;
};

let items: OutboxItem[] = [];
const listeners = new Set<() => void>();

function emit(next: OutboxItem[]) {
  items = next;
  listeners.forEach((l) => l());
}

export function outboxAdd(item: OutboxItem) {
  emit([...items, item]);
}

export function outboxUpdate(localId: string, patch: Partial<OutboxItem>) {
  emit(items.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
}

export function outboxRemove(localId: string) {
  emit(items.filter((i) => i.localId !== localId));
}

export function outboxGet(localId: string): OutboxItem | undefined {
  return items.find((i) => i.localId === localId);
}

export function outboxClear() {
  emit([]);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Newest first, to sit at the bottom of the (inverted) message list.
export function useOutbox(clientId: string | undefined): OutboxItem[] {
  const all = useSyncExternalStore(subscribe, () => items, () => items);
  return useMemo(() => all.filter((i) => i.clientId === clientId).slice().reverse(), [all, clientId]);
}
