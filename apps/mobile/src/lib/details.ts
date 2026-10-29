import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { answersAge, planFor, shortBodyFields, toFullOnboardingRow, toShortOnboardingRow, firstProblem, FULL_STEPS, SHORT_STEPS, SHORT_STEPS_WITH_BODY, type OnboardingAnswers } from '@ballistic/shared/utils/onboardingForm';
import { toDetailsPatch, validatePersonalDetails, type PersonalDetailsInput } from '@ballistic/shared/utils/personalDetails';
import { friendlyProfileError, MEMBER_SETUP_FIELDS, profilePatch } from '@ballistic/shared/utils/profilePatch';

import { clearOnboardingDraft } from '@/lib/drafts';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// Once a member has a starting weight it is the baseline the calorie engine and the progress charts work from, so only their coach can
// change it (the web locks it the same way).
export const startWeightLocked = (profile: Pick<ClientProfileRow, 'start_weight'>) => (profile.start_weight ?? 0) > 0;

// The member's own "Personal details" save. Only the columns that form owns are written (never the calorie-engine inputs
// or anything the coach manages), and of those only the ones the member actually changed, so it cannot overwrite a figure the
// coach changed since the screen opened.
export function useSaveDetails() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, profile }: { input: PersonalDetailsInput; profile: ClientProfileRow }) => {
      const problem = validatePersonalDetails(input);
      if (problem) throw new Error(problem);
      const patch = profilePatch(profile as unknown as Record<string, unknown>, toDetailsPatch(input), MEMBER_SETUP_FIELDS, { startWeightLocked: startWeightLocked(profile) });
      if (Object.keys(patch).length === 0) return patch;
      const { data, error } = await supabase.from('client_profiles').update(patch).eq('client_id', userId).select('client_id');
      if (error) throw new Error(friendlyProfileError(error.message));
      if (!data?.length) throw new Error('Your profile could not be found. Please finish setting up first.');
      return patch;
    },
    onSuccess: (patch) => {
      qc.setQueryData<ClientProfileRow | null>(['client-profile', userId], (p) => (p ? { ...p, ...patch } : p));
      qc.invalidateQueries({ queryKey: ['client-profile', userId] });
    },
  });
}

export type OnboardingStatus = { needed: boolean; hasProfile: boolean };

// Does this member still have to onboard? Asked once each time the app opens (a tiny one-column request), because the
// saved copy of the profile on the phone may be older than something done on the web. If the saved answer is "done" the
// app opens at once; if it says "not yet", the app waits for the fresh answer before showing the questions, so a member who
// already finished never sees them again. With no saved answer at all (a first launch) the app opens as normal and the
// questions replace it a moment later for a brand-new member, rather than making everyone wait for the check. A failed
// check never locks the member out of the app.
// Postgres "undefined column": a database without migration 0083 has no onboarding column, so nobody needs to onboard.
export function useOnboardingGate(enabled: boolean): { status: 'loading' | 'needed' | 'done'; hasProfile: boolean } {
  const { session } = useSession();
  const userId = session?.user.id;
  const q = useQuery({
    queryKey: ['onboarding', userId],
    enabled: enabled && !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<OnboardingStatus> => {
      const { data, error } = await supabase.from('client_profiles').select('onboarding_completed_at').eq('client_id', userId!).maybeSingle();
      if (error) {
        if (error.code === '42703') return { needed: false, hasProfile: true };
        throw error;
      }
      return { needed: !data || data.onboarding_completed_at === null, hasProfile: !!data };
    },
  });
  if (!enabled || q.isError) return { status: 'done', hasProfile: true };
  if (!q.data) return { status: 'done', hasProfile: false };
  if (!q.data.needed) return { status: 'done', hasProfile: q.data.hasProfile };
  return { status: q.isFetchedAfterMount ? 'needed' : 'loading', hasProfile: q.data.hasProfile };
}

// Finishing onboarding. A new member gets the full flow (their details, body figures, the starting plan and the flag that
// asks the coach to look at it, plus their gym's default onboarding form); a member the coach asked to confirm their
// details gets the short one. The web does the same in a server action; a phone writes the member's own row under their own
// sign-in (the database still refuses the coach-managed fields) and asks the database to hand out the default form.
export function useCompleteOnboarding() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ answers, existing, withBody = false }: { answers: OnboardingAnswers; existing: boolean; withBody?: boolean }) => {
      const now = new Date();
      const nowIso = now.toISOString();
      const steps = existing ? (withBody ? SHORT_STEPS_WITH_BODY : SHORT_STEPS) : FULL_STEPS;
      const problem = firstProblem(steps, answers, now);
      if (problem) throw new Error(problem);
      const age = answersAge(answers, now);
      if (age == null) throw new Error('Please check your date of birth.');

      if (existing) {
        // A member whose profile has no height or weights is asked for them; only what is missing is filled in, and the coach is flagged.
        let body: Record<string, unknown> = {};
        if (withBody) {
          const plan = planFor(answers, now);
          if (!plan) throw new Error('We could not work out your plan from those answers.');
          const current = await supabase.from('client_profiles').select('height_cm, start_weight, goal_weight, body_fat_pct, review_reasons').eq('client_id', userId).maybeSingle();
          if (current.error) throw new Error('Could not save your answers. Please try again.');
          body = shortBodyFields(answers, plan, current.data);
        }
        const { data, error } = await supabase.from('client_profiles').update({ ...toShortOnboardingRow(answers, nowIso, age), ...body }).eq('client_id', userId).select('client_id');
        if (error || !data?.length) throw new Error(friendlyProfileError(error?.message ?? 'Could not save your answers. Please try again.'));
        return;
      }

      const plan = planFor(answers, now);
      if (!plan) throw new Error('We could not work out your plan from those answers.');
      const row = toFullOnboardingRow(answers, plan, nowIso, age);

      // A brand-new row starts with the coach's default reminder days; once it exists the coach may have changed it.
      const current = await supabase.from('client_profiles').select('client_id').eq('client_id', userId).maybeSingle();
      let seed: { checkin_reminder_days?: number } = {};
      if (!current.data) {
        const withCoach = await supabase.from('profiles').select('coach:coach_id(default_checkin_reminder_days)').eq('id', userId).single();
        const raw = withCoach.data?.coach as { default_checkin_reminder_days: number | null } | { default_checkin_reminder_days: number | null }[] | null | undefined;
        const coach = Array.isArray(raw) ? raw[0] : raw;
        if (coach?.default_checkin_reminder_days != null) seed = { checkin_reminder_days: coach.default_checkin_reminder_days };
      }
      const { error } = await supabase.from('client_profiles').upsert({ client_id: userId, ...row, ...seed });
      if (error) throw new Error('Could not save your answers. Please try again.');

      // The gym's default onboarding form: nice to have, never a reason to fail onboarding.
      await supabase.rpc('assign_default_onboarding_form');
    },
    onSuccess: () => {
      clearOnboardingDraft(userId);
      qc.setQueryData<OnboardingStatus>(['onboarding', userId], { needed: false, hasProfile: true });
      qc.invalidateQueries({ queryKey: ['client-profile', userId] });
      qc.invalidateQueries({ queryKey: ['pending-forms', userId] });
      qc.invalidateQueries({ queryKey: ['form-assignments', userId] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread', userId] });
    },
  });
}
