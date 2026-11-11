import { createAdminClient } from '@/lib/supabase/admin';

// When each coach last signed in, for the owner's Team tab (BO18), so a login nobody uses stands out. auth.users cannot be read through
// the API, so this uses the service role. Server only: call it from a server page that has already checked the caller is the owner and
// the gym is one of theirs (app/owner/gyms/[gymId]/page.tsx), with coach ids from that gym's own list. Never import it from a component
// or export it from a 'use server' file, where a browser could call it.
//
// Answers id -> the time of the last sign-in, or null for a login that has never signed in. An id whose lookup failed is left out, and the
// whole answer is null when nothing could be read (for example no service key), so the screen shows nothing rather than a wrong "never".
export async function getLastSignIns(userIds: string[]): Promise<Record<string, string | null> | null> {
  if (userIds.length === 0) return {};
  try {
    const admin = createAdminClient();
    const answers = await Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id)));
    const out: Record<string, string | null> = {};
    answers.forEach((answer, i) => {
      if (!answer.error && answer.data.user) out[userIds[i]] = answer.data.user.last_sign_in_at ?? null;
    });
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
