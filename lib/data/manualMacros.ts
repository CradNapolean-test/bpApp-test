'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { getDailyLog, getOrCreateDailyLog } from './dailyLogs';
import { dayCalories } from '@/lib/calculations';
import type { ManualMacroEntryRow } from './types';

type MacroFields = { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

// Calories are always worked out from protein/carbs/fat (like everywhere else in the app), so a
// typed number can never disagree with the macros. Only an entry with no macros at all keeps
// whatever calories it was given.
function withDerivedCalories(f: MacroFields): MacroFields {
  if (f.protein == null && f.carbs == null && f.fat == null) return f;
  return { ...f, calories: Math.round(dayCalories(f.protein ?? 0, f.carbs ?? 0, f.fat ?? 0)) };
}

// Same date-nav resolver shape as getFoodDiaryForDate (lib/data/foodDiary.ts): create:true
// (client) backfills a blank daily_logs row, create:false (coach) never does.
export async function getManualMacrosForDate(
  clientId: string,
  date: string,
  create: boolean
): Promise<{ dailyLogId: string | null; entries: ManualMacroEntryRow[] }> {
  const dailyLog = create ? await getOrCreateDailyLog(clientId, date) : await getDailyLog(clientId, date);
  if (!dailyLog) return { dailyLogId: null, entries: [] };
  const entries = await getManualMacroEntries(dailyLog.id);
  return { dailyLogId: dailyLog.id, entries };
}

export async function getManualMacroEntries(dailyLogId: string): Promise<ManualMacroEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('manual_macro_entries')
    .select('*')
    .eq('daily_log_id', dailyLogId);
  // Called unconditionally from dashboardBundle.ts on every dashboard load (for clients not
  // even in manual_import mode), so it must not take down the whole dashboard if migration
  // 0038 hasn't been run yet -- degrade to "no entries" instead of throwing, same pattern as
  // getFoodPhotos.
  if (error) {
    if (error.message?.includes('manual_macro_entries')) return [];
    raise(error);
  }
  return data ?? [];
}

export async function addManualMacroEntry(
  dailyLogId: string,
  mealSectionId: string | null,
  rawFields: MacroFields
): Promise<void> {
  const fields = withDerivedCalories(rawFields);
  const supabase = await createClient();
  const { error } = await supabase.from('manual_macro_entries').insert({
    daily_log_id: dailyLogId,
    meal_section_id: mealSectionId,
    calories: fields.calories,
    protein: fields.protein,
    carbs: fields.carbs,
    fat: fields.fat,
  });
  if (error) raise(error);
  await syncManualMacrosToLog(dailyLogId);
}

export async function updateManualMacroEntry(
  id: string,
  dailyLogId: string,
  rawFields: MacroFields
): Promise<void> {
  const fields = withDerivedCalories(rawFields);
  const supabase = await createClient();
  const { error } = await supabase
    .from('manual_macro_entries')
    .update({
      calories: fields.calories,
      protein: fields.protein,
      carbs: fields.carbs,
      fat: fields.fat,
    })
    .eq('id', id);
  if (error) raise(error);
  await syncManualMacrosToLog(dailyLogId);
}

export async function removeManualMacroEntry(id: string, dailyLogId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('manual_macro_entries').delete().eq('id', id);
  if (error) raise(error);
  await syncManualMacrosToLog(dailyLogId);
}

// Same pattern as syncFoodDiaryToLog/syncFoodPhotosToLog: daily_logs has no calories column
// (it's always derived downstream via dayCalories(protein,carbs,fat)), so only protein/carbs/fat
// get summed and written here -- each entry's own `calories` field is for the client's
// convenience display per row only.
export async function syncManualMacrosToLog(dailyLogId: string): Promise<void> {
  const entries = await getManualMacroEntries(dailyLogId);
  const totals = entries.reduce(
    (acc, entry) => {
      acc.protein += entry.protein ?? 0;
      acc.carbs += entry.carbs ?? 0;
      acc.fat += entry.fat ?? 0;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0 }
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from('daily_logs')
    .update({
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
    })
    .eq('id', dailyLogId);
  if (error) raise(error);
}
