create table client_disabled_screens (
  client_id uuid not null references profiles(id) on delete cascade,
  screen text not null,
  primary key (client_id, screen)
);

alter table client_disabled_screens enable row level security;

-- Mirrors workout_programs' exact split (schema.sql ~L426-436): client reads their own row
-- (their dashboard needs to know what's hidden), only the coach can write it. NOT the
-- client_journal_entries pattern (is_coach_of alone, zero client access) -- that table is
-- deliberately invisible to the client; this one the client must be able to read.
create policy "select own or coached client_disabled_screens"
  on client_disabled_screens for select
  using (owns_client(client_id));

create policy "coach manages client_disabled_screens"
  on client_disabled_screens for all
  using (is_coach_of(client_id))
  with check (is_coach_of(client_id));
