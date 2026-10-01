-- 1. Fibre on foods (grams of fibre per gram of food, like protein/carbs/fat). Null means "not
--    known" -- many foods simply have no fibre figure -- and counts as 0 in a day's total.
alter table public.foods add column if not exists fibre numeric;

-- 2. A gym session is logged automatically when the member's booking is marked attended (by the
--    coach, or by the member checking in). The daily log's gym_session flag is switched on for that
--    date; it is never switched off here, so a manual "I trained" tick is left alone.
create or replace function public.sync_gym_session_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.attended is true and (tg_op = 'INSERT' or old.attended is distinct from true) then
    insert into public.daily_logs (client_id, log_date, gym_session)
    values (new.client_id, new.booking_date, true)
    on conflict (client_id, log_date) do update set gym_session = true;
  end if;
  return new;
end;
$fn$;

drop trigger if exists bookings_sync_gym_session on public.bookings;
create trigger bookings_sync_gym_session
  after insert or update of attended on public.bookings
  for each row execute function public.sync_gym_session_from_attendance();

-- Backfill: every session already marked attended.
insert into public.daily_logs (client_id, log_date, gym_session)
select distinct client_id, booking_date, true
from public.bookings
where attended
on conflict (client_id, log_date) do update set gym_session = true;
