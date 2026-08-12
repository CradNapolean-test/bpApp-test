'use server';

import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { ThemePreference } from '@/app/_components/theme';

export async function setThemePreference(preference: ThemePreference): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_theme_preference', { p_preference: preference });
  return error ? fail(error, 'Could not save the theme preference') : ok();
}
