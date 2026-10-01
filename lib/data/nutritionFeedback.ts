'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToClient } from '@/lib/push';
import { fail, ok } from './result';
import type { ActionResult } from './result';
import type { NutritionFeedbackRow } from './types';

// The last two months of feedback; the nutrition screens filter it to the day being viewed. A
// missing table (migration 0085 not applied) reads as "none" so the dashboard never breaks.
export async function getNutritionFeedback(clientId: string): Promise<NutritionFeedbackRow[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('nutrition_feedback')
    .select('*')
    .eq('client_id', clientId)
    .gte('log_date', since)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as NutritionFeedbackRow[];
}

// A coach leaves feedback the member can see (on a whole day, or on one photo). The member gets an
// in-app notification and a push.
export async function addNutritionFeedback(
  clientId: string,
  logDate: string,
  body: string,
  photoId: string | null
): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return fail(null, 'Write something first');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return fail(null, 'Pick a day');

  const supabase = await createClient();
  const { error } = await supabase
    .from('nutrition_feedback')
    .insert({ client_id: clientId, log_date: logDate, photo_id: photoId, body: text });
  if (error) return fail(error, 'Could not save the feedback');

  try {
    const admin = createAdminClient();
    const message = photoId ? 'Your coach commented on a meal photo' : 'Your coach left feedback on your food diary';
    await admin.from('notifications').insert({ client_id: clientId, message });
    await sendPushToClient(clientId, {
      title: message,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      url: '/dashboard?open=nutrition',
    });
  } catch {
    /* the feedback itself is saved; a missed notification must not fail it */
  }
  return ok();
}

export async function deleteNutritionFeedback(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('nutrition_feedback').delete().eq('id', id);
  return error ? fail(error, 'Could not delete the feedback') : ok();
}
