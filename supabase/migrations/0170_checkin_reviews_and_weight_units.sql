-- Check-ins and units (live review decisions of 11 Nov 2026, build batch 8).
--   1. D7 (MX10, MS18, CW14): the member sees "Reviewed by <coach's first name> ✓" on a week and a form their coach has reviewed.
--
-- APPLY THIS BEFORE THE CODE DEPLOYS. The new screens read my_checkin_reviews() (without it they show no "Reviewed" line, nothing breaks).
--
-- 1. coach_reviews (migration 0087, kinds added in 0122 and 0166) holds the coach's "Reviewed" marks behind the dashboard's To do: a week
--   (ref = its Monday), a day of meal photos, a form (ref = the assignment id), the challenge check-ins and unanswered reminders.
-- Before: the member's screens never read it, so nothing told the member their coach had looked. The table's read rule (0087,
--   owns_client(client_id) OR is_same_gym_as_client(client_id)) did let a member read every one of their own rows, all kinds, with the
--   coach's id but not their name. "Download my data" already leaves the table out as coach-only (lib/dataExport.ts).
-- After:
--   New: my_checkin_reviews(), for the signed-in member only. It returns which of THEIR weeks and forms were reviewed (kind 'week' or
--     'form', the ref, when) and the reviewing coach's first name (the first word of profiles.display_name, empty when not set). Nothing
--     else from coach_reviews, and nobody else's rows. Security definer, so the member never needs to read coach_reviews or profiles.
--   Changed: the table's read rule becomes is_coach_of(client_id) OR is_same_gym_as_client(client_id): the member themself is the only
--     reader dropped (their own coach and the coaches at the gym read exactly what they read before). Nothing in the app reads the table
--     with a member's sign-in.
--
-- Guard: before changing anything, the migration checks the read rule is the one from 0087 (or already this file's), comparing it with
-- "public.", brackets and spaces left out, that it is the table's only read rule, and that my_checkin_reviews() is not there yet or has
-- this file's body (spaces and line breaks squeezed out). If not, nothing is changed and it stops with "... is not the one from ...".
-- Then send the PRE-FLIGHT's results to the developer instead. Safe to run twice.
--
-- PRE-FLIGHT (read-only):
--   select polname, polcmd, pg_get_expr(polqual, polrelid) as using_rule
--   from pg_policy where polrelid = 'public.coach_reviews'::regclass order by 1;
-- Expected before: "coach adds coach_reviews" (a, no using rule), "coach removes coach_reviews" (d, is_coach_of(client_id)),
-- "read coach_reviews" (r, (owns_client(client_id) OR is_same_gym_as_client(client_id))).
--
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'my_checkin_reviews';
-- Expected before: no rows.
--
--   select kind, count(*) from public.coach_reviews group by 1 order by 1;   -- members will see the 'week' and 'form' rows (counts only)
--
-- AFTER (read-only):
--   The first PRE-FLIGHT query: "read coach_reviews" is now (is_coach_of(client_id) OR is_same_gym_as_client(client_id)).
--   The second: my_checkin_reviews with body_md5 071c09ca84f9348b8629d6315360ac64.
--   As one member, inside a transaction that is rolled back (put a member's id in; nothing is written):
--     begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims', json_build_object('sub', '<member id>', 'role', 'authenticated')::text, true);
--     select count(*) from public.coach_reviews;          -- 0: the member no longer reads the table
--     select * from public.my_checkin_reviews();          -- that member's reviewed weeks and forms, with the coach's first name
--     rollback;
--
-- To undo 1: drop function public.my_checkin_reviews(); and put back 0087's read rule:
--   drop policy if exists "read coach_reviews" on public.coach_reviews;
--   create policy "read coach_reviews" on public.coach_reviews for select
--     using (public.owns_client(client_id) or public.is_same_gym_as_client(client_id));

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------------------------------------------------------------------
do $guard$
declare
  v_rule text;
  v_read_rules int;
  v_body text;
begin
  select regexp_replace(replace(lower(pg_get_expr(p.polqual, p.polrelid)), 'public.', ''), '[\s()]', '', 'g')
    into v_rule
  from pg_policy p
  where p.polrelid = 'public.coach_reviews'::regclass and p.polname = 'read coach_reviews';
  if v_rule is null
     or v_rule not in ('owns_clientclient_idoris_same_gym_as_clientclient_id', 'is_coach_ofclient_idoris_same_gym_as_clientclient_id') then
    raise exception 'The "read coach_reviews" rule is not the one from migration 0087 (or this file''s). Nothing was changed.';
  end if;

  select count(*) into v_read_rules
  from pg_policy p
  where p.polrelid = 'public.coach_reviews'::regclass and p.polcmd in ('r', '*');
  if v_read_rules <> 1 then
    raise exception 'coach_reviews has % read rules, expected only "read coach_reviews" (migration 0087). Nothing was changed.', v_read_rules;
  end if;

  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')))
    into v_body
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'my_checkin_reviews';
  if v_body is not null and v_body <> '071c09ca84f9348b8629d6315360ac64' then
    raise exception 'my_checkin_reviews() is already there and is not the one from migration 0170. Nothing was changed.';
  end if;
end;
$guard$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 1. D7: the member's own reviewed weeks and forms
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.my_checkin_reviews()
returns table (kind text, ref text, reviewed_at timestamptz, reviewer_first_name text)
language sql
security definer
set search_path = public
stable
as $$
  select r.kind, r.ref, r.reviewed_at,
         nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), '') as reviewer_first_name
  from coach_reviews r
  left join profiles p on p.id = r.reviewed_by
  where r.client_id = auth.uid()
    and r.kind in ('week', 'form')
  order by r.reviewed_at desc
  limit 500;
$$;

revoke execute on function public.my_checkin_reviews() from public, anon;
grant execute on function public.my_checkin_reviews() to authenticated;

drop policy if exists "read coach_reviews" on public.coach_reviews;
create policy "read coach_reviews"
  on public.coach_reviews for select
  using (public.is_coach_of(client_id) or public.is_same_gym_as_client(client_id));
