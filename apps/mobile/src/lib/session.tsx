import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { unregisterPushOnSignOut } from '@/lib/pushDevice';
import { clearCachedData } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

type SessionValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider />');
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Covers a manual sign-out and an expired/revoked session alike.
      if (event === 'SIGNED_OUT') clearCachedData();
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      isLoading,
      // Returns an error message, or null on success. The route guard swaps screens when the session appears.
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? error.message : null;
      },
      signOut: async () => {
        await unregisterPushOnSignOut(); // while still signed in: this phone stops getting this member's notifications
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
