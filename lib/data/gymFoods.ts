'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { FoodRow } from './types';

// The gym's own food list (source 'seed': the foods from the gym's spreadsheet), A-Z, for Library > Foods (LB23: the tab opened on scanned
// products, though setting the servings on the gym's foods is the main job there). A page at a time, with how many match. Reading foods is
// open to every signed-in user; changing servings is checked where it is saved.
export async function listGymFoods(query: string, limit: number): Promise<{ foods: FoodRow[]; total: number }> {
  const supabase = await createClient();
  const q = query.trim().replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  // At most 1,000: the most the database gives in one request (the gym's list is 484 foods).
  const size = Math.min(Math.max(1, Math.floor(limit) || 60), 1000);
  let request = supabase.from('foods').select('*', { count: 'exact' }).eq('source', 'seed').order('name').order('id').range(0, size - 1);
  if (q) request = request.ilike('name', `%${q}%`);
  const { data, error, count } = await request;
  if (error) raise(error);
  return { foods: (data ?? []) as FoodRow[], total: count ?? (data ?? []).length };
}
