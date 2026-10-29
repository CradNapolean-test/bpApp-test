import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BodyScanRow, ClientProfileRow, MeasurementLogRow, ProgressPhotoRow } from '@ballistic/shared/data/types';
import { newLocalId } from '@ballistic/shared/utils/chat';
import {
  bodyFatProfilePatch,
  progressPhotoPath,
  startsToSet,
  validateBodyScan,
  type BodyScanInput,
  type MeasurementKey,
} from '@ballistic/shared/utils/progress';

import { removeFiles, shrinkPhoto, uploadFile, type PickedPhoto } from '@/lib/media';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

const PHOTO_COLUMNS = 'id, client_id, photo_date, storage_path, created_at';

// ---- progress photos ----

// Every photo's row (a few bytes each). The pictures themselves are only fetched for the tiles on screen.
export function usePhotos() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['progress-photos', userId],
    queryFn: async (): Promise<ProgressPhotoRow[]> => {
      const { data, error } = await supabase
        .from('progress_photos')
        .select(PHOTO_COLUMNS)
        .eq('client_id', userId)
        .order('photo_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as ProgressPhotoRow[];
    },
  });
}

export function useUploadPhoto(todayIso: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (picked: PickedPhoto): Promise<ProgressPhotoRow> => {
      const shrunk = await shrinkPhoto(picked);
      const path = progressPhotoPath(userId, todayIso, newLocalId());
      await uploadFile('progress-photos', path, shrunk, 'image/jpeg');
      const { data, error } = await supabase
        .from('progress_photos')
        .insert({ client_id: userId, photo_date: todayIso, storage_path: path })
        .select(PHOTO_COLUMNS)
        .single();
      if (error) {
        await removeFiles('progress-photos', [path]).catch(() => {}); // do not leave the picture behind without a row
        throw error;
      }
      return data as ProgressPhotoRow;
    },
    onSuccess: (row) => {
      qc.setQueryData<ProgressPhotoRow[]>(['progress-photos', userId], (p) => (p ? [row, ...p.filter((x) => x.id !== row.id)] : p));
      qc.invalidateQueries({ queryKey: ['progress-photos', userId] });
    },
  });
}

// The row goes first, then the picture: if the second step fails the file is left unseen, never a row pointing at nothing.
export function useDeletePhoto() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['progress-photos', userId];
  return useMutation({
    mutationFn: async (photo: ProgressPhotoRow) => {
      const { data, error } = await supabase.from('progress_photos').delete().eq('id', photo.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('That photo could not be deleted.');
      await removeFiles('progress-photos', [photo.storage_path]).catch(() => {});
    },
    onMutate: async (photo) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<ProgressPhotoRow[]>(key);
      qc.setQueryData<ProgressPhotoRow[]>(key, (p) => p?.filter((x) => x.id !== photo.id));
      return { before };
    },
    onError: (_e, _photo, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---- measurements ----

// Newest first. Two years of weekly logs is about a hundred rows.
export function useMeasurements() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['measurement-logs', userId],
    queryFn: async (): Promise<MeasurementLogRow[]> => {
      const { data, error } = await supabase
        .from('measurement_logs')
        .select('*')
        .eq('client_id', userId)
        .order('log_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MeasurementLogRow[];
    },
  });
}

// One row per day (logging twice in a day updates it), then the first figure for each body part becomes the member's
// Start on their profile if there is none yet. Same two steps as the web.
export function useSaveMeasurements(todayIso: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields: Partial<Record<MeasurementKey, number>>) => {
      const { error } = await supabase
        .from('measurement_logs')
        .upsert({ client_id: userId, log_date: todayIso, ...fields }, { onConflict: 'client_id,log_date' });
      if (error) throw error;
      // Only the start figures of what was just logged are needed, never the whole row (it holds the coach's private notes).
      const startColumns = Object.keys(fields).map((k) => `meas_${k}_start`).join(', ');
      const { data: profile } = startColumns
        ? await supabase.from('client_profiles').select(startColumns).eq('client_id', userId).maybeSingle()
        : { data: null };
      const starts = startsToSet(profile as Partial<ClientProfileRow> | null, fields);
      if (Object.keys(starts).length > 0) await supabase.from('client_profiles').update(starts).eq('client_id', userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['measurement-logs', userId] });
      qc.invalidateQueries({ queryKey: ['client-profile', userId] });
    },
  });
}

// ---- body scans ----

export function useBodyScans() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['body-scans', userId],
    queryFn: async (): Promise<BodyScanRow[]> => {
      const { data, error } = await supabase
        .from('body_scans')
        .select('*')
        .eq('client_id', userId)
        .order('scan_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        // A database without the scans table (migration 0084 not applied) just reads as "none yet".
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data ?? []) as BodyScanRow[];
    },
  });
}

export function useAddBodyScan(todayIso: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, printout }: { input: BodyScanInput; printout: PickedPhoto | null }) => {
      const problem = validateBodyScan(input, !!printout, todayIso);
      if (problem) throw new Error(problem);

      let printoutPath: string | null = null;
      if (printout) {
        printoutPath = `${userId}/${newLocalId()}.jpg`;
        await uploadFile('inbody-scans', printoutPath, await shrinkPhoto(printout), 'image/jpeg');
      }
      const { error } = await supabase.from('body_scans').insert({
        client_id: userId,
        scan_date: input.scanDate,
        weight_kg: input.weightKg,
        skeletal_muscle_kg: input.skeletalMuscleKg,
        body_fat_pct: input.bodyFatPct,
        body_fat_kg: input.bodyFatKg,
        visceral_fat_level: input.visceralFatLevel,
        bmr_kcal: input.bmrKcal,
        inbody_score: input.inbodyScore,
        notes: input.notes.trim() || null,
        printout_path: printoutPath,
      });
      if (error) {
        if (printoutPath) await removeFiles('inbody-scans', [printoutPath]).catch(() => {});
        throw error;
      }

      // The newest scan with a measured body fat replaces an estimated one on the profile, so targets use the real number.
      if (input.bodyFatPct != null) {
        const { data: newer } = await supabase
          .from('body_scans')
          .select('id')
          .eq('client_id', userId)
          .not('body_fat_pct', 'is', null)
          .gt('scan_date', input.scanDate)
          .limit(1);
        const { data: profile } = await supabase
          .from('client_profiles')
          .select('body_fat_pct, body_fat_estimated, review_reasons')
          .eq('client_id', userId)
          .maybeSingle();
        const patch = bodyFatProfilePatch(profile, input.bodyFatPct, !!newer?.length);
        if (patch) await supabase.from('client_profiles').update(patch).eq('client_id', userId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['body-scans', userId] });
      qc.invalidateQueries({ queryKey: ['client-profile', userId] });
    },
  });
}

export function useDeleteScan() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['body-scans', userId];
  return useMutation({
    mutationFn: async (scan: BodyScanRow) => {
      const { data, error } = await supabase.from('body_scans').delete().eq('id', scan.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('That scan could not be deleted.');
      if (scan.printout_path) await removeFiles('inbody-scans', [scan.printout_path]).catch(() => {});
    },
    onMutate: async (scan) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<BodyScanRow[]>(key);
      qc.setQueryData<BodyScanRow[]>(key, (p) => p?.filter((x) => x.id !== scan.id));
      return { before };
    },
    onError: (_e, _scan, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
