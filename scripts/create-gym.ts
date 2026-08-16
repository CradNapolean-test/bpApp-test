import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '../lib/supabase/admin';

// One-off: there will only ever be a couple of these, created by hand rather than through an
// in-app "create a new gym" flow (see scripts/create-coach.ts's --gym/--admin flags for
// attaching the first coach to whatever gym id this prints).
function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    })
  );
  if (!args.name) {
    console.error('Usage: npm run create-gym -- --name="Gym Name"');
    process.exit(1);
  }
  return { name: args.name as string };
}

async function main() {
  const { name } = parseArgs();
  const supabase = createAdminClient();

  const { data, error } = await supabase.from('gyms').insert({ name }).select('id').single();
  if (error) throw error;

  console.log('Gym created:');
  console.log(`  name: ${name}`);
  console.log(`  id:   ${data.id}`);
  console.log('Create its first coach with:');
  console.log(`  npm run create-coach -- --email=coach@example.com --gym=${data.id} --admin`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
