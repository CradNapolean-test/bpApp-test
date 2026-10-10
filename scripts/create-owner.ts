import { config } from 'dotenv';
config({ path: '.env.local' });

import { randomBytes } from 'node:crypto';
import { createAdminClient } from '../lib/supabase/admin';

// One-off: creates the business owner's login and puts every gym that has no organisation yet into one
// organisation they own. Needs migrations 0102 and 0103.
//   npm run create-owner -- --email=owner@example.com [--org="Ballistic Performance"] [--password=...]
// Run again with another --email to add a second owner to the same organisation (--org must match).
function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    })
  );
  if (!args.email) {
    console.error('Usage: npm run create-owner -- --email=owner@example.com [--org="Organisation name"] [--password=...]');
    process.exit(1);
  }
  return {
    email: args.email as string,
    org: (args.org as string) || 'Ballistic Performance',
    password: (args.password as string) || randomBytes(9).toString('base64url'),
  };
}

async function main() {
  const { email, org, password } = parseArgs();
  const supabase = createAdminClient();

  const { data: existingOrg } = await supabase.from('organisations').select('id').eq('name', org).limit(1).maybeSingle();
  let orgId = existingOrg?.id as string | undefined;
  if (!orgId) {
    const { data, error } = await supabase.from('organisations').insert({ name: org }).select('id').single();
    if (error) throw error;
    orgId = data.id as string;
  }

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError) throw userError;

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userData.user.id, role: 'owner', email, organisation_id: orgId });
  if (profileError) throw profileError;

  const { data: gyms, error: gymError } = await supabase.from('gyms').update({ organisation_id: orgId }).is('organisation_id', null).select('name');
  if (gymError) throw gymError;

  console.log('Owner account created:');
  console.log(`  email:        ${email}`);
  console.log(`  password:     ${password}`);
  console.log(`  organisation: ${org}`);
  console.log(`  gyms added:   ${(gyms ?? []).map((g) => g.name).join(', ') || 'none (all gyms already belong to an organisation)'}`);
  console.log('Log in at /login and change the password afterward if it was auto-generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
