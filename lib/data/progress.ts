'use server';

import { createClient } from '@/lib/supabase/server';
import type { MeasurementLogRow, ProgressPhoto, ProgressPhotoRow } from './types';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function getPhotos(clientId: string): Promise<ProgressPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('client_id', clientId)
    .order('photo_date', { ascending: false });
  if (error) throw error;

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

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${clientId}/${date}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('progress_photos')
    .insert({ client_id: clientId, photo_date: date, storage_path: path })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePhoto(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: photo, error: fetchError } = await supabase
    .from('progress_photos')
    .select('storage_path')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;

  const { error: removeError } = await supabase.storage
    .from('progress-photos')
    .remove([photo.storage_path]);
  if (removeError) throw removeError;

  const { error } = await supabase.from('progress_photos').delete().eq('id', id);
  if (error) throw error;
}

export async function getMeasurementLogs(clientId: string): Promise<MeasurementLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('measurement_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addMeasurementLog(
  clientId: string,
  logDate: string,
  fields: Partial<Omit<MeasurementLogRow, 'id' | 'client_id' | 'log_date' | 'created_at'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('measurement_logs')
    .upsert({ client_id: clientId, log_date: logDate, ...fields }, { onConflict: 'client_id,log_date' });
  if (error) throw error;
}
