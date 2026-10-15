'use server';

import { raise } from './errors';
import { fail, ok } from './result';
import type { ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import { EXERCISES, EXERCISE_KEYS, TIER_TITLE, bigDogCount, formatResult, genderFromProfile, levelForResult, tiersReached } from '@/lib/bigDog';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberInfo, RawScore } from '@/lib/bigDogExport';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import type { BigDogLevel } from '@/lib/bigDog';
import type { BigDogResultRow } from './types';

export async function getBigDogResults(clientId: string): Promise<BigDogResultRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('big_dog_results')
    .select('*')
    .eq('client_id', clientId)
    .order('tested_date', { ascending: false })
    .order('created_at', { ascending: false });
  // Table missing = migration 0063 not applied to this database yet. Show an empty state
  // rather than taking the whole dashboard down (this loads on every dashboard render).
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return [];
  if (error) raise(error);
  return (data ?? []) as BigDogResultRow[];
}

// Coach-only (RLS: is_coach_of). Appends a row; the current level is derived from the latest.
export async function recordBigDogResult(
  clientId: string,
  exerciseKey: string,
  level: BigDogLevel,
  resultText: string | null
): Promise<void> {
  if (!EXERCISE_KEYS.has(exerciseKey)) throw new Error('Unknown exercise');
  const supabase = await createClient();
  const { error } = await supabase.from('big_dog_results').insert({
    client_id: clientId,
    exercise_key: exerciseKey,
    level,
    result_text: resultText?.trim() || null,
  });
  if (error) raise(error);
  await awardShirts(clientId);
}

// After a coach-verified result: make sure a shirt is owed for every tier the member has now reached, tell
// them about any new one, and stay quiet about tiers already recorded. Self-reported scores never count
// (bigDogCount ignores them). Best effort: a failure here must not undo the result that was just saved.
async function awardShirts(clientId: string): Promise<void> {
  try {
    const results = await getBigDogResults(clientId);
    const tiers = tiersReached(bigDogCount(results));
    if (tiers.length === 0) return;
    const admin = createAdminClient();
    const { data: added } = await admin
      .from('big_dog_shirts')
      .upsert(tiers.map((tier) => ({ client_id: clientId, tier })), { onConflict: 'client_id,tier', ignoreDuplicates: true })
      .select('tier');
    for (const row of added ?? []) {
      const title = TIER_TITLE[row.tier as keyof typeof TIER_TITLE];
      const message = `You earned the ${title} T-shirt! Your coach will get it to you.`;
      await admin.from('notifications').insert({ client_id: clientId, message });
      await pushQuietly('big dog shirt', () => sendPushToClient(clientId, { title: `${title} T-shirt earned`, body: message, url: '/dashboard' }));
    }
  } catch {
    // Swallowed on purpose, see above. The next verified result re-checks every tier.
  }
}

// The level is always recomputed here from the number and the client's sex, never taken from the
// browser, so a self-logged score can't claim a level it didn't earn.
async function levelFor(clientId: string, exerciseKey: string, value: number) {
  const exercise = EXERCISES.find((e) => e.key === exerciseKey);
  if (!exercise) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('client_profiles').select('gender').eq('client_id', clientId).maybeSingle();
  return { exercise, level: levelForResult(exercise, genderFromProfile(data?.gender), value) };
}

async function insertScore(clientId: string, exerciseKey: string, value: number, selfReported: boolean): Promise<ActionResult> {
  if (!Number.isFinite(value) || value < 0 || value > 100000) return fail(null, 'That result is not valid');
  const scored = await levelFor(clientId, exerciseKey, value);
  if (!scored) return fail(null, 'Unknown exercise');
  const supabase = await createClient();
  const { error } = await supabase.from('big_dog_results').insert({
    client_id: clientId,
    exercise_key: exerciseKey,
    level: scored.level,
    result_value: value,
    result_text: formatResult(scored.exercise.kind, value),
    self_reported: selfReported,
  });
  if (error) return fail(error, 'Could not save that score');
  if (!selfReported) await awardShirts(clientId);
  return ok();
}

// A member logging their own score (RLS lets them insert self-reported rows for themselves only).
export async function logMyBigDogScore(clientId: string, exerciseKey: string, value: number): Promise<ActionResult> {
  return insertScore(clientId, exerciseKey, value, true);
}

// A coach confirming a score: records a verified row (counts towards the T-shirt tier).
export async function verifyBigDogScore(clientId: string, exerciseKey: string, value: number): Promise<ActionResult> {
  return insertScore(clientId, exerciseKey, value, false);
}

// Removes one of the member's own self-reported scores (RLS refuses anything else).
export async function deleteMyBigDogScore(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('big_dog_results').delete().eq('id', id).eq('self_reported', true);
  return error ? fail(error, 'Could not delete that score') : ok();
}

// ---- Shirts owed (coach side) ----

export interface ShirtRow {
  clientId: string;
  name: string;
  tier: 'white' | 'turquoise' | 'silver' | 'gold';
  earnedAt: string;
  givenAt: string | null;
}

// Every shirt for the coach's gym, newest first (RLS scopes it). Tolerates migration 0119 not applied yet.
export async function getBigDogShirts(): Promise<ShirtRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('big_dog_shirts').select('client_id, tier, earned_at, given_at').order('earned_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    raise(error);
  }
  const ids = [...new Set((data ?? []).map((r) => r.client_id as string))];
  const { data: profiles } = ids.length
    ? await supabase.from('client_profiles').select('client_id, name').in('client_id', ids)
    : { data: [] as { client_id: string; name: string | null }[] };
  const nameBy = new Map((profiles ?? []).map((p) => [p.client_id as string, (p.name as string | null) ?? 'Member']));
  return (data ?? []).map((r) => ({
    clientId: r.client_id as string,
    name: nameBy.get(r.client_id as string) ?? 'Member',
    tier: r.tier as ShirtRow['tier'],
    earnedAt: r.earned_at as string,
    givenAt: (r.given_at as string | null) ?? null,
  }));
}

export async function setShirtGiven(clientId: string, tier: string, given: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('big_dog_shirts')
    .update({ given_at: given ? new Date().toISOString() : null, given_by: given ? auth.user?.id ?? null : null })
    .eq('client_id', clientId)
    .eq('tier', tier);
  return error ? fail(error, 'Could not update that') : ok();
}

// ---- Peak Week scores export (coach side) ----

// Every Peak Week score the coach can see, with each member's name, sex and coach, for the CSV export. RLS decides
// whose scores these are (the coach's own members, or the gym's for an admin).
export async function getScoresExport(): Promise<{ raw: RawScore[]; members: Record<string, MemberInfo> }> {
  const supabase = await createClient();
  const raw: RawScore[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('big_dog_results')
      .select('client_id, exercise_key, level, result_text, result_value, self_reported, tested_date, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) raise(error);
    raw.push(...((data ?? []) as RawScore[]));
    if (!data || data.length < 1000) break;
  }
  const ids = [...new Set(raw.map((r) => r.client_id))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const members: Record<string, MemberInfo> = {};
  const coachOf = new Map<string, string | null>();
  for (const chunk of chunks) {
    const [{ data: cps }, { data: profs }] = await Promise.all([
      supabase.from('client_profiles').select('client_id, name, gender').in('client_id', chunk),
      supabase.from('profiles').select('id, email, coach_id').in('id', chunk),
    ]);
    for (const p of profs ?? []) coachOf.set(p.id as string, (p.coach_id as string | null) ?? null);
    for (const c of cps ?? []) members[c.client_id as string] = { name: (c.name as string | null) ?? 'Member', gender: (c.gender as string | null) ?? null, coach: null };
    for (const p of profs ?? []) if (!members[p.id as string]) members[p.id as string] = { name: (p.email as string | null) ?? 'Member', gender: null, coach: null };
  }
  const coachIds = [...new Set([...coachOf.values()].filter((v): v is string => !!v))];
  if (coachIds.length) {
    const { data: coaches } = await supabase.from('profiles').select('id, email, display_name').in('id', coachIds);
    const nameBy = new Map((coaches ?? []).map((c) => [c.id as string, ((c.display_name as string | null) || (c.email as string | null)) ?? null]));
    for (const [clientId, coachId] of coachOf) if (members[clientId] && coachId) members[clientId].coach = nameBy.get(coachId) ?? null;
  }
  return { raw, members };
}
