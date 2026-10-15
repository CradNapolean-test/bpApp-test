-- Security access rules, part 2 (fix brief 01): logged-out cost, shared devices, shared food data, library links, branding uploads.
--
--  R9   Row-level rules no longer apply to logged-out callers, so they get an instant empty answer instead of a slow failure.
--  M3   One browser push address can only belong to one person at a time (database half; the app switches over in brief 07).
--  M12  Coaches can correct or hide a wrong scanned food.
--  R23  Exercise library image and video links must be https:// addresses.
--  CM5  Only coaches can upload to the public coach-branding bucket, and only small images.
--
-- Apply 0127 first. Each section starts with a read-only PRE-FLIGHT query: run them BEFORE applying this file.
-- Written to be re-run safely.

-- =====================================================================================================================
-- R9. A logged-out request did expensive work, then failed.
-- Most access rules were written without a TO clause, which means they apply to the "public" role and so also to logged-out
-- callers. For a logged-out call the database still ran the rule's helper functions on every row before refusing (a
-- logged-out read of daily_logs timed out after about 3 seconds). Rules limited to "authenticated" do not apply to a logged-out
-- caller at all, so with RLS on and no rule that applies, the answer is an immediate empty result.
--
-- Nothing the app does while logged out reads these tables with the public key: /join/[token] and /api/join use the service
-- role, /login and /reset-password only call Auth, /auth/confirm only verifies a code, and the middleware only asks Auth who
-- is signed in. Every "using (true)" rule in the schema is already "to authenticated". The service role is unaffected (it
-- bypasses row-level security).
--
-- v_keep is the hard-coded exception list ('table.policy' names a rule that must stay open to logged-out callers). It is empty
-- on purpose: add a name here, with a comment saying why, if a logged-out screen ever needs to read a table directly.
--
-- Indexes: profiles(coach_id) and profiles(gym_id) already exist (0061), and daily_logs has unique (client_id, log_date), so
-- the columns the helper functions filter on are already indexed. No new index is added without an EXPLAIN from the sandbox.
--
-- PRE-FLIGHT (read-only; the rules this will move from "public" to "authenticated"):
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public' and roles = array['public']::name[] order by 1, 2;
-- AFTER (expect zero rows):
--   select tablename, policyname from pg_policies where schemaname = 'public' and roles = array['public']::name[];
-- =====================================================================================================================
do $$
declare
  p record;
  v_keep text[] := array[]::text[];
  v_moved integer := 0;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public' and roles = array['public']::name[]
  loop
    if (p.tablename || '.' || p.policyname) = any (v_keep) then
      continue;
    end if;
    execute format('alter policy %I on public.%I to authenticated', p.policyname, p.tablename);
    v_moved := v_moved + 1;
  end loop;
  raise notice 'R9: % access rules moved from public to authenticated', v_moved;
end $$;

-- The row-level-security helper functions (they take an id, or read the caller's own row) were still executable by logged-out
-- callers. With the rules above no longer applying to them, nothing logged-out needs them. Signed-in callers keep their grant.
-- This block is separate on purpose: if a logged-out flow is ever found to need one, re-grant it with
--   grant execute on function public.<name>(<args>) to anon;
revoke execute on function public.is_self(uuid) from public, anon;
revoke execute on function public.is_coach_of(uuid) from public, anon;
revoke execute on function public.owns_client(uuid) from public, anon;
revoke execute on function public.my_coach_id() from public, anon;
revoke execute on function public.my_gym_id() from public, anon;
revoke execute on function public.client_gym_id(uuid) from public, anon;
revoke execute on function public.is_same_gym_as_client(uuid) from public, anon;
revoke execute on function public.is_admin_of_gym(uuid) from public, anon;
revoke execute on function public.shares_gym_membership(uuid) from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.my_org_id() from public, anon;
revoke execute on function public.is_owner_of_gym(uuid) from public, anon;

-- =====================================================================================================================
-- M3 (database half). One browser push address could belong to two members.
-- push_subscriptions was unique on (client_id, endpoint), so after member A signed out of a shared phone and member B turned
-- push on, both rows existed and A's notifications (with message previews) reached whoever held the phone. Now:
--   * the endpoint itself is unique (existing duplicates are removed first, keeping the most recently used);
--   * register_web_push(endpoint, p256dh, auth) is the way to register: it never takes a member id, moves the endpoint to the
--     caller if someone else held it, refreshes it if the caller already held it, and keeps at most 5 browsers per person.
--     It mirrors register_push_device (0113). Coaches may call it too: 0060 always let any signed-in user subscribe.
-- The table's own "client manages own push_subscriptions" rule is left as it is for now, because the web app still writes
-- there directly until brief 07 (R18) switches it to this function. Until then, a member who turns push on in a browser that
-- still holds another member's subscription gets an error instead of the old silent sharing. Once the app uses the function,
-- the insert/update half of that rule can be dropped.
--
-- PRE-FLIGHT (read-only; endpoints held by more than one row. The rows other than the newest are deleted by this migration):
--   select endpoint, count(*) as holders from public.push_subscriptions group by 1 having count(*) > 1;
-- =====================================================================================================================
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz not null default now();

delete from public.push_subscriptions p
using (
  select id,
         row_number() over (partition by endpoint order by last_seen_at desc, created_at desc nulls last, id desc) as rn
  from public.push_subscriptions
) d
where p.id = d.id and d.rn > 1;

create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);

create or replace function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authorized';
  end if;

  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048 then
    raise exception 'That is not a valid push address';
  end if;
  if coalesce(p_p256dh, '') = '' or char_length(p_p256dh) > 256
     or coalesce(p_auth, '') = '' or char_length(p_auth) > 256 then
    raise exception 'That is not a valid push subscription';
  end if;

  -- A browser belongs to one person at a time: if it was someone else's, it is now the caller's.
  delete from push_subscriptions where endpoint = p_endpoint and client_id <> v_me;

  insert into push_subscriptions (client_id, endpoint, p256dh, auth, last_seen_at)
  values (v_me, p_endpoint, p_p256dh, p_auth, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_seen_at = now();

  -- At most 5 browsers per person: keep the ones used most recently.
  delete from push_subscriptions
  where client_id = v_me
    and id not in (
      select id from push_subscriptions
      where client_id = v_me
      order by last_seen_at desc, created_at desc nulls last, id desc
      limit 5
    );
end;
$$;

revoke execute on function public.register_web_push(text, text, text) from public, anon;
grant execute on function public.register_web_push(text, text, text) to authenticated;

-- =====================================================================================================================
-- M12. A wrong scanned food could never be corrected.
-- The first member to scan a barcode writes the shared foods row (0106). There was no update or delete rule, so a wrong entry
-- stayed wrong for everyone and could only be fixed in SQL. Coaches may now update or delete rows whose source is 'scan'
-- (never the seed, the UK government tables or the Open Food Facts import). The foods table is shared by every gym, so a
-- correction by one gym's coach reaches all gyms; that is the point of a shared barcode cache.
--
-- The hidden flag and the search that honours it already exist (0074: foods.hidden, search_foods skips hidden rows), so
-- nothing is added for them. A visible row must still satisfy the same limits as an insert (0106); a row being hidden is not
-- checked, so a bad legacy row can always be hidden without being repaired first.
--
-- Deleting a food that a member has already logged or put in a recipe is refused by the database (it is still referenced):
-- hide it instead. Note for the coach screen (brief 06): getFoodByBarcode reads the table directly and does not skip hidden
-- rows, and a hidden row still holds its unique barcode, so for a barcode product "correct the numbers" works better than "hide".
--
-- PRE-FLIGHT (read-only; scanned foods that would not pass the insert limits today and so could not be edited without being hidden):
--   select id, barcode, name, portion, protein, carbs, fat from public.foods
--   where source = 'scan' and not hidden
--     and not (portion = '1 gram' and protein between 0 and 1 and carbs between 0 and 1 and fat between 0 and 1
--              and protein + carbs + fat <= 1.05 and char_length(name) between 1 and 200);
-- =====================================================================================================================
drop policy if exists "coaches correct scanned foods" on public.foods;
create policy "coaches correct scanned foods"
  on public.foods for update
  to authenticated
  using (source = 'scan' and public.my_gym_id() is not null)
  with check (
    source = 'scan'
    and public.my_gym_id() is not null
    and (
      hidden
      or (
        barcode is not null
        and barcode ~ '^[0-9]{6,14}$'
        and portion = '1 gram'
        and char_length(name) between 1 and 200
        and protein between 0 and 1
        and carbs between 0 and 1
        and fat between 0 and 1
        and coalesce(fibre, 0) between 0 and 1
        and protein + carbs + fat <= 1.05
      )
    )
  );

drop policy if exists "coaches delete scanned foods" on public.foods;
create policy "coaches delete scanned foods"
  on public.foods for delete
  to authenticated
  using (source = 'scan' and public.my_gym_id() is not null);

-- =====================================================================================================================
-- R23 (database half). Library links could point anywhere.
-- ExerciseEditor renders exercise_library.image_url as an <img> on every member's workout screen, so an address chosen by
-- whoever can edit the library made every member's phone contact it. Both links must now be https:// addresses (or empty).
-- Which hosts are allowed is decided in the app (brief 07). The constraints are added NOT VALID first (so they apply to every
-- new or changed row straight away) and validated against the existing rows only if none is bad. A not-yet-validated
-- constraint also stops edits to a bad row until its link is fixed or cleared.
--
-- PRE-FLIGHT (read-only; rows that break the rule. Fix or clear these, then the constraints validate; a blank link is stored as null):
--   select id, name, image_url, video_url from public.exercise_library
--   where (image_url is not null and image_url !~* '^https://') or (video_url is not null and video_url !~* '^https://');
-- Note for the library screen (brief 07): its video check accepts http:// links, which this rule now refuses.
-- =====================================================================================================================
alter table public.exercise_library drop constraint if exists exercise_library_image_url_https;
alter table public.exercise_library
  add constraint exercise_library_image_url_https check (image_url is null or image_url ~* '^https://') not valid;
alter table public.exercise_library drop constraint if exists exercise_library_video_url_https;
alter table public.exercise_library
  add constraint exercise_library_video_url_https check (video_url is null or video_url ~* '^https://') not valid;

do $$
begin
  if not exists (select 1 from public.exercise_library where image_url is not null and image_url !~* '^https://') then
    alter table public.exercise_library validate constraint exercise_library_image_url_https;
  else
    raise notice 'R23: some exercise_library.image_url values are not https:// links; constraint left NOT VALID until they are fixed';
  end if;
  if not exists (select 1 from public.exercise_library where video_url is not null and video_url !~* '^https://') then
    alter table public.exercise_library validate constraint exercise_library_video_url_https;
  else
    raise notice 'R23: some exercise_library.video_url values are not https:// links; constraint left NOT VALID until they are fixed';
  end if;
end $$;

-- =====================================================================================================================
-- CM5. Any logged-in user could upload to the public coach-branding bucket.
-- The three upload rules (0047) only checked that the first folder equals the caller's id, not that the caller is a coach, and
-- the bucket had no size or type limit (0108, 0109 and 0114 skipped it). Now: coaches only, 1 MB, PNG / JPEG / WebP only
-- (no SVG: an SVG served from a public address can carry script). Limits apply to new uploads; existing files are not touched.
-- App follow-up (brief 08): uploadCoachLogo builds the file name from the file's extension and never deletes the previous logo,
-- and should show a friendly message for a refused file.
--
-- PRE-FLIGHT (read-only; files already in the bucket that the new limits would not have allowed):
--   select name, metadata->>'mimetype' as mimetype, (metadata->>'size')::bigint as bytes from storage.objects
--   where bucket_id = 'coach-branding'
--     and (coalesce(metadata->>'mimetype', '') not in ('image/png', 'image/jpeg', 'image/webp')
--          or coalesce((metadata->>'size')::bigint, 0) > 1048576);
-- =====================================================================================================================
drop policy if exists "coach uploads own logo" on storage.objects;
create policy "coach uploads own logo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_gym_id() is not null
  );

drop policy if exists "coach replaces own logo" on storage.objects;
create policy "coach replaces own logo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_gym_id() is not null
  )
  with check (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_gym_id() is not null
  );

drop policy if exists "coach deletes own logo" on storage.objects;
create policy "coach deletes own logo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'coach-branding'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_gym_id() is not null
  );

update storage.buckets
set file_size_limit = 1048576,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'coach-branding';
