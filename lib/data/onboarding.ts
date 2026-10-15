'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ageFromDob, ageProblem, buildOnboardingPlan, isActivityLevel, isMissingColumnError, TRACKING_OPTIONS } from '@/lib/onboarding';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { fail, ok } from './result';
import type { ActionResult } from './result';

const CONSENT_REQUIRED = 'Please agree to the privacy policy and terms to continue';

// The row without one key (used to retry a save on a database that does not have a newer column yet).
function withoutKey<T extends Record<string, unknown>>(row: T, key: string): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== key)) as Partial<T>;
}

// The coach's reusable sign-up link, if they have made one. This only reads (JL1): showing the Add client popover no longer
// creates a link. A failed read comes back as an error so the card can offer Retry instead of vanishing.
export async function getMyJoinLinkToken(): Promise<{ ok: true; link: { token: string; active: boolean } | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'coach') return { ok: true, link: null };

  const { data, error } = await supabase.from('onboarding_links').select('token, active').eq('coach_id', user.id).maybeSingle();
  if (error) return { ok: false, error: 'Could not load your sign-up link.' };
  return { ok: true, link: data };
}

// Makes the coach's sign-up link on an explicit click ("Create sign-up link"), or replaces it ("Reset link"): the old address stops working.
export async function createOrResetMyJoinLink(): Promise<{ ok: true; link: { token: string; active: boolean } } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rotate_my_join_link');
  if (error || typeof data !== 'string') return { ok: false, error: 'Could not make the link. Please try again.' };
  return { ok: true, link: { token: data, active: true } };
}

export async function setJoinLinkActive(active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');
  const { error } = await supabase.from('onboarding_links').update({ active }).eq('coach_id', user.id);
  return error ? fail(error, 'Could not update the link') : ok();
}

export interface OnboardingSubmission {
  name: string;
  gender: 'Male' | 'Female';
  dateOfBirth: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  goalDescription: string;
  experience: string;
  healthNotes: string;
  startWeight: number;
  goalWeight: number;
  heightCm: number;
  activityLevel: number;
  bodyFatPct: number | null;
  nutritionTrackingMode: string;
  // Agreed to the privacy policy and terms (R22); recorded with the time.
  consented: boolean;
}

// Saves the new member's answers and starting plan. The plan is recalculated here from the answers
// (never trusted from the browser), the member is flagged for coach review with the reasons, and
// the gym's default onboarding form is assigned if they don't already have it.
export async function completeOnboarding(clientId: string, input: OnboardingSubmission): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== clientId) return fail(null, 'Not signed in');

  const name = input.name.trim();
  const age = ageFromDob(input.dateOfBirth);
  if (!name) return fail(null, 'Please enter your name');
  const ageError = ageProblem(age);
  if (ageError || age == null) return fail(null, ageError ?? 'Please check your date of birth');
  if (!isActivityLevel(input.activityLevel)) return fail(null, 'Please pick how active you are');
  if (!(input.startWeight >= 30 && input.startWeight <= 300)) return fail(null, 'Please check your weight');
  if (!(input.goalWeight >= 30 && input.goalWeight <= 300)) return fail(null, 'Please check your goal weight');
  if (!(input.heightCm >= 120 && input.heightCm <= 230)) return fail(null, 'Please check your height');
  if (input.bodyFatPct != null && !(input.bodyFatPct >= 3 && input.bodyFatPct <= 60)) {
    return fail(null, 'Please check your body fat %');
  }
  if (!TRACKING_OPTIONS.some((o) => o.value === input.nutritionTrackingMode)) return fail(null, 'Pick how to track food');
  if (!input.consented) return fail(null, CONSENT_REQUIRED);

  const plan = buildOnboardingPlan({
    gender: input.gender,
    age,
    startWeight: input.startWeight,
    goalWeight: input.goalWeight,
    heightCm: input.heightCm,
    activityLevel: input.activityLevel,
    bodyFatPct: input.bodyFatPct,
    hasHealthNotes: input.healthNotes.trim().length > 0,
  });
  if (!plan) return fail(null, 'We could not work out your plan from those answers');

  const { data: existing } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();

  const row = {
    name,
    gender: input.gender,
    date_of_birth: input.dateOfBirth,
    age,
    phone: input.phone.trim() || null,
    emergency_contact_name: input.emergencyContactName.trim() || null,
    emergency_contact_phone: input.emergencyContactPhone.trim() || null,
    goal_description: input.goalDescription.trim() || null,
    experience: input.experience.trim() || null,
    health_notes: input.healthNotes.trim() || null,
    start_weight: input.startWeight,
    goal_weight: input.goalWeight,
    height_cm: input.heightCm,
    activity_level: input.activityLevel,
    body_fat_pct: plan.bodyFatPct,
    body_fat_estimated: plan.bodyFatEstimated,
    diet_approach: 'High Carb Low Fat' as const,
    nutrition_goal: 'fat_loss' as const,
    nutrition_setting: 'steady' as const,
    cycling: false,
    timezone: DEFAULT_TIMEZONE,
    nutrition_tracking_mode: input.nutritionTrackingMode,
    onboarding_completed_at: new Date().toISOString(),
    consented_at: new Date().toISOString(),
    needs_coach_review: true,
    review_reasons: plan.reasons,
    updated_at: new Date().toISOString(),
  };

  // Seed the reminder default from the coach the first time the row is created, like the Setup form.
  let seed: { checkin_reminder_days?: number } = {};
  if (!existing) {
    const { data: withCoach } = await supabase
      .from('profiles')
      .select('coach:coach_id(default_checkin_reminder_days)')
      .eq('id', clientId)
      .single();
    const coach = Array.isArray(withCoach?.coach) ? withCoach.coach[0] : withCoach?.coach;
    if (coach?.default_checkin_reminder_days != null) seed = { checkin_reminder_days: coach.default_checkin_reminder_days };
  }

  let { error } = await supabase.from('client_profiles').upsert({ client_id: clientId, ...row, ...seed });
  if (isMissingColumnError(error, 'consented_at')) {
    // The consent column (migration 0138) is not applied yet: save everything else rather than stop the member finishing.
    ({ error } = await supabase.from('client_profiles').upsert({ client_id: clientId, ...withoutKey(row, 'consented_at'), ...seed }));
  }
  if (error) return fail(error, 'Could not save your answers. Please try again.');

  await assignDefaultForm(clientId);
  return ok();
}

// Same default onboarding form create-client assigns, but only once.
async function assignDefaultForm(clientId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('gym_id').eq('id', clientId).maybeSingle();
    if (!me?.gym_id) return;
    const { data: template } = await admin
      .from('form_templates')
      .select('id, name')
      .eq('gym_id', me.gym_id)
      .eq('is_default_onboarding', true)
      .maybeSingle();
    if (!template) return;
    const { data: already } = await admin
      .from('form_assignments')
      .select('id')
      .eq('template_id', template.id)
      .eq('client_id', clientId)
      .limit(1);
    if (already?.length) return;
    await admin.from('form_assignments').insert({ template_id: template.id, client_id: clientId });
    await admin.from('notifications').insert({ client_id: clientId, message: `Welcome! Please fill out: ${template.name}` });
  } catch {
    /* the form is a nice-to-have; never fail onboarding over it */
  }
}

export interface ShortOnboardingSubmission {
  name: string;
  gender: 'Male' | 'Female';
  dateOfBirth: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  goalDescription: string;
  experience: string;
  healthNotes: string;
  nutritionTrackingMode: string;
  consented: boolean;
  // Only for a member whose profile has no height or weights (OB3); see completeShortOnboarding.
  body?: { heightCm: number; startWeight: number; goalWeight: number; activityLevel: number; bodyFatPct: number | null };
}

// The short version for existing members: confirms contact details, goal and food-tracking method.
// It never replaces weights, targets or the review flag a coach has already set; it only fills in a missing height or weight.
export async function completeShortOnboarding(clientId: string, input: ShortOnboardingSubmission): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== clientId) return fail(null, 'Not signed in');

  const name = input.name.trim();
  const age = ageFromDob(input.dateOfBirth);
  if (!name) return fail(null, 'Please enter your name');
  const ageError = ageProblem(age);
  if (ageError || age == null) return fail(null, ageError ?? 'Please check your date of birth');
  if (!TRACKING_OPTIONS.some((o) => o.value === input.nutritionTrackingMode)) return fail(null, 'Pick how to track food');
  if (!input.consented) return fail(null, CONSENT_REQUIRED);

  // A member whose profile has no height or weights (OB3) is asked for them, so they do not finish with nothing to build a plan from.
  // Only what is missing is filled in: a coach's figures are never replaced, and the member is flagged so the coach sets the plan up.
  const bodyFields: Record<string, unknown> = {};
  if (input.body) {
    const body = input.body;
    if (!isActivityLevel(body.activityLevel)) return fail(null, 'Please pick how active you are');
    if (!(body.startWeight >= 30 && body.startWeight <= 300)) return fail(null, 'Please check your weight');
    if (!(body.goalWeight >= 30 && body.goalWeight <= 300)) return fail(null, 'Please check your goal weight');
    if (!(body.heightCm >= 120 && body.heightCm <= 230)) return fail(null, 'Please check your height');
    if (body.bodyFatPct != null && !(body.bodyFatPct >= 3 && body.bodyFatPct <= 60)) return fail(null, 'Please check your body fat %');
    const plan = buildOnboardingPlan({
      gender: input.gender,
      age,
      startWeight: body.startWeight,
      goalWeight: body.goalWeight,
      heightCm: body.heightCm,
      activityLevel: body.activityLevel,
      bodyFatPct: body.bodyFatPct,
      hasHealthNotes: input.healthNotes.trim().length > 0,
    });
    if (!plan) return fail(null, 'We could not work out your plan from those answers');
    const { data: current } = await supabase
      .from('client_profiles')
      .select('height_cm, start_weight, goal_weight, body_fat_pct, review_reasons')
      .eq('client_id', clientId)
      .maybeSingle();
    const has = (n: unknown) => typeof n === 'number' && n > 0;
    if (!has(current?.height_cm)) bodyFields.height_cm = body.heightCm;
    if (!has(current?.start_weight)) bodyFields.start_weight = body.startWeight;
    if (!has(current?.goal_weight)) bodyFields.goal_weight = body.goalWeight;
    if (Object.keys(bodyFields).length > 0) {
      bodyFields.activity_level = body.activityLevel;
      if (!has(current?.body_fat_pct)) {
        bodyFields.body_fat_pct = plan.bodyFatPct;
        bodyFields.body_fat_estimated = plan.bodyFatEstimated;
      }
      bodyFields.needs_coach_review = true;
      const earlier = Array.isArray(current?.review_reasons) ? (current.review_reasons as string[]) : [];
      bodyFields.review_reasons = [...new Set([...earlier, 'Height and weight were added by the member: set up their plan'])];
    }
  }

  const row = {
    name,
    gender: input.gender,
    date_of_birth: input.dateOfBirth,
    age,
    phone: input.phone.trim() || null,
    emergency_contact_name: input.emergencyContactName.trim() || null,
    emergency_contact_phone: input.emergencyContactPhone.trim() || null,
    goal_description: input.goalDescription.trim() || null,
    experience: input.experience.trim() || null,
    health_notes: input.healthNotes.trim() || null,
    nutrition_tracking_mode: input.nutritionTrackingMode,
    onboarding_completed_at: new Date().toISOString(),
    consented_at: new Date().toISOString(),
    details_confirm_requested_at: null,
    updated_at: new Date().toISOString(),
    ...bodyFields,
  };

  let { data, error } = await supabase.from('client_profiles').update(row).eq('client_id', clientId).select('client_id');
  if (isMissingColumnError(error, 'consented_at')) {
    // The consent column (migration 0138) is not applied yet: save everything else rather than stop the member finishing.
    ({ data, error } = await supabase.from('client_profiles').update(withoutKey(row, 'consented_at')).eq('client_id', clientId).select('client_id'));
  }
  if (isMissingColumnError(error, 'details_confirm_requested_at')) {
    // Migration 0142 is not applied yet: there is no request flag to clear.
    ({ data, error } = await supabase.from('client_profiles').update(withoutKey(withoutKey(row, 'consented_at'), 'details_confirm_requested_at')).eq('client_id', clientId).select('client_id'));
  }
  if (error || !data?.length) return fail(error, 'Could not save your answers. Please try again.');
  return ok();
}

// A coach asks one of their clients to confirm their details: the member sees a banner on Home they can dismiss (CH3). Their
// onboarding stays complete, so nobody is locked out of the app.
export async function requestDetailsUpdate(clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_profiles')
    .update({ details_confirm_requested_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .select('client_id');
  if (error || !data?.length) return fail(error, 'Could not send the request');
  return ok();
}

// ...or all of the coach's own clients who already have a profile and haven't been asked yet.
export async function requestDetailsUpdateForAll(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const { data: mine } = await supabase.from('profiles').select('id').eq('coach_id', user.id).eq('role', 'client');
  const ids = (mine ?? []).map((p) => p.id);
  if (ids.length === 0) return { ok: true, count: 0 };
  const { data, error } = await supabase
    .from('client_profiles')
    .update({ details_confirm_requested_at: new Date().toISOString() })
    .in('client_id', ids)
    .not('onboarding_completed_at', 'is', null)
    .is('details_confirm_requested_at', null)
    .select('client_id');
  if (error) return { ok: false, error: error.message || 'Could not send the request' };
  return { ok: true, count: data?.length ?? 0 };
}

export interface ReviewQueueItem {
  clientId: string;
  name: string;
  reasons: string[];
}

// New members whose starting plan the coach hasn't reviewed yet (RLS limits this to clients the
// coach can see).
export async function getClientsNeedingReview(): Promise<ReviewQueueItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_profiles')
    .select('client_id, name, review_reasons')
    .eq('needs_coach_review', true)
    .order('updated_at', { ascending: false });
  if (error) return []; // column missing until the migration is applied
  return (data ?? []).map((r) => ({ clientId: r.client_id, name: r.name || 'New member', reasons: r.review_reasons ?? [] }));
}

// A coach marks a new member's plan as reviewed (clears the flag).
export async function clearReviewFlag(clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_profiles')
    .update({ needs_coach_review: false, review_reasons: [] })
    .eq('client_id', clientId)
    .select('client_id');
  if (error) return fail(error, 'Could not clear the flag');
  if (!data?.length) return fail(null, 'Could not clear the flag');
  return ok();
}
