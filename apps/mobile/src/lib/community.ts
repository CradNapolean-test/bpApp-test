import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EventWithSignup, GymEventRow, RewardRow, RewardsForMember } from '@ballistic/shared/data/types';
import { EVENT_GRACE_MS, validateFeedback } from '@ballistic/shared/utils/community';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useMe } from '@/lib/useMe';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// Upcoming events for the member's gym, with the headcount (a database function, because members cannot read each other's
// sign-ups) and whether they are going. Three small requests, started together.
export function useEvents() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['events', userId],
    queryFn: async (): Promise<EventWithSignup[]> => {
      const since = new Date(Date.now() - EVENT_GRACE_MS).toISOString();
      const [events, counts, mine] = await Promise.all([
        supabase.from('gym_events').select('*').gte('starts_at', since).order('starts_at').limit(50),
        supabase.rpc('event_signup_counts'),
        supabase.from('event_signups').select('event_id').eq('client_id', userId),
      ]);
      if (events.error) throw events.error;
      const countBy = new Map<string, number>(((counts.data ?? []) as { event_id: string; signups: number }[]).map((c) => [c.event_id, Number(c.signups)]));
      const going = new Set(((mine.data ?? []) as { event_id: string }[]).map((s) => s.event_id));
      return ((events.data ?? []) as GymEventRow[]).map((e) => ({ ...e, signups: countBy.get(e.id) ?? 0, signedUp: going.has(e.id) }));
    },
  });
}

// The one event for Home's "Next event" banner: the soonest that has not started yet, however far away, and whether the member is going.
// Two small requests (not the whole events list), started when Home opens.
export function useNextEvent() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['next-event', userId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EventWithSignup | null> => {
      const events = await supabase.from('gym_events').select('*').gte('starts_at', new Date().toISOString()).order('starts_at').limit(1);
      if (events.error) throw events.error;
      const row = ((events.data ?? []) as GymEventRow[])[0];
      if (!row) return null;
      const mine = await supabase.from('event_signups').select('event_id').eq('client_id', userId).eq('event_id', row.id).maybeSingle();
      return { ...row, signups: 0, signedUp: !!mine.data };
    },
  });
}

// The member's own gym's referral link (gyms.referral_url, migration 0138; every signed-in user can read gyms). Null while loading and
// when the gym has none, in which case Refer a friend is left out of Home.
export function useGymReferralUrl(): { url: string | null; ready: boolean } {
  const gymId = useMe().data?.gymId ?? null;
  const q = useQuery({
    queryKey: ['gym-referral-url', gymId],
    enabled: !!gymId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('gyms').select('referral_url').eq('id', gymId!).maybeSingle();
      if (error) throw error;
      const url = (data as { referral_url: string | null } | null)?.referral_url?.trim();
      return url ? url : null;
    },
  });
  return { url: q.data ?? null, ready: !gymId || q.isSuccess || q.isError };
}

// "I'm in" / leave. Shown at once and rolled back if it fails; the database refuses a full or finished event, and its message
// is what the member sees.
export function useToggleEvent() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['events', userId];
  return useMutation({
    mutationFn: async ({ event }: { event: EventWithSignup }) => {
      if (event.signedUp) {
        const { error } = await supabase.from('event_signups').delete().eq('event_id', event.id).eq('client_id', userId);
        if (error) throw new Error('Could not update your sign-up.');
      } else {
        const { error } = await supabase.from('event_signups').insert({ event_id: event.id, client_id: userId });
        if (error) throw new Error(/full|already happened/i.test(error.message) ? error.message : 'Could not sign you up.');
      }
    },
    onMutate: async ({ event }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EventWithSignup[]>(key);
      qc.setQueryData<EventWithSignup[]>(key, (rows = []) =>
        rows.map((e) => (e.id === event.id ? { ...e, signedUp: !event.signedUp, signups: Math.max(0, e.signups + (event.signedUp ? -1 : 1)) } : e)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useSubmitFeedback() {
  const userId = useUserId();
  return useMutation({
    mutationFn: async ({ rating, comment }: { rating: number; comment: string }) => {
      const problem = validateFeedback(rating, comment);
      if (problem) throw new Error(problem);
      const { error } = await supabase.from('member_feedback').insert({ client_id: userId, rating, comment: comment.trim() || null });
      if (error) throw new Error('Could not send your feedback.');
    },
  });
}

// The gym's loyalty rewards (a short list). Used by the Rewards screen and by the Home club bar's "next reward" label.
export function useRewardList() {
  return useQuery({
    queryKey: ['reward-list'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<RewardRow[]> => {
      const { data, error } = await supabase.from('rewards').select('*').order('threshold');
      if (error) throw error;
      return (data ?? []) as RewardRow[];
    },
  });
}

// What the member has been given and how far along they are: sessions attended and months a member, counted by the database.
export function useRewardProgress() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['reward-progress', userId],
    queryFn: async (): Promise<Pick<RewardsForMember, 'grantedIds' | 'sessions' | 'months'>> => {
      const [grants, progress] = await Promise.all([
        supabase.from('reward_grants').select('reward_id').eq('client_id', userId),
        supabase.rpc('member_reward_progress'),
      ]);
      if (grants.error) throw grants.error;
      if (progress.error) throw progress.error;
      const mine = ((progress.data ?? []) as { client_id: string; sessions: number; months: number }[]).find((p) => p.client_id === userId);
      return { grantedIds: (grants.data ?? []).map((g) => g.reward_id as string), sessions: Number(mine?.sessions ?? 0), months: Number(mine?.months ?? 0) };
    },
  });
}
