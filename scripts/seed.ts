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

async function main() {
  const supabase = createAdminClient();

  const foods: FoodSeed[] = JSON.parse(
    await readFile(path.join(process.cwd(), 'data/foods.json'), 'utf-8')
  );
  const activities: ActivitySeed[] = JSON.parse(
    await readFile(path.join(process.cwd(), 'data/activities.json'), 'utf-8')
  );

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
