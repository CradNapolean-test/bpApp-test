// The browser build cannot receive push notifications (the web app has its own browser push). Same exports as pushDevice.ts,
// all doing nothing, so the screens need no platform checks and expo-notifications is not bundled for the web.

export type PushStatus = 'unsupported' | 'unavailable' | 'undetermined' | 'denied' | 'off' | 'on';

export const pushProjectId: string | null = null;

export const getPushToken = (): string | null => null;
export const isPushCardDismissed = () => true;
export const dismissPushCard = () => {};
export const clearPushLocal = () => {};

export const readPushStatus = async (): Promise<PushStatus> => 'unsupported';
export const enablePush = async (): Promise<PushStatus> => 'unsupported';
export const disablePush = async () => {};
export const refreshPushRegistration = async () => {};
export const unregisterPushOnSignOut = async () => {};
export const openPhoneSettings = async () => {};
