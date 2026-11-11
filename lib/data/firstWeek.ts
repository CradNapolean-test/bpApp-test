'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { pickIntakeForm, type FirstWeekFacts } from '@/lib/firstWeek';

// What the "Your first week" checklist on member Home ticks from (D17): read as the signed-in member, so Row Level Security keeps it
// to their own rows. Counts only (no rows come back) except the few form assignments. Home asks for it each time it opens during the
// member's first week, so a step done on another screen is ticked on the way back.
export async function getFirstWeekFacts(clientId: string): Promise<FirstWeekFacts> {
  const supabase = await createClient();
  const count = { count: 'exact' as const, head: true };
  const [photos, weighIns, scans, forms, bookings, hellos] = await Promise.all([
    supabase.from('progress_photos').select('id', count).eq('client_id', clientId).limit(1),
    supabase.from('daily_logs').select('id', count).eq('client_id', clientId).not('bodyweight', 'is', null).limit(1),
    supabase.from('body_scans').select('id', count).eq('client_id', clientId).not('weight_kg', 'is', null).limit(1),
    supabase.from('form_assignments').select('id, assigned_at, completed_at, template:form_templates(name, is_default_onboarding)').eq('client_id', clientId),
    supabase.from('bookings').select('id', count).eq('client_id', clientId).eq('status', 'booked').limit(1),
    supabase.from('chat_messages').select('id', count).eq('client_id', clientId).eq('sender_id', clientId).limit(1),
  ]);
  for (const r of [photos, weighIns, scans, forms, bookings, hellos]) if (r.error) raise(r.error);
  type Assignment = { id: string; assigned_at: string; completed_at: string | null; template: { name: string; is_default_onboarding: boolean } | null };
  const assignments = ((forms.data ?? []) as unknown as (Omit<Assignment, 'template'> & { template: Assignment['template'] | Assignment['template'][] })[]).map(
    (a) => ({ ...a, template: Array.isArray(a.template) ? (a.template[0] ?? null) : a.template })
  );
  return {
    hasPhotos: (photos.count ?? 0) > 0,
    hasWeighIn: (weighIns.count ?? 0) > 0 || (scans.count ?? 0) > 0,
    intake: pickIntakeForm(assignments),
    hasBooking: (bookings.count ?? 0) > 0,
    saidHello: (hellos.count ?? 0) > 0,
  };
}
