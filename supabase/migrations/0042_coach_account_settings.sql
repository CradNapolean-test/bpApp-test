-- Coach-side Account Settings additions (see design_handoff_mobile_redesign's
-- 23-coach-settings-desktop.md, which listed "Coach profile" and "Default check-in
-- reminder" rows with no backing data model). Both are narrow security-definer RPCs, same
-- pattern as set_theme_preference (0023) -- profiles has no update policy at all, since it
-- also holds role/coach_id which a client must never be able to write.

-- ============ Coach profile: display name ============
-- Nothing in the app currently names the coach anywhere -- clients see the literal string
-- "Your coach" in chat (DashboardShell.tsx), and the coach's own avatar is keyed off their
-- email. A single display_name covers both without inventing a whole coach_profiles table
-- for fields (bio, business name) nothing yet asks for.
alter table profiles add column display_name text;

create or replace function public.set_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set display_name = nullif(trim(p_name), '') where id = auth.uid();
end;
$$;

grant execute on function public.set_display_name(text) to authenticated;

-- ============ Default check-in reminder (coach-level) ============
-- checkin_reminder_days (0007) is per-client only, hardcoded to a column default of 3 for
-- every new client_profiles row -- a coach who wants a different standard has to fix it by
-- hand on every single client after the fact. This is the coach's own preferred default,
-- read by upsertClientProfile (lib/data/clientProfile.ts) the first time a given client's
-- row is created; it never touches existing clients' already-set values.
alter table profiles add column default_checkin_reminder_days integer not null default 3
  check (default_checkin_reminder_days >= 0); -- 0 = disabled, same convention as checkin_reminder_days

create or replace function public.set_default_checkin_reminder_days(p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_days < 0 then
    raise exception 'Days must be 0 or greater';
  end if;
  update profiles set default_checkin_reminder_days = p_days where id = auth.uid();
end;
$$;

grant execute on function public.set_default_checkin_reminder_days(integer) to authenticated;

-- ============ Coach display name, visible to their own clients ============
-- A client needs their coach's display_name for the chat header, but profiles' only select
-- policy (owns_client(id)) doesn't cover "the row that is my own coach" -- it covers "rows
-- I coach", the opposite direction. Rather than widen the profiles select policy, a narrow
-- read-only RPC mirrors the narrow-write pattern above.
create or replace function public.get_my_coach_display_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coach.display_name
  from profiles me
  join profiles coach on coach.id = me.coach_id
  where me.id = auth.uid();
$$;

grant execute on function public.get_my_coach_display_name() to authenticated;
