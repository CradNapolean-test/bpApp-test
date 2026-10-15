-- Credits, bookings and integrity, part 2 (fix brief 03): credit grants, programme rollouts, template imports, broadcast groups.
--
--  CM9  Credit grants and removals go through functions: capped amounts, a recorded coach, and a removal that cannot overdraw
--       when two coaches act at once. (Migration 0143 later removes the direct table insert, after brief 05 is merged.)
--  R5   Starting a programme is all-or-nothing: if it fails, nothing is left behind for the overnight job to apply.
--  CL3  A template import is one transaction with limits, instead of a request per day and exercise.
--  R33  A group used in a broadcast can be deleted: history keeps the group's name and pending broadcasts to it are cancelled.
--
-- Each section starts with a read-only PRE-FLIGHT query: run them BEFORE applying this file. Apply after 0132. Written to be
-- re-run safely. The refund side of credits (D1) is in 0132.

-- =====================================================================================================================
-- CM9. Credit grants had no cap and removal was not atomic.
-- grantCredits, grantCreditPack and removeCredits wrote straight into credits_ledger from the app: any amount, no confirmation, and
-- removal read the balance and then inserted, so two coaches could both pass the check. Now:
--   grant_credits(p_client, p_amount, p_reason, p_expires_at)  1 to 50 credits, reason 1 to 200 characters, bonus bucket, granted_by
--                                                              = the caller, an expiry (optional) must be in the future
--   remove_credits(p_client, p_amount, p_reason)               1 to 50; takes the weekly (membership) credits first, then bonus;
--                                                              never takes more than the member has; the lock and the balance read
--                                                              and the insert are one transaction; reason is saved as "Removed: ..."
--   grant_credit_pack(p_client, p_pack)                        reads the pack row itself (no amount from the browser); the pack
--                                                              must belong to the member's gym; the pack's own size is limited to 500
-- All three are for the member's assigned coach (is_coach_of) and lock the member's credits first, the same lock the refund function
-- uses (0132), so a grant, a removal and a refund for one member never interleave.
--
-- PRE-FLIGHT (read-only; existing grants the new caps would not have allowed, and manual rows with unusual sizes):
--   select client_id, delta, reason, created_at from public.credits_ledger
--   where granted_by is not null and booking_id is null and (delta > 50 or delta < -50) order by created_at desc;
--   select id, name, credits from public.credit_packs where credits > 500;
-- =====================================================================================================================
create or replace function public.grant_credits(p_client uuid, p_amount integer, p_reason text, p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not coalesce(public.is_coach_of(p_client), false) then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    raise exception 'You can give between 1 and 50 credits at a time.';
  end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 200 then
    raise exception 'Add a reason of up to 200 characters.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry date must be in the future.';
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || p_client::text));

  insert into credits_ledger (client_id, delta, reason, bucket, granted_by, expires_at)
  values (p_client, p_amount, v_reason, 'bonus', auth.uid(), p_expires_at);
end;
$$;

create or replace function public.remove_credits(p_client uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Removed by coach');
  v_membership integer;
  v_bonus integer;
  v_from_membership integer;
  v_from_bonus integer;
begin
  if auth.uid() is null or not coalesce(public.is_coach_of(p_client), false) then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 50 then
    raise exception 'You can take off between 1 and 50 credits at a time.';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'Keep the reason to 200 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || p_client::text));

  select coalesce(sum(delta) filter (where bucket = 'membership'), 0), coalesce(sum(delta) filter (where bucket = 'bonus'), 0)
    into v_membership, v_bonus
  from credits_ledger where client_id = p_client;

  if greatest(v_membership, 0) + greatest(v_bonus, 0) < p_amount then
    raise exception 'They only have % credits.', greatest(v_membership, 0) + greatest(v_bonus, 0);
  end if;

  v_from_membership := least(p_amount, greatest(v_membership, 0));
  v_from_bonus := p_amount - v_from_membership;

  if v_from_membership > 0 then
    insert into credits_ledger (client_id, delta, reason, bucket, granted_by)
    values (p_client, -v_from_membership, 'Removed: ' || v_note, 'membership', auth.uid());
  end if;
  if v_from_bonus > 0 then
    insert into credits_ledger (client_id, delta, reason, bucket, granted_by)
    values (p_client, -v_from_bonus, 'Removed: ' || v_note, 'bonus', auth.uid());
  end if;
end;
$$;

create or replace function public.grant_credit_pack(p_client uuid, p_pack uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack credit_packs;
begin
  if auth.uid() is null or not coalesce(public.is_coach_of(p_client), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_pack from credit_packs where id = p_pack;
  if v_pack is null then
    raise exception 'Credit pack not found';
  end if;
  if not public.same_gym_as_client(v_pack.gym_id, p_client) then
    raise exception 'That belongs to a different gym.';
  end if;
  if v_pack.credits is null or v_pack.credits < 1 or v_pack.credits > 500 then
    raise exception 'That credit pack is not valid.';
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || p_client::text));

  insert into credits_ledger (client_id, delta, reason, bucket, granted_by, expires_at, pack_id)
  values (
    p_client,
    v_pack.credits,
    'Pack: ' || v_pack.name,
    'bonus',
    auth.uid(),
    case when v_pack.expires_after_days is not null then now() + (v_pack.expires_after_days * interval '1 day') end,
    v_pack.id
  );
end;
$$;

revoke execute on function public.grant_credits(uuid, integer, text, timestamptz) from public, anon;
revoke execute on function public.remove_credits(uuid, integer, text) from public, anon;
revoke execute on function public.grant_credit_pack(uuid, uuid) from public, anon;
grant execute on function public.grant_credits(uuid, integer, text, timestamptz) to authenticated;
grant execute on function public.remove_credits(uuid, integer, text) to authenticated;
grant execute on function public.grant_credit_pack(uuid, uuid) to authenticated;

-- =====================================================================================================================
-- R5 (database half). A failed "Start a programme" still ran overnight.
-- scheduleProgrammeRollout inserted a programme_rollouts row and then called apply_programme_rollout in a second request. If the
-- apply failed the coach saw an error, but the row (applied_at null, start today) stayed and the 03:15 UTC job applied it anyway.
--
-- schedule_programme_rollout(template, name, start, audience, client ids, starts_now) does both in ONE transaction, so an error
-- rolls the insert back too. It checks: the caller is a coach; the template belongs to the caller's gym; audience 'all' is for gym
-- admins only; for 'selected', 1 to 500 members, every one in this gym (client_gym_id) and, unless the caller is a gym admin, the
-- caller's own; a start date between 30 days ago and a year ahead. It answers the number of members it applied to (starts_now) or
-- will apply to (later). apply_programme_rollout (0130) already picks 'all' by the member's own gym, so the audience matches what
-- the coach sees; brief 04 asks for confirmation (with this count) before calling it.
--
-- PRE-FLIGHT (read-only; rollouts waiting for the overnight job right now. Check none is a left-over of a failed attempt):
--   select r.id, g.name as gym, r.program_name, r.start_date, r.audience, cardinality(r.client_ids) as chosen, r.created_at
--   from public.programme_rollouts r join public.gyms g on g.id = r.gym_id
--   where r.applied_at is null order by r.start_date;
-- =====================================================================================================================
create or replace function public.schedule_programme_rollout(
  p_template_id uuid,
  p_program_name text,
  p_start date,
  p_audience text,
  p_client_ids uuid[],
  p_starts_now boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_admin boolean;
  v_template program_templates;
  v_name text;
  v_tz text;
  v_today date;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_count integer;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can start a programme';
  end if;
  v_admin := exists (select 1 from profiles where id = auth.uid() and is_gym_admin);

  if p_audience is null or p_audience not in ('all', 'selected') then
    raise exception 'Choose who the programme is for';
  end if;
  if p_audience = 'all' and not v_admin then
    raise exception 'Only a gym admin can start a programme for everyone.';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null or v_template.gym_id is distinct from v_gym then
    raise exception 'Programme template not found';
  end if;

  v_name := left(coalesce(nullif(btrim(coalesce(p_program_name, '')), ''), v_template.name), 100);

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_gym;
  v_today := public.local_date(v_tz);
  if p_start is null or p_start < v_today - 30 or p_start > v_today + 365 then
    raise exception 'Choose a start date within the next year.';
  end if;

  if p_audience = 'selected' then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_client_ids, '{}'::uuid[])) x;
    if cardinality(v_ids) < 1 then
      raise exception 'Choose at least one member.';
    end if;
    if cardinality(v_ids) > 500 then
      raise exception 'Choose up to 500 members at a time.';
    end if;
    if exists (select 1 from unnest(v_ids) i where not public.same_gym_as_client(v_gym, i)) then
      raise exception 'That belongs to a different gym.';
    end if;
    if not v_admin and exists (select 1 from unnest(v_ids) i where not coalesce(public.is_coach_of(i), false)) then
      raise exception 'You can only start a programme for your own members.';
    end if;
  end if;

  insert into programme_rollouts (gym_id, template_id, program_name, start_date, audience, client_ids, created_by)
  values (v_gym, p_template_id, v_name, p_start, p_audience, v_ids, auth.uid())
  returning id into v_id;

  if coalesce(p_starts_now, false) then
    v_count := public.apply_programme_rollout(v_id);
  elsif p_audience = 'all' then
    select count(*) into v_count from profiles c where c.role = 'client' and public.client_gym_id(c.id) is not distinct from v_gym;
  else
    v_count := cardinality(v_ids);
  end if;

  return v_count;
end;
$fn$;

revoke execute on function public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean) from public, anon;
grant execute on function public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean) to authenticated;

-- =====================================================================================================================
-- CL3. A template import was not atomic.
-- importProgramTemplate inserted the template and then every day and exercise one request at a time, so a failure left a half-built
-- template. import_program_template(p_json) builds the whole template in one transaction and answers its id. It takes the same
-- shape as the export file ({"version": 1, "name", "days": [{week_num, day_label, sort_order, phase_label, notes, day_position,
-- exercises: [...]}]}) and keeps only the fields the app's own validator keeps; anything else in the file is ignored.
--   limits       20 different weeks, 14 days per week, 60 exercises per day; names up to 100 / 200 characters, notes 2,000
--   numbers      out-of-range numbers (for example 5,000 sets) are left empty rather than failing the whole import
--   video links  only https:// links are kept; anything else is left empty
--   library      each exercise is linked to the library entry with the same name (ignoring case and spacing) when there is one
--   1RM          an exercise prescribed as a % of 1RM needs a percentage and a library entry; otherwise the import is refused with
--                the exercise's name (the database would have refused it anyway, but only after half the template was written)
-- The template belongs to the caller and their active gym. Helpers: _import_text, _import_number, _import_int (internal).
--
-- PRE-FLIGHT: none (a new function; nothing existing changes).
-- =====================================================================================================================
create or replace function public._import_text(p jsonb, k text, p_max integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p -> k) = 'string' then nullif(left(btrim(p ->> k), p_max), '') end;
$$;

create or replace function public._import_number(p jsonb, k text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p -> k) = 'number' then (p ->> k)::numeric end;
$$;

create or replace function public._import_int(p jsonb, k text, p_min integer, p_max integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p -> k) = 'number' and (p ->> k)::numeric between p_min and p_max then round((p ->> k)::numeric)::integer
  end;
$$;

revoke execute on function public._import_text(jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public._import_number(jsonb, text) from public, anon, authenticated;
revoke execute on function public._import_int(jsonb, text, integer, integer) from public, anon, authenticated;

create or replace function public.import_program_template(p_json jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_name text;
  v_template uuid;
  v_day jsonb;
  v_ex jsonb;
  v_day_id uuid;
  v_week integer;
  v_ex_name text;
  v_library uuid;
  v_prescription text;
  v_percent numeric;
  v_video text;
  v_section text;
  v_block_type text;
  v_block_no integer;
  v_block_part text;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can import a programme';
  end if;

  if p_json is null or jsonb_typeof(p_json) <> 'object'
     or coalesce(jsonb_typeof(p_json -> 'days'), '') <> 'array'
     or public._import_text(p_json, 'name', 100) is null then
    raise exception 'That file isn''t a recognised programme template export';
  end if;
  v_name := public._import_text(p_json, 'name', 100);

  if jsonb_array_length(p_json -> 'days') > 20 * 14 then
    raise exception 'That programme has too many days (up to 14 days a week for 20 weeks).';
  end if;

  -- Every day needs a week number and a label; limits per week and per day.
  for v_day in select value from jsonb_array_elements(p_json -> 'days') loop
    if jsonb_typeof(v_day) <> 'object'
       or public._import_int(v_day, 'week_num', 0, 1000) is null
       or public._import_text(v_day, 'day_label', 100) is null
       or coalesce(jsonb_typeof(v_day -> 'exercises'), '') <> 'array' then
      raise exception 'That file isn''t a recognised programme template export';
    end if;
    if jsonb_array_length(v_day -> 'exercises') > 60 then
      raise exception 'A day can have up to 60 exercises.';
    end if;
  end loop;

  if (select count(distinct public._import_int(d.value, 'week_num', 0, 1000)) from jsonb_array_elements(p_json -> 'days') d) > 20 then
    raise exception 'A programme can have up to 20 weeks.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_json -> 'days') d
    group by public._import_int(d.value, 'week_num', 0, 1000)
    having count(*) > 14
  ) then
    raise exception 'A week can have up to 14 days.';
  end if;

  insert into program_templates (coach_id, gym_id, name)
  values (auth.uid(), v_gym, v_name)
  returning id into v_template;

  for v_day in select value from jsonb_array_elements(p_json -> 'days') loop
    v_week := public._import_int(v_day, 'week_num', 0, 1000);

    insert into program_template_days (template_id, week_num, day_label, sort_order, phase_label, notes, day_position)
    values (
      v_template,
      v_week,
      public._import_text(v_day, 'day_label', 100),
      coalesce(public._import_int(v_day, 'sort_order', -100000, 100000), 0),
      public._import_text(v_day, 'phase_label', 100),
      public._import_text(v_day, 'notes', 2000),
      public._import_int(v_day, 'day_position', 0, 1000)
    )
    returning id into v_day_id;

    for v_ex in select value from jsonb_array_elements(v_day -> 'exercises') loop
      if jsonb_typeof(v_ex) <> 'object' or public._import_text(v_ex, 'name', 200) is null then
        raise exception 'That file isn''t a recognised programme template export';
      end if;
      v_ex_name := public._import_text(v_ex, 'name', 200);

      select l.id into v_library
      from exercise_library l
      where lower(btrim(l.name)) = lower(v_ex_name)
      order by l.is_active desc, l.created_at
      limit 1;

      v_prescription := case when v_ex ->> 'prescription_type' = 'percent_1rm' then 'percent_1rm' else 'absolute' end;
      v_percent := public._import_number(v_ex, 'percent_1rm');
      if v_percent is not null and (v_percent < 0 or v_percent > 200) then
        v_percent := null;
      end if;
      if v_prescription = 'percent_1rm' and (v_percent is null or v_library is null) then
        raise exception '"%" is prescribed as a percentage of 1RM, which needs a percentage and an entry in your exercise library.', v_ex_name;
      end if;

      v_video := public._import_text(v_ex, 'video_url', 500);
      if v_video is not null and v_video !~* '^https://' then
        v_video := null;
      end if;

      v_section := case when v_ex ->> 'section' in ('warmup', 'strong', 'conditioning') then v_ex ->> 'section' else 'lift' end;
      v_block_type := case when v_ex ->> 'block_type' = 'circuit' then 'circuit' else 'exercise' end;
      v_block_no := public._import_int(v_ex, 'block_no', 1, 2);
      v_block_part := case when v_ex ->> 'block_part' in ('upper', 'lower', 'breath', 'burn') then v_ex ->> 'block_part' end;

      insert into program_template_exercises (
        template_day_id, exercise_library_id, name, sets, reps, load, rpe, notes, video_url, superset_group, rest_seconds, sort_order,
        block_type, prescription_type, percent_1rm, progression_load_increment, progression_every_weeks,
        section, block_no, block_format, block_part
      )
      values (
        v_day_id,
        v_library,
        v_ex_name,
        public._import_int(v_ex, 'sets', 0, 1000),
        public._import_text(v_ex, 'reps', 40),
        case when public._import_number(v_ex, 'load') between 0 and 10000 then public._import_number(v_ex, 'load') end,
        case when public._import_number(v_ex, 'rpe') between 0 and 10 then public._import_number(v_ex, 'rpe') end,
        public._import_text(v_ex, 'notes', 2000),
        v_video,
        public._import_text(v_ex, 'superset_group', 40),
        public._import_int(v_ex, 'rest_seconds', 0, 3600),
        coalesce(public._import_int(v_ex, 'sort_order', -100000, 100000), 0),
        v_block_type,
        v_prescription,
        v_percent,
        case when public._import_number(v_ex, 'progression_load_increment') between -1000 and 1000 then public._import_number(v_ex, 'progression_load_increment') end,
        coalesce(public._import_int(v_ex, 'progression_every_weeks', 1, 52), 1),
        v_section,
        v_block_no,
        public._import_text(v_ex, 'block_format', 60),
        v_block_part
      );
    end loop;
  end loop;

  return v_template;
end;
$fn$;

revoke execute on function public.import_program_template(jsonb) from public, anon;
grant execute on function public.import_program_template(jsonb) to authenticated;
