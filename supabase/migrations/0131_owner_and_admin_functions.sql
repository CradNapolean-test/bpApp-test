-- Gym scoping, part 3 (fix brief 02): owner and gym-admin functions.
--
--  CH1  Gym admins and owners can move members between coaches and remove a coach from a gym. Coach journal entries (goals,
--       injuries, notes) are readable by every coach at the member's gym.
--  R37  The owner works through functions only (D2): no direct read of members' health data, a roster without health fields,
--       and owner versions of the admin actions.
--
-- Each section starts with a read-only PRE-FLIGHT query. Apply after 0130. Written to be re-run safely.
--
-- Functions added (for briefs 05 and 08), all signed-in only; the ones starting with an underscore are internal and callable by
-- other functions only:
--   reassign_clients(p_gym, p_from, p_to) -> integer                  gym admin of p_gym, or the owner
--   remove_coach_from_gym(p_gym, p_coach) -> jsonb                    gym admin of p_gym, or the owner
--   owner_gym_roster(p_gym, p_filter, p_search, p_limit, p_offset) -> jsonb
--   owner_set_gym_admin(p_gym, p_coach, p_is_admin)
--   owner_add_coach_to_gym(p_gym, p_coach, p_is_admin)
--   owner_remove_coach_from_gym(p_gym, p_coach) -> jsonb
--   owner_reassign_clients(p_gym, p_from, p_to) -> integer
--   owner_rename_gym(p_gym, p_name)
--   owner_set_gym_booking_settings(p_gym, p_timezone, p_blackout_start, p_blackout_end)
-- and the column profiles.deactivated_at. add_coach_to_gym(p_coach_id, p_is_admin) keeps its signature.

-- =====================================================================================================================
-- CH1 (database half). No way to move members or remove a coach.
--
-- reassign_clients(gym, from, to): moves every MEMBER of the "from" coach who belongs to that gym to the "to" coach. Both must
-- work at the gym. A coach's members in their OTHER gyms are not touched. Chat, check-ins, programmes and the rest follow
-- profiles.coach_id, so the new coach gains them and the old coach loses them at once. Per table that stores a coach:
--   * moves with the member: profiles.coach_id, and red_flag_entries.coach_id for flags not yet followed up (contacted = 'no');
--   * stays with the person who wrote it: client_journal_entries (the author), nutrition_feedback, past red flag entries with
--     a recorded follow-up, chat messages;
--   * belongs to the gym or the coach, not the member, so it stays: classes, membership_packages, form_templates,
--     program_templates, education content and courses, client_groups (and who is in them), scheduled_communications, credit
--     packs, message templates, onboarding links, the coach email log.
-- No notification is sent to the members; whether to tell them is for the screen (brief 08).
--
-- remove_coach_from_gym(gym, coach): refused while the coach still has members at that gym, and refused for the last admin.
-- Otherwise the membership is deleted. If the gym was their active gym they are switched to another gym they work at; if they
-- work at no gym any more, profiles.gym_id is cleared and profiles.deactivated_at is set. The answer says so
-- ({"removed": true, "deactivated": true|false}) so the app can then disable the login (needs the admin API: brief 08).
-- Scheduled broadcasts the coach created at that gym are NOT cancelled here; see the hand-off note in the brief 02 status.
--
-- add_coach_to_gym is tightened: the account must be a coach, an existing membership is changed through the same last-admin
-- check (it used to be overwritten silently), and a coach with no active gym gets this one.
--
-- Journal (D3, recommended default): every coach who works at the member's gym can READ the member's journal entries; only the
-- author can edit or delete one; any assigned coach can add one. Before, reads followed the coach's ACTIVE gym and the assigned
-- coach could edit anyone's entry. The app (brief 05) should hide the edit and delete buttons on other coaches' entries.
--
-- PRE-FLIGHT (read-only):
--   -- coaches and how many members each has per gym (what a reassign would move):
--   select g.name as gym, coalesce(c.display_name, c.email) as coach, count(m.id) as members
--   from public.coach_gym_memberships cgm
--   join public.gyms g on g.id = cgm.gym_id
--   join public.profiles c on c.id = cgm.coach_id
--   left join public.profiles m on m.coach_id = c.id and m.role = 'client' and m.gym_id = g.id
--   group by 1, 2 order by 1, 3 desc;
--   -- members whose coach does not work at the member's gym (cannot be fixed by a reassign until the coach is added):
--   select m.id, m.gym_id, m.coach_id from public.profiles m
--   where m.role = 'client' and m.coach_id is not null
--     and not exists (select 1 from public.coach_gym_memberships c where c.coach_id = m.coach_id and c.gym_id = m.gym_id);
-- =====================================================================================================================
alter table public.profiles add column if not exists deactivated_at timestamptz;

create or replace function public._add_coach_to_gym(p_gym uuid, p_coach uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active uuid;
begin
  if p_gym is null or p_coach is null then
    raise exception 'Choose a coach';
  end if;
  if not exists (select 1 from gyms where id = p_gym) then
    raise exception 'Gym not found';
  end if;
  if not exists (select 1 from profiles where id = p_coach and role = 'coach') then
    raise exception 'That account is not a coach.';
  end if;

  if exists (select 1 from coach_gym_memberships where coach_id = p_coach and gym_id = p_gym) then
    -- Already works here: change the admin flag through the last-admin check.
    perform public._set_gym_admin(p_gym, p_coach, coalesce(p_is_admin, false));
  else
    insert into coach_gym_memberships (coach_id, gym_id, is_gym_admin)
    values (p_coach, p_gym, coalesce(p_is_admin, false));
  end if;

  -- A coach with no active gym gets this one (for example someone who was removed from every gym earlier).
  select gym_id into v_active from profiles where id = p_coach;
  if v_active is null then
    update profiles set gym_id = p_gym, is_gym_admin = coalesce(p_is_admin, false) where id = p_coach;
  elsif v_active = p_gym then
    update profiles set is_gym_admin = coalesce(p_is_admin, false) where id = p_coach;
  end if;
end;
$$;

revoke execute on function public._add_coach_to_gym(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.add_coach_to_gym(p_coach_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_gym_id() is null
     or not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;
  perform public._add_coach_to_gym(public.my_gym_id(), p_coach_id, p_is_admin);
end;
$$;

create or replace function public._reassign_clients(p_gym uuid, p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_gym is null or p_from is null or p_to is null then
    raise exception 'Choose both coaches';
  end if;
  if p_from = p_to then
    raise exception 'Choose two different coaches';
  end if;
  if not exists (select 1 from coach_gym_memberships where coach_id = p_from and gym_id = p_gym)
     or not exists (select 1 from coach_gym_memberships where coach_id = p_to and gym_id = p_gym) then
    raise exception 'Both coaches must work at this gym.';
  end if;

  with moved as (
    update profiles
    set coach_id = p_to
    where role = 'client' and coach_id = p_from and gym_id = p_gym
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from moved;

  -- Flags nobody has followed up yet move with the member; ones with a recorded follow-up keep the coach who did it.
  update red_flag_entries
  set coach_id = p_to, updated_at = now()
  where gym_id = p_gym and client_id = any (v_ids) and coach_id = p_from and contacted = 'no';

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke execute on function public._reassign_clients(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.reassign_clients(p_gym uuid, p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not (coalesce(public.is_admin_of_gym(p_gym), false) or coalesce(public.is_owner_of_gym(p_gym), false)) then
    raise exception 'Not authorized';
  end if;
  return public._reassign_clients(p_gym, p_from, p_to);
end;
$$;

create or replace function public._remove_coach_from_gym(p_gym uuid, p_coach uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members integer;
  v_remaining integer;
  v_active uuid;
  v_next record;
begin
  if p_gym is null or p_coach is null then
    raise exception 'Choose a coach';
  end if;

  -- Serialise changes to one gym's team (same lock as the admin changes).
  perform 1 from gyms where id = p_gym for update;
  if not found then
    raise exception 'Gym not found';
  end if;

  if not exists (select 1 from coach_gym_memberships where coach_id = p_coach and gym_id = p_gym) then
    raise exception 'That coach does not work at this gym.';
  end if;

  select count(*) into v_members from profiles where role = 'client' and coach_id = p_coach and gym_id = p_gym;
  if v_members > 0 then
    raise exception 'This coach still has % member(s) at this gym. Move them to another coach first.', v_members;
  end if;

  if exists (select 1 from coach_gym_memberships where coach_id = p_coach and gym_id = p_gym and is_gym_admin)
     and not exists (select 1 from coach_gym_memberships where gym_id = p_gym and coach_id <> p_coach and is_gym_admin) then
    raise exception 'A gym needs at least one admin. Make someone else an admin first.';
  end if;

  delete from coach_gym_memberships where coach_id = p_coach and gym_id = p_gym;
  select count(*) into v_remaining from coach_gym_memberships where coach_id = p_coach;

  select gym_id into v_active from profiles where id = p_coach;
  if v_remaining > 0 then
    if v_active is not distinct from p_gym then
      select gym_id, is_gym_admin into v_next
      from coach_gym_memberships where coach_id = p_coach order by created_at limit 1;
      update profiles set gym_id = v_next.gym_id, is_gym_admin = v_next.is_gym_admin where id = p_coach;
    end if;
  else
    update profiles
    set gym_id = null, is_gym_admin = false, deactivated_at = coalesce(deactivated_at, now())
    where id = p_coach;
  end if;

  return jsonb_build_object('removed', true, 'deactivated', v_remaining = 0, 'remaining_gyms', v_remaining);
end;
$$;

revoke execute on function public._remove_coach_from_gym(uuid, uuid) from public, anon, authenticated;

create or replace function public.remove_coach_from_gym(p_gym uuid, p_coach uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not (coalesce(public.is_admin_of_gym(p_gym), false) or coalesce(public.is_owner_of_gym(p_gym), false)) then
    raise exception 'Not authorized';
  end if;
  return public._remove_coach_from_gym(p_gym, p_coach);
end;
$$;

revoke execute on function public.add_coach_to_gym(uuid, boolean) from public, anon;
revoke execute on function public.reassign_clients(uuid, uuid, uuid) from public, anon;
revoke execute on function public.remove_coach_from_gym(uuid, uuid) from public, anon;
grant execute on function public.add_coach_to_gym(uuid, boolean) to authenticated;
grant execute on function public.reassign_clients(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_coach_from_gym(uuid, uuid) to authenticated;

-- Journal entries: read by every coach at the member's gym (or the assigned coach); add by the assigned coach as themselves;
-- edit and delete by the author only (and only while still a coach of the member or at their gym).
drop policy if exists "coach manages own client_journal_entries" on public.client_journal_entries;
drop policy if exists "same-gym coach reads client_journal_entries" on public.client_journal_entries;
drop policy if exists "gym coaches read client_journal_entries" on public.client_journal_entries;
drop policy if exists "coach adds client_journal_entries" on public.client_journal_entries;
drop policy if exists "author edits client_journal_entries" on public.client_journal_entries;
drop policy if exists "author deletes client_journal_entries" on public.client_journal_entries;

create policy "gym coaches read client_journal_entries"
  on public.client_journal_entries for select
  to authenticated
  using (public.is_coach_of(client_id) or public.is_coach_in_gym(public.client_gym_id(client_id)));

create policy "coach adds client_journal_entries"
  on public.client_journal_entries for insert
  to authenticated
  with check (public.is_coach_of(client_id) and coach_id = auth.uid());

create policy "author edits client_journal_entries"
  on public.client_journal_entries for update
  to authenticated
  using (coach_id = auth.uid() and (public.is_coach_of(client_id) or public.is_coach_in_gym(public.client_gym_id(client_id))))
  with check (coach_id = auth.uid() and (public.is_coach_of(client_id) or public.is_coach_in_gym(public.client_gym_id(client_id))));

create policy "author deletes client_journal_entries"
  on public.client_journal_entries for delete
  to authenticated
  using (coach_id = auth.uid() and (public.is_coach_of(client_id) or public.is_coach_in_gym(public.client_gym_id(client_id))));

-- =====================================================================================================================
-- R37 (database half, DECISION D2 recommended default). The owner could read far more than any screen uses.
-- is_same_gym_as_client() (0103) also returned true for the owner of the member's gym, and every cross-coach read policy from
-- 0053 calls it, so an owner could read through the API any member's food diary, meal photos, forms, habits, programmes, chat
-- and the private coach notes. It is back to its coach-only meaning (0052). The owner keeps SELECT on profiles (no health
-- columns) and coach_gym_memberships, and works through the functions below, each of which checks is_owner_of_gym(p_gym):
--   owner_gym_roster         a roster with NO health fields; optional filter, search and paging
--   owner_set_gym_admin, owner_add_coach_to_gym, owner_remove_coach_from_gym, owner_reassign_clients, owner_rename_gym,
--   owner_set_gym_booking_settings   the same internals as the gym admin's own versions
-- The existing owner screens only call owner_gyms_overview, owner_gym_stats and owner_activity_report (checked: lib/data/owner.ts
-- and app/owner), so nothing on screen loses data. The sandbox check confirms an owner now reads 0 rows from the member tables.
--
-- owner_gym_roster(p_gym, p_filter, p_search, p_limit, p_offset) answers
--   {"gymId", "total", "limit", "offset", "filter", "members": [{clientId, name, email, coachId, coachName, plan, planEndsOn,
--    status, lastActive, onboarded, flagged, joinedOn}]}
-- p_filter (the same definitions as owner_gym_stats, so an Overview number and its list agree): on_plan, no_plan, ending_soon
-- (scheduled to end within 14 days), flagged (in the gym's latest red flag list), new_this_month, left_last_30. status is
-- 'on_plan', 'ending_soon' or 'no_plan'. p_limit is capped at 500.
--
-- PRE-FLIGHT (read-only; what an owner can read directly today, to compare with the sandbox check afterwards):
--   select polname, polrelid::regclass from pg_policy
--   where pg_get_expr(polqual, polrelid) ilike '%is_same_gym_as_client%' order by 2, 1;
-- =====================================================================================================================
create or replace function public.is_same_gym_as_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.my_gym_id() is not null and public.my_gym_id() = public.client_gym_id(target_client_id);
$$;

create or replace function public.owner_set_gym_admin(p_gym uuid, p_coach uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  perform public._set_gym_admin(p_gym, p_coach, p_is_admin);
end;
$$;

create or replace function public.owner_add_coach_to_gym(p_gym uuid, p_coach uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  perform public._add_coach_to_gym(p_gym, p_coach, p_is_admin);
end;
$$;

create or replace function public.owner_remove_coach_from_gym(p_gym uuid, p_coach uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  return public._remove_coach_from_gym(p_gym, p_coach);
end;
$$;

create or replace function public.owner_reassign_clients(p_gym uuid, p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  return public._reassign_clients(p_gym, p_from, p_to);
end;
$$;

create or replace function public.owner_rename_gym(p_gym uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  perform public._rename_gym(p_gym, p_name);
end;
$$;

create or replace function public.owner_set_gym_booking_settings(p_gym uuid, p_timezone text, p_blackout_start time, p_blackout_end time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  perform public._set_gym_booking_settings(p_gym, p_timezone, p_blackout_start, p_blackout_end);
end;
$$;

create or replace function public.owner_gym_roster(
  p_gym uuid,
  p_filter text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_tz text;
  v_today date;
  v_month date;
  v_d30 date;
  v_in14 date;
  v_flag_week date;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  if p_filter is not null and p_filter not in ('on_plan', 'no_plan', 'ending_soon', 'flagged', 'new_this_month', 'left_last_30') then
    raise exception 'Unknown filter';
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = p_gym;
  v_today := public.local_date(v_tz);
  v_month := date_trunc('month', v_today::timestamp)::date;
  v_d30 := v_today - 30;
  v_in14 := v_today + 14;
  select max(week_start) into v_flag_week from red_flag_entries where gym_id = p_gym;

  with roster as (
    select
      m.id as client_id,
      coalesce(nullif(btrim(cp.name), ''), m.email) as name,
      m.email,
      m.coach_id,
      coalesce(nullif(c.display_name, ''), c.email) as coach_name,
      om.plan_name,
      om.scheduled_end,
      (om.plan_name is not null) as on_plan,
      (select max(dl.log_date) from daily_logs dl
        where dl.client_id = m.id
          and (dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.water is not null
               or dl.bodyweight is not null or dl.steps is not null or dl.sleep is not null)) as last_active,
      (cp.onboarding_completed_at is not null) as onboarded,
      (v_flag_week is not null and exists (
        select 1 from red_flag_entries e where e.gym_id = p_gym and e.week_start = v_flag_week and e.client_id = m.id
      )) as flagged,
      (m.created_at at time zone v_tz)::date as joined_on,
      exists (select 1 from client_memberships cm where cm.client_id = m.id and cm.ended_at >= v_d30) as left_recent
    from profiles m
    left join client_profiles cp on cp.client_id = m.id
    left join profiles c on c.id = m.coach_id
    left join lateral (
      select p.name as plan_name, cm.scheduled_end
      from client_memberships cm join membership_packages p on p.id = cm.package_id
      where cm.client_id = m.id and cm.ended_at is null
      limit 1
    ) om on true
    where m.role = 'client' and m.gym_id = p_gym
  ),
  filtered as (
    select r.*
    from roster r
    where (v_search is null or r.name ilike '%' || v_search || '%' or r.email ilike '%' || v_search || '%')
      and (
        p_filter is null
        or (p_filter = 'on_plan' and r.on_plan)
        or (p_filter = 'no_plan' and not r.on_plan)
        or (p_filter = 'ending_soon' and r.on_plan and r.scheduled_end between v_today and v_in14)
        or (p_filter = 'flagged' and r.flagged)
        or (p_filter = 'new_this_month' and r.joined_on >= v_month)
        or (p_filter = 'left_last_30' and not r.on_plan and r.left_recent)
      )
  ),
  page as (
    select * from filtered order by lower(name), client_id limit v_limit offset v_offset
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'clientId', p.client_id,
          'name', p.name,
          'email', p.email,
          'coachId', p.coach_id,
          'coachName', p.coach_name,
          'plan', p.plan_name,
          'planEndsOn', p.scheduled_end,
          'status', case
            when not p.on_plan then 'no_plan'
            when p.scheduled_end between v_today and v_in14 then 'ending_soon'
            else 'on_plan'
          end,
          'lastActive', p.last_active,
          'onboarded', p.onboarded,
          'flagged', p.flagged,
          'joinedOn', p.joined_on
        )
        order by lower(p.name), p.client_id
      )
      from page p
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'gymId', p_gym,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'filter', p_filter,
    'members', v_rows
  );
end;
$fn$;

revoke execute on function public.owner_set_gym_admin(uuid, uuid, boolean) from public, anon;
revoke execute on function public.owner_add_coach_to_gym(uuid, uuid, boolean) from public, anon;
revoke execute on function public.owner_remove_coach_from_gym(uuid, uuid) from public, anon;
revoke execute on function public.owner_reassign_clients(uuid, uuid, uuid) from public, anon;
revoke execute on function public.owner_rename_gym(uuid, text) from public, anon;
revoke execute on function public.owner_set_gym_booking_settings(uuid, text, time, time) from public, anon;
revoke execute on function public.owner_gym_roster(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.owner_set_gym_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.owner_add_coach_to_gym(uuid, uuid, boolean) to authenticated;
grant execute on function public.owner_remove_coach_from_gym(uuid, uuid) to authenticated;
grant execute on function public.owner_reassign_clients(uuid, uuid, uuid) to authenticated;
grant execute on function public.owner_rename_gym(uuid, text) to authenticated;
grant execute on function public.owner_set_gym_booking_settings(uuid, text, time, time) to authenticated;
grant execute on function public.owner_gym_roster(uuid, text, text, integer, integer) to authenticated;
