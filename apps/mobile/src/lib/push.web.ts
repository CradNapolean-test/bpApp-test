// The browser build cannot receive push notifications. Same exports as push.ts, doing nothing.
import type { PushStatus } from '@/lib/pushDevice.web';

export function usePushControls() {
  return { status: 'unsupported' as PushStatus | undefined, busy: false, error: null as string | null, enable: () => {}, disable: () => {} };
}

export function usePushRouting() {}

export function useBadgeSync(count: number) {
  void count;
}

export function usePushRefresh() {}
