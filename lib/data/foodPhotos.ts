'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { FoodPhotoEntry, FoodPhotoEntryRow } from './types';
import { getDailyLog, getOrCreateDailyLog } from './dailyLogs';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

// Date-nav resolver, same shape as getManualMacrosForDate: create:true (member) backfills a blank
// daily_logs row for that day, create:false (coach) never does.
export async function getFoodPhotosForDate(
  clientId: string,
  date: string,
  create: boolean
): Promise<{ dailyLogId: string | null; photos: FoodPhotoEntry[] }> {
  const dailyLog = create ? await getOrCreateDailyLog(clientId, date) : await getDailyLog(clientId, date);
  if (!dailyLog) return { dailyLogId: null, photos: [] };
  return { dailyLogId: dailyLog.id, photos: await getFoodPhotos(dailyLog.id) };
}

export async function getFoodPhotos(dailyLogId: string): Promise<FoodPhotoEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_photo_entries')
    .select('*')
    .eq('daily_log_id', dailyLogId)
    .order('created_at', { ascending: false });
  // This is called unconditionally from dashboardBundle.ts on every dashboard load (for
  // clients not even in photo_diary mode), so it must not take down the whole dashboard if
  // migration 0035 hasn't been run yet in this environment -- degrade to "no photos" instead
  // of throwing. Any other error still raises normally.
  if (error) {
    if (error.message?.includes('food_photo_entries')) return [];
    raise(error);
  }

  const entries = (data ?? []) as FoodPhotoEntryRow[];
  return Promise.all(
    entries.map(async (entry) => {
      const { data: signed } = await supabase.storage
        .from('food-photos')
        .createSignedUrl(entry.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...entry, signedUrl: signed?.signedUrl ?? null };
    })
  );
}

// Takes a FormData (not typed File args directly) -- same reasoning as uploadProgressPhoto:
// the documented-safe way to pass a File through a Next.js Server Action.
export async function uploadFoodPhoto(formData: FormData): Promise<FoodPhotoEntryRow> {
  const supabase = await createClient();
  const clientId = formData.get('clientId') as string;
  const dailyLogId = formData.get('dailyLogId') as string;
  const description = (formData.get('description') as string) || null;
  const file = formData.get('file') as File | null;
  if (!clientId || !dailyLogId || !file) throw new Error('Missing clientId, dailyLogId, or file');

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${clientId}/${dailyLogId}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('food-photos').upload(path, file);
  if (uploadError) raise(uploadError);

  const { data, error } = await supabase
    .from('food_photo_entries')
    .insert({
      daily_log_id: dailyLogId,
      storage_path: path,
      description,
    })
    .select()
    .single();
  if (error) raise(error);
  // The photo diary is visual only: no calories or macros are estimated or written to the day's
  // totals (those come from the check-in), so nothing to sync here.
  return data;
}

export async function deleteFoodPhoto(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: entry, error: fetchError } = await supabase
    .from('food_photo_entries')
    .select('storage_path')
    .eq('id', id)
    .single();
  if (fetchError) raise(fetchError);

  const { error: removeError } = await supabase.storage.from('food-photos').remove([entry.storage_path]);
  if (removeError) raise(removeError);

  const { error } = await supabase.from('food_photo_entries').delete().eq('id', id);
  if (error) raise(error);
  // (No totals sync: the photo diary doesn't write calories or macros to the day.)
}

// Same reasoning as syncFoodDiaryToLog (lib/data/foodDiary.ts): keeps daily_logs the single
// source Home/Weekly-Log-totals/Insights all read, so a photo-diary client's estimated (or
// manually corrected) macros show up everywhere the food-diary client's do. A client is only
// ever in one nutrition_tracking_mode at a time, so this and syncFoodDiaryToLog never both
// write the same daily_logs row in practice. Exported so the re-estimate API route can
// re-sync after updating an entry's estimate outside of uploadFoodPhoto/updateFoodPhotoMacros.
export async function syncFoodPhotosToLog(dailyLogId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_photo_entries')
    .select('estimated_protein, estimated_carbs, estimated_fat')
    .eq('daily_log_id', dailyLogId);
  if (error) raise(error);

  const totals = (data ?? []).reduce(
    (acc, entry) => {
      acc.protein += entry.estimated_protein ?? 0;
      acc.carbs += entry.estimated_carbs ?? 0;
      acc.fat += entry.estimated_fat ?? 0;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0 }
  );

  const { error: updateError } = await supabase
    .from('daily_logs')
    .update({
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
    })
    .eq('id', dailyLogId);
  if (updateError) raise(updateError);
}
