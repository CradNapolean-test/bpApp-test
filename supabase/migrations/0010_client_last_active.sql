-- Coach-facing Program Health widget. Returns each client's most recent *real* logged day
-- (mirrors the "blank auto-created row doesn't count" predicate already used in
-- send_checkin_reminders, 0007_checkin_reminders.sql).
--
-- Deliberately NOT security definer -- runs under the calling user's own privileges, so
-- daily_logs' existing RLS policy ("select own or coached daily_logs", owns_client) still
-- applies inside the function body. A coach calling this only ever gets rows for their own
-- clients, automatically, with no manual coach_id filtering needed here or in app code.
create or replace function public.get_client_last_active()
returns table (client_id uuid, last_active date)
language sql
stable
as $$
  select dl.client_id, max(dl.log_date) as last_active
  from daily_logs dl
  where (
    dl.protein is not null or dl.carbs is not null or dl.fat is not null or
    dl.bodyweight is not null or dl.steps is not null or dl.sleep is not null or
    dl.fibre is not null or dl.water is not null or dl.gym_session or
    dl.hunger is not null or dl.energy is not null or dl.motivation is not null or
    dl.stress is not null or dl.period_started or dl.notes is not null
  )
  group by dl.client_id;
$$;

grant execute on function public.get_client_last_active() to authenticated;
