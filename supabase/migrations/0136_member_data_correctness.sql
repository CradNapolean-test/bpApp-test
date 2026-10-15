-- Member app data correctness (fix brief 06): one column, one function fixed, one function added.
--
--  R11  daily_logs.calories: the day's total kcal INCLUDING Quick Adds that have no macros. Everything else worked a day's calories out
--       from protein, carbs and fat, so a "300 kcal, no split" entry showed 300 on the Food screen and 0 everywhere else. Written by the
--       food sync; older rows keep null and are read exactly as before (the app falls back to the macros).
--  RW1  member_reward_progress() counted attended bookings with no status filter, while Home counts attended among non-cancelled
--       bookings. Now the same rule in both.
--  NO1  mark_all_notifications_read(): the bell marked each unread notification read with its own request (up to 50).
--
-- Apply after 0135 (0143 stays last). Safe to run again.

-- =====================================================================================================================
-- R11 (DECISION D9, recommended default: store the day's calories). Nothing is changed in existing rows.
-- PRE-FLIGHT (read-only; Quick Adds that carry calories but no macros today, the days that were invisible):
--   select count(*) from public.food_diary_entries e
--   where e.food_id is null and e.quick_add_calories is not null
--     and coalesce(e.quick_add_protein, 0) = 0 and coalesce(e.quick_add_carbs, 0) = 0 and coalesce(e.quick_add_fat, 0) = 0;
-- =====================================================================================================================
alter table public.daily_logs add column if not exists calories numeric;

-- The same ceiling as a typed-totals entry (0114): a figure outside it is a typo.
alter table public.daily_logs drop constraint if exists daily_logs_calories_range;
alter table public.daily_logs
  add constraint daily_logs_calories_range check (calories is null or (calories >= 0 and calories <= 100000));

-- =====================================================================================================================
-- RW1. Rewards counted sessions differently from Home.
-- PRE-FLIGHT (read-only; members whose session count changes, because they have an attended booking that was later cancelled):
--   select count(distinct client_id) from public.bookings where attended and status = 'cancelled';
-- Everything else about the function is as 0068 defined it.
-- =====================================================================================================================
create or replace function public.member_reward_progress()
returns table (client_id uuid, sessions bigint, months integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    (select count(*) from bookings b where b.client_id = p.id and b.attended and b.status is distinct from 'cancelled'),
    coalesce((
      select (extract(year from age(current_date, min(cm.started_at))) * 12
            + extract(month from age(current_date, min(cm.started_at))))::integer
      from client_memberships cm where cm.client_id = p.id
    ), 0)
  from profiles p
  where p.role = 'client'
    and (
      p.id = auth.uid()
      or (public.my_gym_id() is not null and public.client_gym_id(p.id) = public.my_gym_id())
    );
$$;

revoke execute on function public.member_reward_progress() from public, anon;
grant execute on function public.member_reward_progress() to authenticated;

-- =====================================================================================================================
-- NO1. Mark every unread notification read in one call.
-- The caller's own notifications only (auth.uid()); returns how many were marked.
-- =====================================================================================================================
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  update notifications set read_at = now() where client_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
