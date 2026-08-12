'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ClientJournalEntryRow } from './types';

export async function getJournalEntries(clientId: string): Promise<ClientJournalEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_journal_entries')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) raise(error);
  return (data ?? []) as ClientJournalEntryRow[];
}

export async function addJournalEntry(
  clientId: string,
  kind: ClientJournalEntryRow['kind'],
  body: string,
  relatedDate: string | null = null
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('client_journal_entries')
    .insert({ client_id: clientId, coach_id: user.id, kind, body, related_date: relatedDate });
  if (error) raise(error);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('client_journal_entries').delete().eq('id', id);
  if (error) raise(error);
}
