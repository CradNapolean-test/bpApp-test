import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { routeForPushUrl } from '@ballistic/shared/utils/expoPush';

import { disablePush, enablePush, readPushStatus, refreshPushRegistration, type PushStatus } from '@/lib/pushDevice';
import { useSession } from '@/lib/session';

// The hooks for push notifications on the phone (the device side is lib/pushDevice.ts). The browser build uses push.web.ts.

const statusKey = (userId: string) => ['push-status', userId] as const;

// What the Profile switch and the Home card need: where push stands for this member on this phone, and turning it on or off.
// `status` is undefined until it is known (and while offline, when the member's registration cannot be checked).
export function usePushControls() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const qc = useQueryClient();
  const statusQ = useQuery({ queryKey: statusKey(userId), queryFn: readPushStatus, enabled: !!userId, staleTime: 0, retry: false });
  const turnOn = useMutation({ mutationFn: enablePush, onSuccess: (next: PushStatus) => qc.setQueryData(statusKey(userId), next) });
  const turnOff = useMutation({ mutationFn: disablePush, onSuccess: () => qc.setQueryData(statusKey(userId), 'off' satisfies PushStatus) });
  return {
    status: statusQ.data,
    busy: turnOn.isPending || turnOff.isPending,
    error: (turnOn.error ?? turnOff.error)?.message ?? null,
    enable: () => turnOn.mutate(),
    disable: () => turnOff.mutate(),
  };
}

// Tapping a notification opens the screen it is about, whether the app was closed, in the background or open. Only ever one
// of the app's own screens (routeForPushUrl); each notification is acted on once.
let handledNotification: string | null = null;
export function usePushRouting() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (id === handledNotification) return;
    handledNotification = id;
    router.navigate(routeForPushUrl(response.notification.request.content.data?.url) as Href);
  }, [response]);
}

// The red number on the app icon: unread messages and notifications (the phone ignores it if badges are not allowed).
export function useBadgeSync(count: number) {
  useEffect(() => {
    Notifications.setBadgeCountAsync(count).catch(() => {});
  }, [count]);
}

// Once per app start, refreshes this phone's registration if push is on for the signed-in member.
let refreshed = false;
export function usePushRefresh() {
  useEffect(() => {
    if (refreshed) return;
    refreshed = true;
    refreshPushRegistration().catch(() => {});
  }, []);
}
