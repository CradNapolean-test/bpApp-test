create table client_groups (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  name text not null,
  created_at timestamptz default now()
);

alter table client_groups enable row level security;

-- Coach-only on every operation, no client access at all -- matches client_journal_entries'
-- shape (not program_templates', which also lets clients read). PT Distinction's groups are
-- a coach-side organizing tool only; clients never see which groups they're in.
create policy "coach manages own client_groups"
  on client_groups for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create table client_group_members (
  group_id uuid not null references client_groups(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  primary key (group_id, client_id)
);

alter table client_group_members enable row level security;

create policy "coach manages own client_group_members"
  on client_group_members for all
  using (
    exists (
      select 1 from client_groups
      where client_groups.id = client_group_members.group_id
      and client_groups.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from client_groups
      where client_groups.id = client_group_members.group_id
      and client_groups.coach_id = auth.uid()
    )
  );
