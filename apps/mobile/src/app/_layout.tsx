import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Registers every write that keeps working offline. It has to be loaded before the saved cache is restored below, or a write
// kept from last time would have nothing to run it.
import '@/lib/queuedWrites';
import { CACHE_BUSTER, CACHE_MAX_AGE, persister, queryClient, shouldPersistMutation, shouldPersistQuery } from '@/lib/queryClient';
import { SessionProvider, useSession } from '@/lib/session';
import { palettes, useResolvedScheme, useThemePreference } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: CACHE_MAX_AGE,
          buster: CACHE_BUSTER,
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery, shouldDehydrateMutation: shouldPersistMutation },
        }}>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  const scheme = useResolvedScheme(); // the member's Light / Dark / System choice
  const p = scheme === 'dark' ? palettes.dark : palettes.light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const preference = useThemePreference();

  // The phone's own chrome (status bar, keyboards, alerts) follows the member's Light / Dark choice, not only the phone's setting:
  // otherwise a light phone with the app on its default dark theme would show a dark clock and battery on a dark bar.
  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);
  useEffect(() => {
    try {
      SystemUI.setBackgroundColorAsync(p.background).catch(() => {}); // the colour behind everything (no white flash on Android)
    } catch {
      /* not available on the web */
    }
  }, [p.background]);

  // Keep the native splash up until the stored session has been read, so there is no login flash. The navigator
  // is not rendered until then either: with the guard briefly "signed out", reloading a signed-in page (or opening
  // a deep link) would redirect away and lose where you were going.
  if (!isLoading) SplashScreen.hide();
  if (isLoading) return null;

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background: p.background, card: p.card, text: p.foreground, primary: p.accent, border: p.border },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        {/* Open to both: checking the emailed code signs the member in, and they must stay here to set the new password. */}
        <Stack.Screen name="reset-password" />
      </Stack>
    </ThemeProvider>
  );
}
