-- Education section: coach-authored content (articles/lessons), assigned per-client with
-- completion tracking -- exactly mirrors form_templates/form_assignments (migration 0008).

create table education_content (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  title text not null,
  body text,
  link_url text,
  created_at timestamptz default now()
);

create table education_assignments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references education_content(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  assigned_at timestamptz default now(),
  completed_at timestamptz
);

alter table education_content enable row level security;
alter table education_assignments enable row level security;

create policy "coach or own-coach's clients read education_content"
  on education_content for select
  to authenticated
  using (coach_id = auth.uid() or coach_id = my_coach_id());

create policy "coach manages own education_content"
  on education_content for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy "select own or coached education_assignments"
  on education_assignments for select
  using (owns_client(client_id));

create or replace function public.assign_education_content(p_content_id uuid, p_client_id uuid)
returns education_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content education_content;
  v_assignment education_assignments;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_content from education_content where id = p_content_id;
  if v_content is null or v_content.coach_id <> auth.uid() then
    raise exception 'Content not found';
  end if;

  insert into education_assignments (content_id, client_id)
  values (p_content_id, p_client_id)
  returning * into v_assignment;

  insert into notifications (client_id, message)
  values (p_client_id, 'New reading: ' || v_content.title);

  return v_assignment;
end;
$$;

grant execute on function public.assign_education_content(uuid, uuid) to authenticated;

create or replace function public.mark_education_complete(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update education_assignments set completed_at = now()
  where id = p_assignment_id and is_self(client_id) and completed_at is null;
end;
$$;

grant execute on function public.mark_education_complete(uuid) to authenticated;
