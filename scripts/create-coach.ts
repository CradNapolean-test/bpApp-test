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
    console.error('Usage: npm run create-coach -- --email=coach@example.com [--password=...]');
    process.exit(1);
  }
  return { email: args.email as string, password: (args.password as string) || randomBytes(9).toString('base64url') };
}

async function main() {
  const { email, password } = parseArgs();
  const supabase = createAdminClient();

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userData.user.id, role: 'coach', email });
  if (profileError) throw profileError;

  console.log('Coach account created:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('Log in at /login and change the password afterward if it was auto-generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
