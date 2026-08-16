import { config } from 'dotenv';
config({ path: '.env.local' });

import { randomBytes } from 'node:crypto';
import { createAdminClient } from '../lib/supabase/admin';

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    })
  );
  if (!args.email) {
    console.error(
      'Usage: npm run create-coach -- --email=coach@example.com [--password=...] [--gym=<gym id>] [--admin]'
    );
    process.exit(1);
  }
  return {
    email: args.email as string,
    password: (args.password as string) || randomBytes(9).toString('base64url'),
    gymId: (args.gym as string) || null,
    isAdmin: 'admin' in args,
  };
}

async function main() {
  const { email, password, gymId, isAdmin } = parseArgs();
  const supabase = createAdminClient();

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userData.user.id, role: 'coach', email, gym_id: gymId, is_gym_admin: isAdmin });
  if (profileError) throw profileError;

  // Mirrors the profiles.gym_id/is_gym_admin set above into coach_gym_memberships (0056), the
  // real source of truth for gym membership -- profiles' columns are just this coach's cached
  // "currently active" selection.
  if (gymId) {
    const { error: membershipError } = await supabase
      .from('coach_gym_memberships')
      .insert({ coach_id: userData.user.id, gym_id: gymId, is_gym_admin: isAdmin });
    if (membershipError) throw membershipError;
  }

  console.log('Coach account created:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  if (gymId) console.log(`  gym:      ${gymId}${isAdmin ? ' (admin)' : ''}`);
  else console.log('  gym:      none -- pass --gym=<id> (see scripts/create-gym.ts) to attach one');
  console.log('Log in at /login and change the password afterward if it was auto-generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
