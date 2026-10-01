'use server';

import { createClient } from '@/lib/supabase/server';
import { EXERCISES } from '@/lib/bigDog';

export interface BigDogToVerify {
  clientId: string;
  name: string;
  exercise: string;
  result: string | null;
}

export interface DeletionRequest {
  clientId: string;
  name: string;
}

// The coach's own clients, with a display name each.
async function myClientNames(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, email, client_profiles(name)')
    .eq('coach_id', user.id)
    .eq('role', 'client');
  const names = new Map<string, string>();
  for (const row of data ?? []) {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    names.set(row.id, profile?.name || row.email);
  }
  return names;
}

// Peak week scores a member logged themselves that the coach hasn't confirmed yet: for each
// client and exercise, the newest score is still a self-reported one.
export async function getBigDogToVerify(): Promise<BigDogToVerify[]> {
  const names = await myClientNames();
  if (names.size === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('big_dog_results')
    .select('client_id, exercise_key, self_reported, result_text, created_at')
    .in('client_id', [...names.keys()])
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return []; // columns missing until migration 0078
  const latest = new Map<string, { self_reported: boolean; result_text: string | null }>();
  for (const row of data ?? []) {
    const key = `${row.client_id}|${row.exercise_key}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const labelOf = (key: string) => EXERCISES.find((e) => e.key === key)?.name ?? key;
  const out: BigDogToVerify[] = [];
  for (const [key, row] of latest) {
    if (!row.self_reported) continue;
    const [clientId, exerciseKey] = key.split('|');
    out.push({ clientId, name: names.get(clientId) ?? 'A member', exercise: labelOf(exerciseKey), result: row.result_text });
  }
  return out;
}

// Members who asked for their account and data to be deleted (a coach has to action these).
export async function getDeletionRequests(): Promise<DeletionRequest[]> {
  const names = await myClientNames();
  if (names.size === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_profiles')
    .select('client_id')
    .in('client_id', [...names.keys()])
    .not('deletion_requested_at', 'is', null);
  if (error) return [];
  return (data ?? []).map((r) => ({ clientId: r.client_id, name: names.get(r.client_id) ?? 'A member' }));
}
