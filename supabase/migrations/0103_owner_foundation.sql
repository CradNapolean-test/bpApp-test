-- Owner side, phase 1: an organisation that groups the gyms, the owner role's access, and the first
-- owner RPC. Run 0102 first (it adds the 'owner' value this uses), in a separate run.
--
-- The owner:
--  * sees every gym in their organisation, and its coaches, through the functions below;
--  * can read what a coach can read about any member in those gyms, including chat (read only), by way of
--    is_same_gym_as_client(), which every cross-coach read policy from 0053 already calls;
--  * can change nothing about a member (every write policy still needs owns_client / is_coach_of).

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
alter table organisations enable row level security;

alter table gyms add column if not exists organisation_id uuid references organisations(id);
alter table profiles add column if not exists organisation_id uuid references organisations(id);

-- ============ helpers ============
create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.my_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organisation_id from profiles where id = auth.uid() and role = 'owner';
$$;

create or replace function public.is_owner_of_gym(target_gym_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_gym_id is not null
    and exists (
      select 1 from gyms g
      where g.id = target_gym_id and g.organisation_id is not null and g.organisation_id = public.my_org_id()
    );
$$;

-- Every cross-coach read of a member's data goes through this (0053). The owner of the member's gym now passes too.
create or replace function public.is_same_gym_as_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (public.my_gym_id() is not null and public.my_gym_id() = public.client_gym_id(target_client_id))
      or public.is_owner_of_gym(public.client_gym_id(target_client_id));
$$;

-- ============ policies ============
drop policy if exists "owner reads own organisation" on organisations;
create policy "owner reads own organisation" on organisations for select using (id = public.my_org_id());

-- Coaches (active in one of the organisation's gyms) and members (fixed home gym) show up in the owner's lists.
drop policy if exists "owner reads profiles in their gyms" on profiles;
create policy "owner reads profiles in their gyms" on profiles for select using (public.is_owner_of_gym(gym_id));

drop policy if exists "owner reads coach memberships" on coach_gym_memberships;
create policy "owner reads coach memberships" on coach_gym_memberships for select using (public.is_owner_of_gym(gym_id));

-- ============ owner RPC: the gyms and their coaches ============
create or replace function public.owner_gyms_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
begin
  if not public.is_owner() then
    raise exception 'Not authorized';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'members', (select count(*) from profiles m where m.role = 'client' and m.gym_id = g.id),
        'coaches', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'name', coalesce(nullif(c.display_name, ''), c.email),
              'email', c.email,
              'isAdmin', cgm.is_gym_admin,
              'members', (select count(*) from profiles m where m.role = 'client' and m.coach_id = c.id and m.gym_id = g.id)
            )
            order by coalesce(nullif(c.display_name, ''), c.email)
          )
          from coach_gym_memberships cgm
          join profiles c on c.id = cgm.coach_id
          where cgm.gym_id = g.id
        ), '[]'::jsonb)
      )
      order by g.name
    )
    from gyms g
    where g.organisation_id = public.my_org_id()
  ), '[]'::jsonb);
end;
$fn$;

grant execute on function public.owner_gyms_overview() to authenticated;
