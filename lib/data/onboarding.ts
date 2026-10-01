'use server';

import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ageFromDob, buildOnboardingPlan, TRACKING_OPTIONS } from '@/lib/onboarding';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { fail, ok } from './result';
import type { ActionResult } from './result';

// The coach's reusable sign-up link token (created the first time it's asked for). The caller
// builds the full URL from their own origin.
export async function getMyJoinLinkToken(): Promise<{ token: string; active: boolean } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'coach') return null;

  const { data: existing } = await supabase
    .from('onboarding_links')
    .select('token, active')
    .eq('coach_id', user.id)
    .maybeSingle();
  if (existing) return existing;

  const token = randomBytes(18).toString('base64url');
  const { data, error } = await supabase
    .from('onboarding_links')
    .insert({ coach_id: user.id, token })
    .select('token, active')
    .single();
  return error ? null : data;
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
  if (age == null || age < 10 || age > 100) return fail(null, 'Please check your date of birth');
  if (!(input.startWeight >= 30 && input.startWeight <= 300)) return fail(null, 'Please check your weight');
  if (!(input.goalWeight >= 30 && input.goalWeight <= 300)) return fail(null, 'Please check your goal weight');
  if (!(input.heightCm >= 120 && input.heightCm <= 230)) return fail(null, 'Please check your height');
  if (input.bodyFatPct != null && !(input.bodyFatPct >= 3 && input.bodyFatPct <= 60)) {
    return fail(null, 'Please check your body fat %');
  }
  if (!TRACKING_OPTIONS.some((o) => o.value === input.nutritionTrackingMode)) return fail(null, 'Pick how to track food');

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
    tier: 1,
    cycling: false,
    timezone: DEFAULT_TIMEZONE,
    nutrition_tracking_mode: input.nutritionTrackingMode,
    onboarding_completed_at: new Date().toISOString(),
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

  const { error } = await supabase.from('client_profiles').upsert({ client_id: clientId, ...row, ...seed });
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
