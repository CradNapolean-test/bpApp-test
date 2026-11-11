import { useQuery } from '@tanstack/react-query';

import { ongoingPlans, type PlanOption } from '@ballistic/shared/utils/challengeHome';
import { pickIntakeForm, type FirstWeekFacts } from '@ballistic/shared/utils/firstWeek';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// "Sessions done" on Home: bookings the member actually attended (checked in, or marked by the coach afterwards),
// counted by the database so no rows come down the wire.
export function useSessionsDone() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['sessions-done', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', userId!)
        .eq('attended', true);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// The gym's ongoing plans (no set length), for the "What's next" card in a challenge's last 2 weeks (D5). Read under RLS: a member may
// read their own gym's plans. Only asked for while the card shows.
export function useOngoingPlans(gymId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['ongoing-plans', gymId],
    enabled: enabled && !!gymId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PlanOption[]> => {
      const { data, error } = await supabase.from('membership_packages').select('id, name, credits_per_week, duration_weeks').eq('gym_id', gymId!);
      if (error) throw error;
      return ongoingPlans((data ?? []) as PlanOption[]);
    },
  });
}

// What the "Your first week" checklist ticks from (D17): the member's own rows under RLS, counts only except the few form assignments.
// Only asked for during the first week; Home asks again each time it comes into view, so a step done elsewhere is ticked on return.
export function useFirstWeekFacts(enabled: boolean) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['first-week', userId],
    enabled: enabled && !!userId,
    queryFn: async (): Promise<FirstWeekFacts> => {
      const count = { count: 'exact' as const, head: true };
      const [photos, weighIns, scans, forms, bookings, hellos] = await Promise.all([
        supabase.from('progress_photos').select('id', count).eq('client_id', userId!).limit(1),
        supabase.from('daily_logs').select('id', count).eq('client_id', userId!).not('bodyweight', 'is', null).limit(1),
        supabase.from('body_scans').select('id', count).eq('client_id', userId!).not('weight_kg', 'is', null).limit(1),
        supabase.from('form_assignments').select('id, assigned_at, completed_at, template:form_templates(name, is_default_onboarding)').eq('client_id', userId!),
        supabase.from('bookings').select('id', count).eq('client_id', userId!).eq('status', 'booked').limit(1),
        supabase.from('chat_messages').select('id', count).eq('client_id', userId!).eq('sender_id', userId!).limit(1),
      ]);
      for (const r of [photos, weighIns, scans, forms, bookings, hellos]) if (r.error) throw r.error;
      type Template = { name: string; is_default_onboarding: boolean };
      const assignments = ((forms.data ?? []) as unknown as { id: string; assigned_at: string; completed_at: string | null; template: Template | Template[] | null }[]).map(
        (a) => ({ ...a, template: Array.isArray(a.template) ? (a.template[0] ?? null) : a.template }),
      );
      return {
        hasPhotos: (photos.count ?? 0) > 0,
        hasWeighIn: (weighIns.count ?? 0) > 0 || (scans.count ?? 0) > 0,
        intake: pickIntakeForm(assignments),
        hasBooking: (bookings.count ?? 0) > 0,
        saidHello: (hellos.count ?? 0) > 0,
      };
    },
  });
}
