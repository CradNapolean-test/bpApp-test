import type { SupabaseClient } from '@supabase/supabase-js';

export interface CoachClientRow {
  id: string;
  email: string;
  name: string | null;
  start_weight: number | null;
  goal_weight: number | null;
  balance: number;
}

export async function getMyClients(
  supabase: SupabaseClient,
  coachId: string
): Promise<CoachClientRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, client_profiles(name, start_weight, goal_weight), credits_balance(balance)'
    )
    .eq('coach_id', coachId)
    .eq('role', 'client')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const balanceRow = Array.isArray(row.credits_balance) ? row.credits_balance[0] : row.credits_balance;
    return {
      id: row.id,
      email: row.email,
      name: profile?.name ?? null,
      start_weight: profile?.start_weight ?? null,
      goal_weight: profile?.goal_weight ?? null,
      balance: balanceRow?.balance ?? 0,
    };
  });
}
