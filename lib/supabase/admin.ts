import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client — bypasses Row Level Security entirely. Import this ONLY from
// server-only contexts that need elevated privileges (creating auth users, seeding
// reference data): app/api/coach/create-client/route.ts and scripts/*.ts. Never import
// from a Client Component or anything that ships to the browser.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
