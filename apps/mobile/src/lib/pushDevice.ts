import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { authStorage } from '@/lib/authStorage';
import { supabase } from '@/lib/supabase';

// This phone's side of push notifications (the sending side is apps/web/lib/expoPush.ts). Native only: the browser build uses
// pushDevice.web.ts, which does nothing.
//
// A phone is registered by its Expo push token in the push_devices table (migration 0113) through register_push_device(), under
// the member's own sign-in; turning push off, and signing out, delete that row. Whether push is "on" for a member on this phone
// is whether the row for this phone's token exists.
//
// Needs two things this test build may not have yet: a development or store build (Expo Go cannot receive remote push on
// Android) and an EAS project id in the app config (extra.eas.projectId), created when the app is first built with EAS.

// Expo Go on Android no longer supports remote push at all (it needs a development or store build), so there it is treated
// like a simulator: unsupported, and no push API is called.
const inExpoGoOnAndroid = Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// A notification that arrives while the app is open is shown as a banner, without a sound.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
} catch {
  /* a build without notification support: nothing to set up */
}

export type PushStatus =
  | 'unsupported' // a simulator or the browser: cannot receive push
  | 'unavailable' // this build has no EAS project id, so no token can be made
  | 'undetermined' // the phone has not been asked for permission yet
  | 'denied' // the member refused in the phone's settings; only they can change that
  | 'off' // allowed, but this phone is not registered for the signed-in member
  | 'on';

export const pushProjectId: string | null =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

// ---------- what is kept on this phone ----------
// The token of this phone, once registered, and whether the Home card asking to turn notifications on was dismissed.
// Both are removed at sign-out (clearPushLocal, called from clearCachedData).
const TOKEN_KEY = 'bp-push-token';
const CARD_KEY = 'bp-push-card-dismissed';

const read = (key: string): string | null => {
  try {
    return authStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) authStorage.removeItem(key);
    else authStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice just is not remembered */
  }
};

export const getPushToken = () => read(TOKEN_KEY);
export const isPushCardDismissed = () => read(CARD_KEY) === '1';
export const dismissPushCard = () => write(CARD_KEY, '1');
export function clearPushLocal() {
  write(TOKEN_KEY, null);
  write(CARD_KEY, null);
}

// ---------- status, turning on and off ----------
export async function readPushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || inExpoGoOnAndroid) return 'unsupported';
  if (!pushProjectId) return 'unavailable';
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return permission.canAskAgain ? 'undetermined' : 'denied';
  const token = getPushToken();
  if (!token) return 'off';
  const { data, error } = await supabase.from('push_devices').select('id').eq('expo_token', token).maybeSingle();
  if (error) throw error;
  return data ? 'on' : 'off';
}

// Android 8+ needs a channel before a notification (and, on Android 13+, before the permission prompt).
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: 'Messages and reminders', importance: Notifications.AndroidImportance.HIGH });
}

// Makes (or refreshes) this phone's registration for the signed-in member. Tokens can change, so this is also done at app start.
async function registerThisPhone() {
  if (!pushProjectId) throw new Error('Push notifications are not set up in this version of the app.');
  await ensureAndroidChannel();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pushProjectId });
  const { error } = await supabase.rpc('register_push_device', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_device_name: Device.modelName ?? null, // the model ("iPhone 15"), not the name the member gave their phone
  });
  if (error) throw error;
  write(TOKEN_KEY, token);
}

// Asks the phone's permission if it has not been asked (and may be asked again), then registers. Returns where that left things.
export async function enablePush(): Promise<PushStatus> {
  if (!Device.isDevice || inExpoGoOnAndroid) return 'unsupported';
  if (!pushProjectId) return 'unavailable';
  await ensureAndroidChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return permission.canAskAgain ? 'undetermined' : 'denied';
  await registerThisPhone();
  return 'on';
}

// Turns push off for the signed-in member on this phone (the phone's own permission is left as it is).
export async function disablePush() {
  const token = getPushToken();
  if (token) {
    const { error } = await supabase.from('push_devices').delete().eq('expo_token', token);
    if (error) throw error;
  }
  write(TOKEN_KEY, null);
}

// At app start: a member who has push on gets their registration refreshed (tokens change, and "last seen" moves on).
export async function refreshPushRegistration() {
  if (!Device.isDevice || inExpoGoOnAndroid || !pushProjectId || !getPushToken()) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await registerThisPhone();
}

// Before signing out, so the member stops getting notifications on this phone. Best effort with a short limit: offline, sign-out
// still goes ahead (and the registration is replaced when the next member enables push on this phone, or Expo reports it dead).
export async function unregisterPushOnSignOut() {
  const attempt = disablePush().catch(() => {});
  await Promise.race([attempt, new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
  clearPushLocal();
  Notifications.setBadgeCountAsync(0).catch(() => {});
}

export const openPhoneSettings = () => Linking.openSettings();
