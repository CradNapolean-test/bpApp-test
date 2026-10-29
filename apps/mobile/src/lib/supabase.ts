import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { authStorage } from '@/lib/authStorage';
import { trackedFetch } from '@/lib/connectivity';

// Public values only (anon/publishable key). Never put the service-role key in this app:
// everything here runs under the signed-in member's own permissions, so RLS is the boundary.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.local.example)');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to read a session from in a native app; reset-password/confirm links arrive via deep links later.
    detectSessionInUrl: false,
  },
  // Every request goes through here so the app always knows whether the server can be reached (see connectivity.ts).
  global: { fetch: trackedFetch },
});

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
