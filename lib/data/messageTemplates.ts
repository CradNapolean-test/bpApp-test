'use server';

import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { MessageTemplateRow } from './types';

// The gym's saved broadcast messages. Empty (not an error) if migration 0097 has not been applied yet.
export async function getMessageTemplates(): Promise<MessageTemplateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('message_templates').select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as MessageTemplateRow[];
}

export async function saveMessageTemplate(title: string, body: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');
  const gymId = await resolveScopingGymId(supabase);
  const { error } = await supabase.from('message_templates').insert({ gym_id: gymId, coach_id: user.id, title, body });
  return error ? fail(error, 'Could not save that template') : ok();
}

export async function deleteMessageTemplate(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('message_templates').delete().eq('id', id);
  return error ? fail(error, 'Could not delete that template') : ok();
}
