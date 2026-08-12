alter table food_diary_entries add column created_at timestamptz default now();

-- Mirrors get_client_last_active (0010_client_last_active.sql)'s shape: NOT security
-- definer, so it runs under the caller's own RLS -- each unioned subquery is independently
-- filtered by its own table's existing owns_client()-based policy before the union/limit
-- happens, so a coach only ever gets their own clients' rows, a client only their own, with
-- zero manual filtering needed here.
create or replace function public.get_recent_client_activity(p_client_id uuid default null, p_limit integer default 100)
returns table (client_id uuid, event_type text, occurred_at timestamptz, detail text)
language sql
stable
as $$
  select * from (
    select ml.client_id, 'measurement'::text as event_type, ml.created_at as occurred_at, null::text as detail
    from measurement_logs ml
    where p_client_id is null or ml.client_id = p_client_id

    union all
    select h.client_id, 'habit', hl.created_at, h.name
    from habit_logs hl join habits h on h.id = hl.habit_id
    where hl.completed and (p_client_id is null or h.client_id = p_client_id)

    union all
    select wl.client_id, 'workout', wl.logged_at, null::text
    from workout_logs wl
    where p_client_id is null or wl.client_id = p_client_id

    union all
    select pp.client_id, 'photo', pp.created_at, null::text
    from progress_photos pp
    where p_client_id is null or pp.client_id = p_client_id

    union all
    select b.client_id, 'booking', b.created_at, c.name
    from bookings b join classes c on c.id = b.class_id
    where b.status <> 'cancelled' and (p_client_id is null or b.client_id = p_client_id)

    union all
    select dl.client_id, 'food', fde.created_at, ms.label
    from food_diary_entries fde
    join daily_logs dl on dl.id = fde.daily_log_id
    left join meal_sections ms on ms.id = fde.meal_section_id
    where p_client_id is null or dl.client_id = p_client_id
  ) events
  order by occurred_at desc
  limit p_limit;
$$;

grant execute on function public.get_recent_client_activity(uuid, integer) to authenticated;
