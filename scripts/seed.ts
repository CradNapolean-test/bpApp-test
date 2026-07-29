import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAdminClient } from '../lib/supabase/admin';

interface FoodSeed {
  name: string;
  portion: string;
  protein: number;
  carbs: number;
  fat: number;
}

interface ActivitySeed {
  name: string;
  met: number;
}

// Clears existing rows before inserting, so this script is a repeatable reset rather than
// a one-time-only insert (running it twice used to just duplicate every row). Foods can be
// referenced by food_diary_entries/meal_plan_entries, so those get cleared too — acceptable
// for reference-data resets pre-launch, but this will orphan real client food logs once any
// exist. deleteAll() with `neq` on the primary key is the standard Supabase-JS pattern for
// "delete every row" since `.delete()` alone requires at least one filter.
async function deleteAll(supabase: ReturnType<typeof createAdminClient>, table: string) {
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

async function main() {
  const supabase = createAdminClient();

  const foods: FoodSeed[] = JSON.parse(
    await readFile(path.join(process.cwd(), 'data/foods.json'), 'utf-8')
  );
  const activities: ActivitySeed[] = JSON.parse(
    await readFile(path.join(process.cwd(), 'data/activities.json'), 'utf-8')
  );

  await deleteAll(supabase, 'food_diary_entries');
  await deleteAll(supabase, 'meal_plan_entries');
  await deleteAll(supabase, 'foods');
  await deleteAll(supabase, 'activities');

  const { error: foodsError, count: foodsCount } = await supabase
    .from('foods')
    .insert(foods, { count: 'exact' });
  if (foodsError) throw foodsError;
  console.log(`Seeded ${foodsCount ?? foods.length} foods`);

  const { error: activitiesError, count: activitiesCount } = await supabase
    .from('activities')
    .insert(activities, { count: 'exact' });
  if (activitiesError) throw activitiesError;
  console.log(`Seeded ${activitiesCount ?? activities.length} activities`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
