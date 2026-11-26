'use server';

import { createClient } from '@/lib/supabase/server';
import { MEMBER_HISTORY_PAGE } from '@/lib/creditsForm';
import { DEFAULT_TIMEZONE, isoDateInTz } from '@/lib/utils/dates';
import type { CreditsLedgerRow } from './types';

// The member's own Credits screen (ClientCreditsTab), read with the signed-in person's own client, so Row Level Security decides what
// comes back: the member's own rows, or a member a coach may see. The coach's Credits tab for their own members has its own history
// (getCreditHistory in memberships.ts, with filters), which keeps the weekly reset rows on purpose.

// One page of the history, newest first, without the weekly resets that changed nothing (BK24). `hasMore` says whether there are older
// rows, so "Show more" is only offered when there is more to show.
export async function getMyCreditActivity(
  clientId: string,
  offset = 0,
  limit = MEMBER_HISTORY_PAGE
): Promise<{ rows: CreditsLedgerRow[]; hasMore: boolean }> {
  const from = Math.max(0, Math.trunc(Number(offset) || 0));
  const size = Math.min(50, Math.max(1, Math.trunc(Number(limit) || MEMBER_HISTORY_PAGE)));
  if (!clientId) return { rows: [], hasMore: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('*')
    .eq('client_id', clientId)
    .neq('delta', 0)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + size); // one more than asked for, to know if there is another page
  if (error) throw new Error('Could not load your credit history');
  const rows = (data ?? []) as CreditsLedgerRow[];
  return { rows: rows.slice(0, size), hasMore: rows.length > size };
}

// What "Member since" is worked out from (RO15, memberSince in lib/creditsForm.ts): the start of the member's earliest plan, and the
// day their account was made, in the time zone of the member's gym (London when it can't be read). Either is null when it can't be read.
export async function getMemberSinceSources(clientId: string): Promise<{ earliestPlanStart: string | null; accountCreatedDay: string | null }> {
  if (!clientId) return { earliestPlanStart: null, accountCreatedDay: null };
  const supabase = await createClient();
  const [plans, account] = await Promise.all([
    supabase.from('client_memberships').select('started_at').eq('client_id', clientId).not('started_at', 'is', null).order('started_at').limit(1),
    supabase.from('profiles').select('created_at, gym_id').eq('id', clientId).maybeSingle(),
  ]);
  const earliestPlanStart = ((plans.data ?? [])[0] as { started_at?: string | null } | undefined)?.started_at ?? null;
  const profile = account.data as { created_at?: string | null; gym_id?: string | null } | null;
  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return { earliestPlanStart, accountCreatedDay: null };
  let timezone: string | null = null;
  if (profile?.gym_id) {
    const { data: gym } = await supabase.from('gyms').select('timezone').eq('id', profile.gym_id).maybeSingle();
    timezone = (gym as { timezone?: string | null } | null)?.timezone?.trim() || null;
  }
  let accountCreatedDay: string;
  try {
    accountCreatedDay = isoDateInTz(createdAt, timezone || DEFAULT_TIMEZONE);
  } catch {
    // A time zone the server's date library doesn't know: the default instead.
    accountCreatedDay = isoDateInTz(createdAt, DEFAULT_TIMEZONE);
  }
  return { earliestPlanStart, accountCreatedDay };
}
