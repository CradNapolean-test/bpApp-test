import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback } from 'react';

import type { ManualMacroEntryRow } from '@ballistic/shared/data/types';
import type { ManualFigures } from '@ballistic/shared/utils/manualMacros';

import { manualKey } from '@/lib/queryKeys';
import { WRITE_MANUAL_ADD, WRITE_MANUAL_REMOVE, type ManualAddVars, type ManualRemoveVars } from '@/lib/queuedWrites';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useQueuedWrite } from '@/lib/writeQueue';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

export type ManualData = { dailyLogId: string | null; entries: ManualMacroEntryRow[] };

// The macro entries for one day: one request, like the food diary.
export function useManualMacros(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: manualKey(userId, date),
    enabled,
    queryFn: async (): Promise<ManualData> => {
      const { data, error } = await supabase.from('daily_logs').select('id, manual_macro_entries(*)').eq('client_id', userId).eq('log_date', date).maybeSingle();
      if (error) throw error;
      if (!data) return { dailyLogId: null, entries: [] };
      const row = data as unknown as { id: string; manual_macro_entries: ManualMacroEntryRow[] };
      return { dailyLogId: row.id, entries: row.manual_macro_entries ?? [] };
    },
  });
}

const emptyDay: ManualData = { dailyLogId: null, entries: [] };

function useManualCacheUpdate(date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useCallback(
    async (update: (old: ManualData) => ManualData) => {
      const key = manualKey(userId, date);
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<ManualData>(key, (old) => update(old ?? emptyDay));
    },
    [qc, userId, date],
  );
}

// Both work with no signal (writeQueue.ts): the entry shows at once, with an id made on the phone and the time it was added.
export function useAddManualEntry(date: string) {
  const userId = useUserId();
  const updateDay = useManualCacheUpdate(date);
  const toVars = useCallback(
    (input: { sectionId: string | null; entry: ManualFigures & { calories: number } }): ManualAddVars => ({
      userId,
      date,
      row: { id: randomUUID(), created_at: new Date().toISOString(), meal_section_id: input.sectionId, ...input.entry },
    }),
    [userId, date],
  );
  const apply = useCallback(
    (_input: unknown, vars: ManualAddVars) => updateDay((old) => ({ ...old, entries: [...old.entries, { ...vars.row, daily_log_id: old.dailyLogId ?? 'pending' }] })),
    [updateDay],
  );
  return useQueuedWrite({ key: WRITE_MANUAL_ADD, toVars, apply });
}

export function useRemoveManualEntry(date: string) {
  const userId = useUserId();
  const updateDay = useManualCacheUpdate(date);
  const toVars = useCallback((input: { id: string }): ManualRemoveVars => ({ userId, date, id: input.id }), [userId, date]);
  const apply = useCallback((input: { id: string }) => updateDay((old) => ({ ...old, entries: old.entries.filter((e) => e.id !== input.id) })), [updateDay]);
  return useQueuedWrite({ key: WRITE_MANUAL_REMOVE, toVars, apply });
}
