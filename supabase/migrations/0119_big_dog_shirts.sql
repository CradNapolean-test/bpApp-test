-- Big Dog T-shirts, handed out by tier (White, Turquoise, Silver, Gold). A row is created automatically by the
-- server when a coach-verified result takes a member into a new tier (see awardShirts in lib/data/bigDog.ts).
-- One row per member per tier, so each shirt is owed once. given_at is set when the coach hands it over.

create table if not exists big_dog_shirts (
  client_id uuid not null references profiles(id) on delete cascade,
  tier text not null check (tier in ('white', 'turquoise', 'silver', 'gold')),
  earned_at timestamptz not null default now(),
  given_at timestamptz,
  given_by uuid references profiles(id),
  primary key (client_id, tier)
);

alter table big_dog_shirts enable row level security;

-- The member sees their own; coaches see everyone in their gym.
drop policy if exists "read own or gym big_dog_shirts" on big_dog_shirts;
create policy "read own or gym big_dog_shirts"
  on big_dog_shirts for select
  using (public.is_self(client_id) or public.is_same_gym_as_client(client_id));

-- Coaches mark a shirt as given (or undo it). Nobody can insert or delete from the app: rows are created by the
-- server with the service role, so a shirt cannot be claimed by hand.
drop policy if exists "gym coaches update big_dog_shirts" on big_dog_shirts;
create policy "gym coaches update big_dog_shirts"
  on big_dog_shirts for update
  using (public.is_same_gym_as_client(client_id))
  with check (public.is_same_gym_as_client(client_id));

-- The update policy lets a coach touch any column; only these two may change.
revoke update on big_dog_shirts from authenticated, anon;
grant update (given_at, given_by) on big_dog_shirts to authenticated;
