'use server';

import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import { logoPath, logoProblem, previousLogoToDelete } from '@/lib/logoUpload';

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

// Back to the default wordmark. The link is cleared first, then the old file is deleted from storage (best effort: a file left behind is
// harmless, a link to a deleted file would not be).
export async function removeCoachLogo(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not authenticated');
  const { data: before } = await supabase.from('profiles').select('logo_path').eq('id', user.id).maybeSingle();
  const { error } = await supabase.rpc('set_logo_path', { p_path: null });
  if (error) return fail(error, 'Could not remove the logo');
  const old = previousLogoToDelete(before?.logo_path as string | null | undefined, null, user.id);
  if (old) await supabase.storage.from('coach-branding').remove([old]);
  return ok();
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
  // The same limits as the storage bucket (migration 0128), checked first so a refused file gets a sentence, not a storage error.
  const problem = logoProblem(file);
  if (problem) return fail({ message: problem });

  // The name comes from the checked picture type and a time stamp, never from the file's own name.
  const path = logoPath(user.id, file.type);
  const { data: before } = await supabase.from('profiles').select('logo_path').eq('id', user.id).maybeSingle();

  const { error: uploadError } = await supabase.storage.from('coach-branding').upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return fail(uploadError, 'Could not upload logo');

  const { error } = await supabase.rpc('set_logo_path', { p_path: path });
  if (error) {
    // The new file is not linked to anything: do not leave it behind.
    await supabase.storage.from('coach-branding').remove([path]);
    return fail(error, 'Could not save logo');
  }

  // Only now that the new logo is saved, delete the one it replaced.
  const old = previousLogoToDelete(before?.logo_path as string | null | undefined, path, user.id);
  if (old) await supabase.storage.from('coach-branding').remove([old]);
  return ok();
}
