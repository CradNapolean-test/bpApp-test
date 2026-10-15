import { randomBytes } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { isEmailTakenError, passwordSetLink, type AccountSteps } from '@/lib/accountCreation';

// Server-only glue between the pure rules in lib/accountCreation.ts and the Auth admin API (CM2). Used by the routes that make coach and
// member logins; never import it from a component.

type Admin = ReturnType<typeof createAdminClient>;

// The address the app is served from, for links given to people. Built from the request, so a preview deployment links to itself.
export function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

// Steps for createAccountWithRollback: the login gets a long random password that is never shown or kept, so it cannot be used until the
// person sets their own through the link. `finish` writes the rows that make the login a member or a coach.
export function authSteps(admin: Admin, finish: (id: string) => Promise<{ error: string } | null>): AccountSteps {
  return {
    async createLogin(email) {
      const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(24).toString('base64url'), email_confirm: true });
      if (error || !data.user) {
        if (isEmailTakenError(error)) return { error: error?.message ?? 'taken', exists: true };
        return { error: 'We could not create that login. Please try again.' };
      }
      return { id: data.user.id };
    },
    finish,
    async deleteLogin(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
    },
  };
}

// A one-time link for the person to choose their own password. Nothing is emailed here; the caller shows it to be copied (and may email it).
export async function makePasswordSetLink(admin: Admin, email: string, origin: string): Promise<{ link: string } | { error: string }> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  const token = data?.properties?.hashed_token;
  if (error || !token) return { error: 'We could not make the sign-in link. Please try again.' };
  return { link: passwordSetLink(origin, token) };
}
