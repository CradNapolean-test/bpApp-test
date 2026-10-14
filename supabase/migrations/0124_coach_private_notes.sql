-- Coach-only notes. client_profiles.admin_notes ("Contract / agreement notes -- never shown to the client") lived on the
-- member's own profile row, and a member can read their own row in full through the API, so the notes were readable by the
-- person they were about. They now live in their own table that members cannot read at all.
--
--  * client_coach_notes: one row per member, readable by that member's coach / same-gym coaches / the gym owner. Nobody writes
--    to it directly; set_client_admin_details (below) is the only writer.
--  * Existing notes are copied across first, then the old column is dropped, so nothing is lost.
--  * The protect_coach_owned_profile_fields trigger (0110) no longer mentions the column.

create table public.client_coach_notes (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  notes text not null check (char_length(notes) <= 5000),
  updated_at timestamptz not null default now()
);

alter table public.client_coach_notes enable row level security;

create policy "coaches read client_coach_notes"
  on public.client_coach_notes for select
  using (public.is_same_gym_as_client(client_id) or public.is_coach_of(client_id));

revoke all on public.client_coach_notes from anon;
revoke insert, update, delete on public.client_coach_notes from authenticated;

insert into public.client_coach_notes (client_id, notes)
select client_id, btrim(admin_notes)
from public.client_profiles
where nullif(btrim(admin_notes), '') is not null
on conflict (client_id) do nothing;

-- Same signature as before; the notes go to the new table instead of the profile row.
create or replace function public.set_client_admin_details(p_client_id uuid, p_join_date date, p_referral_source text, p_admin_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
begin
  if not coalesce(public.is_coach_of(p_client_id), false) then
    raise exception 'Not authorized';
  end if;

  update client_profiles
  set join_date = p_join_date,
      referral_source = nullif(trim(p_referral_source), '')
  where client_id = p_client_id;

  if v_notes is null then
    delete from client_coach_notes where client_id = p_client_id;
  else
    insert into client_coach_notes (client_id, notes, updated_at)
    values (p_client_id, v_notes, now())
    on conflict (client_id) do update set notes = excluded.notes, updated_at = now();
  end if;
end;
$$;

-- 0110's trigger, minus the admin_notes column.
create or replace function public.protect_coach_owned_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_coach_of(new.client_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.join_date is not null or new.referral_source is not null then
      raise exception 'Not authorized to set coach-managed profile fields';
    end if;
  elsif new.checkin_reminder_days is distinct from old.checkin_reminder_days
     or new.join_date is distinct from old.join_date
     or new.referral_source is distinct from old.referral_source then
    raise exception 'Not authorized to change coach-managed profile fields';
  end if;

  return new;
end;
$$;

alter table public.client_profiles drop column admin_notes;
