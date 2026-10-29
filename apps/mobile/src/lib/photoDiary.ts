import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FoodPhotoEntryRow } from '@ballistic/shared/data/types';
import { newLocalId } from '@ballistic/shared/utils/chat';
import { cleanPhotoDescription, validatePhotoDescription, canAddPhoto, foodPhotoPath, MAX_PHOTOS_PER_DAY, validateMealEntry } from '@ballistic/shared/utils/photoDiary';

import { removeFiles, shrinkPhoto, uploadFile, type PickedPhoto } from '@/lib/media';
import { photoDiaryKey } from '@/lib/queryKeys';
import { getOrCreateLogId } from '@/lib/queuedWrites';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

export type PhotoDiaryData = { dailyLogId: string | null; photos: FoodPhotoEntryRow[] };

// The meal photos of one day, newest first: one request for the day and its rows. The pictures themselves are fetched
// (as short-lived links) only for the cards on screen.
export function usePhotoDiary(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: photoDiaryKey(userId, date),
    enabled,
    queryFn: async (): Promise<PhotoDiaryData> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('id, food_photo_entries(*)')
        .eq('client_id', userId)
        .eq('log_date', date)
        .order('created_at', { referencedTable: 'food_photo_entries', ascending: false })
        .maybeSingle();
      if (error) throw error;
      if (!data) return { dailyLogId: null, photos: [] };
      const row = data as unknown as { id: string; food_photo_entries: FoodPhotoEntryRow[] };
      return { dailyLogId: row.id, photos: row.food_photo_entries ?? [] };
    },
  });
}

// Shrinks the photo, uploads it to the member's own folder of the private food-photos bucket, then adds the row. If the row
// is refused the picture is removed again, so nothing is left behind. Needs a connection (a picture is too big to keep waiting).
// The photo is optional: a meal can be logged with a description alone, but not with neither.
export function useAddMealPhoto(date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, description, currentCount }: { photo: PickedPhoto | null; description: string; currentCount: number }): Promise<FoodPhotoEntryRow> => {
      if (!canAddPhoto(currentCount)) throw new Error(`A day can hold ${MAX_PHOTOS_PER_DAY} photos.`);
      const problem = validateMealEntry(!!photo, description) ?? validatePhotoDescription(description);
      if (problem) throw new Error(problem);
      const dailyLogId = await getOrCreateLogId(userId, date);
      let path: string | null = null;
      if (photo) {
        const shrunk = await shrinkPhoto(photo);
        path = foodPhotoPath(userId, dailyLogId, newLocalId());
        await uploadFile('food-photos', path, shrunk, 'image/jpeg');
      }
      const { data, error } = await supabase
        .from('food_photo_entries')
        .insert({ daily_log_id: dailyLogId, storage_path: path, description: cleanPhotoDescription(description) })
        .select('*')
        .single();
      if (error) {
        if (path) await removeFiles('food-photos', [path]).catch(() => {});
        throw error;
      }
      return data as FoodPhotoEntryRow;
    },
    onSuccess: (row) => {
      qc.setQueryData<PhotoDiaryData>(photoDiaryKey(userId, date), (p) => ({ dailyLogId: row.daily_log_id, photos: [row, ...(p?.photos ?? []).filter((x) => x.id !== row.id)] }));
      qc.invalidateQueries({ queryKey: photoDiaryKey(userId, date) });
    },
  });
}

// The row goes first, then the picture: if the second step fails the file is left unseen, never a row pointing at nothing.
export function useDeleteMealPhoto(date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = photoDiaryKey(userId, date);
  return useMutation({
    mutationFn: async (photo: FoodPhotoEntryRow) => {
      const { data, error } = await supabase.from('food_photo_entries').delete().eq('id', photo.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('That photo could not be deleted.');
      if (photo.storage_path) await removeFiles('food-photos', [photo.storage_path]).catch(() => {});
    },
    onMutate: async (photo) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<PhotoDiaryData>(key);
      qc.setQueryData<PhotoDiaryData>(key, (p) => (p ? { ...p, photos: p.photos.filter((x) => x.id !== photo.id) } : p));
      return { before };
    },
    onError: (_e, _photo, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
