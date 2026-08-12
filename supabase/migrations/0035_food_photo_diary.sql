-- Photo-based food diary (nutrition_tracking_mode = 'photo_diary', 0034). Mirrors
-- progress-photos (0006) exactly: private Storage bucket, signed URLs generated
-- server-side, RLS keyed by client_id in the storage path. RLS on the table itself joins
-- through daily_logs the same way habit_logs (0006) joins through habits, since a photo
-- entry belongs to a specific day's daily_logs row, not directly to a client.

insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', false)
on conflict (id) do nothing;

create policy "select own or coached food photos"
  on storage.objects for select
  using (
    bucket_id = 'food-photos'
    and public.owns_client(((storage.foldername(name))[1])::uuid)
  );

create policy "client uploads own food photos"
  on storage.objects for insert
  with check (
    bucket_id = 'food-photos'
    and public.is_self(((storage.foldername(name))[1])::uuid)
  );

create policy "client deletes own food photos"
  on storage.objects for delete
  using (
    bucket_id = 'food-photos'
    and public.is_self(((storage.foldername(name))[1])::uuid)
  );

create table food_photo_entries (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references daily_logs(id) on delete cascade,
  storage_path text not null,
  description text,
  estimated_calories numeric,
  estimated_protein numeric,
  estimated_carbs numeric,
  estimated_fat numeric,
  created_at timestamptz default now()
);

alter table food_photo_entries enable row level security;

create policy "select own or coached food_photo_entries"
  on food_photo_entries for select
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_photo_entries.daily_log_id
      and owns_client(daily_logs.client_id)
    )
  );

create policy "client inserts own food_photo_entries"
  on food_photo_entries for insert
  with check (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_photo_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

create policy "client deletes own food_photo_entries"
  on food_photo_entries for delete
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_photo_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );
