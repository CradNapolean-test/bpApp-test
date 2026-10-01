-- Membership panel for coaches: start a plan on a chosen date (e.g. next Saturday), end it now or on
-- a chosen date, and a package length for the 6-week challenge.
--
--  * membership_packages.duration_weeks: null = ongoing; 6 = a 6-week challenge. The panel uses it
--    to suggest the end date (start + weeks, plus one buffer day).
--  * client_memberships.scheduled_end: a planned last day. The membership stays active until then;
--    the daily job below closes it (ended_at) the day after and clears its weekly credits.
--  * start_membership / end_membership / clear_scheduled_end: coach-only (their own members).
--  * Starting a plan today now gives the weekly credits straight away instead of waiting for the
--    overnight job.
--  * The overnight job skips plans that haven't started yet and closes ones that have ended.

alter table public.membership_packages
  add column if not exists duration_weeks integer check (duration_weeks is null or duration_weeks > 0);

alter table public.client_memberships
  add column if not exists scheduled_end date;

-- Sets the weekly (membership) credits to a member's plan allowance, exactly like the weekly reset.
create or replace function public.top_up_membership_credits(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_per_week integer;
  v_balance integer;
  v_week date := date_trunc('week', current_date)::date;
begin
  select cm.client_id, mp.credits_per_week into v_client, v_per_week
  from client_memberships cm join membership_packages mp on mp.id = cm.package_id
  where cm.id = p_membership_id;
  if v_client is null then return; end if;

  select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = v_client and bucket = 'membership';
  insert into credits_ledger (client_id, delta, reason, bucket)
  values (v_client, v_per_week - v_balance, 'membership reset: week of ' || v_week, 'membership');
  update client_memberships set last_reset_week = v_week where id = p_membership_id;
end;
$$;

-- Removes whatever weekly credits are left when a plan ends.
create or replace function public.clear_membership_credits(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = p_client_id and bucket = 'membership';
  if v_balance > 0 then
    insert into credits_ledger (client_id, delta, reason, bucket)
    values (p_client_id, -v_balance, 'membership ended', 'membership');
  end if;
end;
$$;

create or replace function public.start_membership(
  p_client_id uuid,
  p_package_id uuid,
  p_start date default null,
  p_end date default null
)
returns client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_start, current_date);
  v_open client_memberships;
  v_new client_memberships;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;
  if p_end is not null and p_end < v_start then
    raise exception 'The end date is before the start date.';
  end if;

  select * into v_open from client_memberships where client_id = p_client_id and ended_at is null;
  if v_open.id is not null then
    if v_start > current_date then
      raise exception 'This member already has an active plan. End it first, or start the new plan today.';
    end if;
    update client_memberships set ended_at = current_date where id = v_open.id;
  end if;

  insert into client_memberships (client_id, package_id, started_at, scheduled_end)
  values (p_client_id, p_package_id, v_start, p_end)
  returning * into v_new;

  if v_start <= current_date then
    perform top_up_membership_credits(v_new.id);
  end if;
  return v_new;
end;
$$;

-- p_end null (or today/earlier) = end it now, clearing the weekly credits; a future date = plan the end.
create or replace function public.end_membership(p_membership_id uuid, p_end date default null)
returns client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m client_memberships;
begin
  select * into v_m from client_memberships where id = p_membership_id;
  if v_m.id is null or not is_coach_of(v_m.client_id) then
    raise exception 'Not authorized';
  end if;
  if v_m.ended_at is not null then
    raise exception 'That plan has already ended.';
  end if;

  if p_end is null or p_end <= current_date then
    update client_memberships set ended_at = current_date, scheduled_end = null where id = p_membership_id returning * into v_m;
    perform clear_membership_credits(v_m.client_id);
  else
    update client_memberships set scheduled_end = p_end where id = p_membership_id returning * into v_m;
  end if;
  return v_m;
end;
$$;

create or replace function public.clear_scheduled_end(p_membership_id uuid)
returns client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m client_memberships;
begin
  select * into v_m from client_memberships where id = p_membership_id;
  if v_m.id is null or not is_coach_of(v_m.client_id) then
    raise exception 'Not authorized';
  end if;
  update client_memberships set scheduled_end = null where id = p_membership_id returning * into v_m;
  return v_m;
end;
$$;

grant execute on function public.start_membership(uuid, uuid, date, date) to authenticated;
grant execute on function public.end_membership(uuid, date) to authenticated;
grant execute on function public.clear_scheduled_end(uuid) to authenticated;

-- The overnight job: close plans whose planned last day has passed, then top up the ones that
-- are running (skipping any that start in the future).
create or replace function public.replenish_due_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_week date := date_trunc('week', current_date)::date;
  v_membership record;
  v_balance integer;
  v_count integer := 0;
begin
  for v_membership in
    select id, client_id, scheduled_end from client_memberships
    where ended_at is null and scheduled_end is not null and scheduled_end < current_date
  loop
    update client_memberships set ended_at = v_membership.scheduled_end where id = v_membership.id;
    perform clear_membership_credits(v_membership.client_id);
  end loop;

  for v_membership in
    select cm.id, cm.client_id, mp.credits_per_week
    from client_memberships cm
    join membership_packages mp on mp.id = cm.package_id
    where cm.ended_at is null
    and cm.started_at <= current_date
    and (cm.last_reset_week is null or cm.last_reset_week < v_current_week)
  loop
    select coalesce(sum(delta), 0) into v_balance
    from credits_ledger
    where client_id = v_membership.client_id and bucket = 'membership';

    insert into credits_ledger (client_id, delta, reason, bucket)
    values (
      v_membership.client_id,
      v_membership.credits_per_week - v_balance,
      'membership reset: week of ' || v_current_week,
      'membership'
    );

    update client_memberships
    set last_reset_week = v_current_week
    where id = v_membership.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
