-- Which blocks a member actually did. After Lift the member does two 10-minute slots; for each slot they
-- choose Strong or Conditioning (and, when Strong block 2 is split, Upper or Lower body), and may switch
-- after the first slot. One row per member, workout and slot; block_key is e.g. 'strong:1',
-- 'strong:2:upper' or 'conditioning:0' (a single 20-minute conditioning block covers both slots).

create table if not exists workout_block_choices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  program_day_id uuid not null references workout_program_days(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  block_key text not null,
  chosen_at timestamptz not null default now(),
  unique (client_id, program_day_id, slot)
);

alter table workout_block_choices enable row level security;

drop policy if exists "select own or coached workout_block_choices" on workout_block_choices;
create policy "select own or coached workout_block_choices"
  on workout_block_choices for select
  using (owns_client(client_id));

drop policy if exists "client records own workout_block_choices" on workout_block_choices;
create policy "client records own workout_block_choices"
  on workout_block_choices for insert
  with check (is_self(client_id));

drop policy if exists "client changes own workout_block_choices" on workout_block_choices;
create policy "client changes own workout_block_choices"
  on workout_block_choices for update
  using (is_self(client_id))
  with check (is_self(client_id));

drop policy if exists "client removes own workout_block_choices" on workout_block_choices;
create policy "client removes own workout_block_choices"
  on workout_block_choices for delete
  using (is_self(client_id));

create index if not exists workout_block_choices_client_idx on workout_block_choices (client_id);
