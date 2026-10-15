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
