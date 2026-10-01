-- "Reviewed" markers behind the coach dashboard's To do list: a member's weekly check-in
-- (ref = the Monday of that week), a day of meal photos (ref = the date), or a completed form
-- (ref = the assignment id). A row means the coach has looked at it and it drops off the list.
-- Only the member's own coach writes these; coaches at the same gym can read them.

create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('week', 'diary_day', 'form')),
  client_id uuid not null references public.profiles(id) on delete cascade,
  ref text not null,
  reviewed_by uuid not null default auth.uid() references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  unique (kind, client_id, ref)
);

create index if not exists coach_reviews_client_idx on public.coach_reviews (client_id, kind);

alter table public.coach_reviews enable row level security;

drop policy if exists "read coach_reviews" on public.coach_reviews;
create policy "read coach_reviews"
  on public.coach_reviews for select
  using (public.owns_client(client_id) or public.is_same_gym_as_client(client_id));

drop policy if exists "coach adds coach_reviews" on public.coach_reviews;
create policy "coach adds coach_reviews"
  on public.coach_reviews for insert
  with check (public.is_coach_of(client_id) and reviewed_by = auth.uid());

drop policy if exists "coach removes coach_reviews" on public.coach_reviews;
create policy "coach removes coach_reviews"
  on public.coach_reviews for delete
  using (public.is_coach_of(client_id));
