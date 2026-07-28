import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client — bypasses Row Level Security entirely. Import this ONLY from
// server-only contexts that need elevated privileges (creating auth users, seeding
// reference data): app/api/coach/create-client/route.ts and scripts/*.ts. Never import
// from a Client Component or anything that ships to the browser.
//
// Deliberately no `server-only` import guard here: that package throws unconditionally
// under plain Node (it relies on Next.js's bundler-level module resolution to swap in a
// no-op for server graphs), which breaks scripts/*.ts running via tsx outside of Next's
// build. Nothing in this codebase imports this file from a 'use client' module.
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
