'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActivityRow, FoodRow } from './types';

export async function searchFoods(query: string): Promise<FoodRow[]> {
  const supabase = await createClient();
  let request = supabase.from('foods').select('*').order('name').limit(25);
  if (query.trim()) {
    request = request.ilike('name', `%${query.trim()}%`);
  }
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

export async function getFoodByBarcode(barcode: string): Promise<FoodRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActivities(): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('activities').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}
