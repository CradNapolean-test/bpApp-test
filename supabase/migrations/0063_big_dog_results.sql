-- Big Dog member standards: each row is one coach-recorded test result for one of the
-- standards exercises (see lib/bigDog.ts for the exercise keys and Rookie/Strong/Big Dog
-- targets). Append-only ledger like credits_ledger / client_exercise_maxes -- a retest or
-- correction is a new row and the current level of an exercise is its most recent row. A row
-- with level 'none' clears an exercise back to "not tested" without deleting history.
--
-- Members can read their own results but cannot write them: a Big Dog level earns a T-shirt,
-- so only the coaching team records it.

create table if not exists big_dog_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_key text not null,
  level text not null check (level in ('none', 'rookie', 'strong', 'big_dog')),
  result_text text, -- what was actually achieved, e.g. "142kg" or "7:12"
  tested_date date not null default current_date,
  recorded_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists big_dog_results_client_idx
  on big_dog_results (client_id, exercise_key, tested_date desc);

alter table big_dog_results enable row level security;

drop policy if exists "select own or coached big_dog_results" on big_dog_results;
create policy "select own or coached big_dog_results"
  on big_dog_results for select
  using (owns_client(client_id));

drop policy if exists "coach records big_dog_results" on big_dog_results;
create policy "coach records big_dog_results"
  on big_dog_results for insert
  with check (is_coach_of(client_id));
