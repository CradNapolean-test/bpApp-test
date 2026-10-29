import { useQuery } from '@tanstack/react-query';

import { DEFAULT_THEME, isThemePreference, type ThemePreference } from '@ballistic/shared/utils/account';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type Me = {
  id: string;
  email: string;
  role: 'coach' | 'client' | 'owner';
  hasCoach: boolean;
  coachName: string | null;
  gymId: string | null;
  themePreference: ThemePreference;
};

// One tiny query under RLS (own row only): who is signed in and which role. Everything else a screen shows is
// fetched by that screen's own hook, never as part of a startup bundle.
export function useMe() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Me> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, coach_id, gym_id, theme_preference, coach:coach_id(display_name)')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      // A client's own row has no gym_id (it is only stored on coaches; a client's gym comes through their coach), and RLS
      // hides the coach's row from them, so ask the database function the web app uses (migration 0052).
      const { data: scopingGymId, error: gymError } = await supabase.rpc('my_scoping_gym_id');
      if (gymError) throw gymError;
      if (__DEV__) console.log('[useMe]', { role: (data as { role?: string }).role, coach_id: (data as { coach_id?: string | null }).coach_id, own_gym_id: (data as { gym_id?: string | null }).gym_id, scopingGymId });
      const p = data as unknown as {
        id: string;
        email: string;
        role: Me['role'];
        coach_id: string | null;
        gym_id: string | null;
        theme_preference: string | null;
        coach: { display_name: string | null } | { display_name: string | null }[] | null;
      };
      const coach = Array.isArray(p.coach) ? p.coach[0] : p.coach;
      return {
        id: p.id,
        email: p.email,
        role: p.role,
        hasCoach: !!p.coach_id,
        coachName: coach?.display_name ?? null,
        gymId: (scopingGymId as string | null) ?? p.gym_id,
        themePreference: isThemePreference(p.theme_preference) ? p.theme_preference : DEFAULT_THEME,
      };
    },
  });
}
