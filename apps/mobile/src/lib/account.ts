import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import type { ThemePreference } from '@ballistic/shared/utils/account';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useMe, type Me } from '@/lib/useMe';
import { setLocalThemePreference } from '@/theme';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The name of the member's gym (the profile's "Site"). Any signed-in member may read the gyms list (migration 0052); the name rarely changes.
export function useGymName(gymId: string | null | undefined) {
  return useQuery({
    queryKey: ['gym-name', gymId],
    enabled: !!gymId,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('gyms').select('name').eq('id', gymId!).maybeSingle();
      if (error) throw error;
      return (data as { name: string } | null)?.name ?? null;
    },
  });
}

// The few profile settings a member owns. Row Level Security lets them change their own row, and nothing else.
export type ProfileSetting = Partial<Pick<ClientProfileRow, 'notifications_enabled' | 'email_notifications_enabled' | 'deletion_requested_at'>>;

export function useUpdateProfileSetting() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['client-profile', userId];
  return useMutation({
    mutationFn: async (patch: ProfileSetting) => {
      const { data, error } = await supabase.from('client_profiles').update(patch).eq('client_id', userId).select('client_id');
      if (error) throw error;
      if (!data?.length) throw new Error('Your profile could not be updated.');
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<ClientProfileRow | null>(key);
      qc.setQueryData<ClientProfileRow | null>(key, (p) => (p ? { ...p, ...patch } : p));
      return { before };
    },
    onError: (_e, _patch, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  });
}

// Supabase emails a confirmation link; the change only takes effect once it is followed.
export function useChangeEmail() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw error;
    },
  });
}

// Light / Dark / System: applied on this phone at once, then saved to the profile so it follows them to another device.
export function useSaveTheme() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (preference: ThemePreference) => {
      const { error } = await supabase.rpc('set_theme_preference', { p_preference: preference });
      if (error) throw error;
    },
    onMutate: (preference) => setLocalThemePreference(preference),
    onSuccess: (_d, preference) => qc.setQueryData<Me | undefined>(['me', userId], (p) => (p ? { ...p, themePreference: preference } : p)),
  });
}

// On a new phone the saved choice comes down from the profile the first time it is known.
export function useThemeSync() {
  const preference = useMe().data?.themePreference;
  useEffect(() => {
    if (preference) setLocalThemePreference(preference);
  }, [preference]);
}
