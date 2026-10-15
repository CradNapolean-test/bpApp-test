-- Credits, bookings and integrity, last step (fix brief 03, CM9): coaches can no longer write to credits_ledger directly.
--
-- *** APPLY THIS ONLY AFTER BRIEF 05 IS MERGED AND DEPLOYED. ***
-- Until then the web app's grantCredits, grantCreditPack and removeCredits (lib/data/classes.ts, lib/data/memberships.ts) still insert
-- into credits_ledger themselves; this file removes that ability, so they would all fail. Brief 05 switches them to grant_credits,
-- grant_credit_pack and remove_credits (migration 0133), which cap the amount and cannot overdraw. Check before applying:
--   * the deployed app no longer contains .from('credits_ledger').insert (search the code, and look at the Vercel deployment date);
--   * grant, pack and removal work in the app against the sandbox.
--
-- What it does: drops the policy "coach grants credits" (schema.sql: insert with check is_coach_of(client_id) and granted_by = auth.uid()),
-- and takes the table's write privileges away from the signed-in and logged-out roles, so a new policy added by mistake later cannot
-- reopen the hole. The ledger stays append-only: every write is made by a security-definer function (bookings, refunds, grants,
-- removals, the weekly reset, expiry) or the service role, none of which this affects. Reading is unchanged.
--
-- PRE-FLIGHT (read-only; is anything still writing directly? These are the policies and privileges that exist today):
--   select polname, polcmd from pg_policy where polrelid = 'public.credits_ledger'::regclass;
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'credits_ledger' and grantee in ('anon', 'authenticated') order by 1, 2;

drop policy if exists "coach grants credits" on public.credits_ledger;

revoke insert, update, delete on public.credits_ledger from anon, authenticated;
