// Native (iOS/Android): Expo's recommended localStorage shim backed by expo-sqlite.
// The web build uses authStorage.web.ts instead.
import 'expo-sqlite/localStorage/install';

export const authStorage = localStorage;
