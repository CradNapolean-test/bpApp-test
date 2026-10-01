'use server';

import { createClient } from '@/lib/supabase/server';
import { fail, ok } from './result';
import type { ActionResult } from './result';

export type ReviewKind = 'week' | 'diary_day' | 'form';

// A coach marks something on their own member as looked at; it drops off the dashboard's To do.
// Idempotent (marking twice is fine).
export async function markReviewed(kind: ReviewKind, clientId: string, ref: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('coach_reviews')
    .upsert({ kind, client_id: clientId, ref }, { onConflict: 'kind,client_id,ref', ignoreDuplicates: true });
  return error ? fail(error, 'Could not mark that as reviewed') : ok();
}

export async function unmarkReviewed(kind: ReviewKind, clientId: string, ref: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('coach_reviews').delete().eq('kind', kind).eq('client_id', clientId).eq('ref', ref);
  return error ? fail(error, 'Could not undo that') : ok();
}

// Weeks (Mondays) of this member's check-ins the coach has already reviewed.
export async function getReviewedWeeks(clientId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('coach_reviews').select('ref').eq('kind', 'week').eq('client_id', clientId);
  return (data ?? []).map((r) => r.ref as string);
}

// Everything this member's coach has already reviewed, by kind (weeks are Mondays, forms are
// assignment ids).
export async function getReviews(clientId: string): Promise<{ week: string[]; form: string[] }> {
  const supabase = await createClient();
  const { data } = await supabase.from('coach_reviews').select('kind, ref').eq('client_id', clientId);
  const out = { week: [] as string[], form: [] as string[] };
  for (const r of data ?? []) {
    if (r.kind === 'week') out.week.push(r.ref as string);
    if (r.kind === 'form') out.form.push(r.ref as string);
  }
  return out;
}
