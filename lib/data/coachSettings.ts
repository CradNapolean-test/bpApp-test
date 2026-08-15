'use server';

import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';

export async function setDisplayName(name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_display_name', { p_name: name });
  return error ? fail(error, 'Could not save your name') : ok();
}

export async function setDefaultCheckinReminderDays(days: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_default_checkin_reminder_days', { p_days: days });
  return error ? fail(error, 'Could not save the default reminder setting') : ok();
}

// Mirrors uploadProgressPhoto's shape (lib/data/progress.ts): FormData in (the documented-safe
// way to pass a File through a Server Action), upload to Storage, then persist the resulting
// path via set_logo_path (0047) -- profiles has no general update policy, so a raw update
// would silently match zero rows.
export async function uploadCoachLogo(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not authenticated');

  const file = formData.get('file') as File | null;
  if (!file) return fail(null, 'No file provided');

  const ext = file.name.split('.').pop() || 'png';
  const path = `${user.id}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('coach-branding').upload(path, file, { upsert: true });
  if (uploadError) return fail(uploadError, 'Could not upload logo');

  const { error } = await supabase.rpc('set_logo_path', { p_path: path });
  return error ? fail(error, 'Could not save logo') : ok();
}
