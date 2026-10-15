'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { uploadExtension } from '@/lib/utils/uploadName';
import type { MeasurementLogRow, ProgressPhoto, ProgressPhotoRow } from './types';

// How long a photo link works. 10 minutes ran out while the member was still looking at the screen (PT3); an hour covers a normal visit,
// and the links are made again every time the page loads.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function getPhotos(clientId: string): Promise<ProgressPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('client_id', clientId)
    .order('photo_date', { ascending: false });
  if (error) raise(error);

  const photos = (data ?? []) as ProgressPhotoRow[];
  return Promise.all(
    photos.map(async (photo) => {
      const { data: signed } = await supabase.storage
        .from('progress-photos')
        .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...photo, signedUrl: signed?.signedUrl ?? null };
    })
  );
}

// Takes a FormData (not typed File args directly) -- the documented-safe way to pass a
// File through a Next.js Server Action.
export async function uploadProgressPhoto(formData: FormData): Promise<ProgressPhotoRow> {
  const supabase = await createClient();
  const clientId = formData.get('clientId') as string;
  const date = formData.get('date') as string;
  const file = formData.get('file') as File | null;
  if (!clientId || !date || !file) throw new Error('Missing clientId, date, or file');

  // The extension comes from the file's type, not its name, so a name like "x.php" or "a/../b" never reaches the storage path (L9).
  const path = `${clientId}/${date}-${crypto.randomUUID()}.${uploadExtension(file)}`;

  const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file);
  if (uploadError) raise(uploadError);

  const { data, error } = await supabase
    .from('progress_photos')
    .insert({ client_id: clientId, photo_date: date, storage_path: path })
    .select()
    .single();
  if (error) {
    // The row was refused after the file went up: take the file back down rather than leave it in storage with nothing pointing to it (L11).
    await supabase.storage.from('progress-photos').remove([path]);
    raise(error);
  }
  return data;
}

export async function deletePhoto(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: photo, error: fetchError } = await supabase
    .from('progress_photos')
    .select('storage_path')
    .eq('id', id)
    .single();
  if (fetchError) raise(fetchError);

  const { error: removeError } = await supabase.storage
    .from('progress-photos')
    .remove([photo.storage_path]);
  if (removeError) raise(removeError);

  const { error } = await supabase.from('progress_photos').delete().eq('id', id);
  if (error) raise(error);
}

export async function getMeasurementLogs(clientId: string): Promise<MeasurementLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('measurement_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

export async function addMeasurementLog(
  clientId: string,
  logDate: string,
  fields: Partial<Omit<MeasurementLogRow, 'id' | 'client_id' | 'log_date' | 'created_at'>>
): Promise<void> {
  // An empty entry would make every "Now" read as a dash (PT1).
  if (!Object.values(fields).some((v) => typeof v === 'number')) throw new Error('Enter at least one measurement.');
  const supabase = await createClient();
  const { error } = await supabase
    .from('measurement_logs')
    .upsert({ client_id: clientId, log_date: logDate, ...fields }, { onConflict: 'client_id,log_date' });
  if (error) raise(error);

  // The first time a measurement is entered it becomes that member's Start figure (a figure they
  // already have, or a coach set, is never overwritten).
  const { data: profile } = await supabase.from('client_profiles').select('*').eq('client_id', clientId).maybeSingle();
  if (profile) {
    const starts: Record<string, number> = {};
    for (const [key, value] of Object.entries(fields)) {
      const column = `meas_${key}_start`;
      if (typeof value === 'number' && column in profile && profile[column] == null) starts[column] = value;
    }
    if (Object.keys(starts).length > 0) {
      await supabase.from('client_profiles').update(starts).eq('client_id', clientId);
    }
  }
}
