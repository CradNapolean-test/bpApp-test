-- Coach feedback on a member's food diary, visible to the member. One row per comment: on a whole
-- day (photo_id null) or on a single diary photo. Only the member's own coach can write or delete
-- it; the member and their coach can read it.

create table if not exists public.nutrition_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null default auth.uid() references public.profiles(id),
  log_date date not null,
  photo_id uuid references public.food_photo_entries(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists nutrition_feedback_client_date_idx on public.nutrition_feedback (client_id, log_date desc);

alter table public.nutrition_feedback enable row level security;

drop policy if exists "read own or coached nutrition_feedback" on public.nutrition_feedback;
create policy "read own or coached nutrition_feedback"
  on public.nutrition_feedback for select using (public.owns_client(client_id));

drop policy if exists "coach writes nutrition_feedback" on public.nutrition_feedback;
create policy "coach writes nutrition_feedback"
  on public.nutrition_feedback for insert
  with check (public.is_coach_of(client_id) and coach_id = auth.uid());

drop policy if exists "coach deletes own nutrition_feedback" on public.nutrition_feedback;
create policy "coach deletes own nutrition_feedback"
  on public.nutrition_feedback for delete
  using (public.is_coach_of(client_id) and coach_id = auth.uid());
