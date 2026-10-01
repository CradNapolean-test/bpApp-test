-- InBody (body composition) scan results. One row per scan, entered by the member from their
-- printout or by their coach after scanning them at the gym, optionally with a photo/PDF of the
-- printout. Both the member and their coach can add, edit and delete scans (owns_client).

create table if not exists public.body_scans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  scan_date date not null,
  weight_kg numeric,
  skeletal_muscle_kg numeric,
  body_fat_pct numeric,
  body_fat_kg numeric,
  visceral_fat_level numeric,
  bmr_kcal numeric,
  inbody_score numeric,
  notes text,
  printout_path text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists body_scans_client_date_idx on public.body_scans (client_id, scan_date desc);

alter table public.body_scans enable row level security;

drop policy if exists "read own or coached body_scans" on public.body_scans;
create policy "read own or coached body_scans"
  on public.body_scans for select using (public.owns_client(client_id));

drop policy if exists "add own or coached body_scans" on public.body_scans;
create policy "add own or coached body_scans"
  on public.body_scans for insert with check (public.owns_client(client_id));

drop policy if exists "edit own or coached body_scans" on public.body_scans;
create policy "edit own or coached body_scans"
  on public.body_scans for update using (public.owns_client(client_id));

drop policy if exists "delete own or coached body_scans" on public.body_scans;
create policy "delete own or coached body_scans"
  on public.body_scans for delete using (public.owns_client(client_id));

-- Printout photos / PDFs: private bucket, path {client_id}/{filename}, same shape as the voice-note
-- and chat-photo buckets (either the member or their coach can read, add and remove).
insert into storage.buckets (id, name, public)
values ('inbody-scans', 'inbody-scans', false)
on conflict (id) do nothing;

drop policy if exists "read own or coached inbody printouts" on storage.objects;
create policy "read own or coached inbody printouts"
  on storage.objects for select
  using (bucket_id = 'inbody-scans' and public.owns_client(((storage.foldername(name))[1])::uuid));

drop policy if exists "add own or coached inbody printouts" on storage.objects;
create policy "add own or coached inbody printouts"
  on storage.objects for insert
  with check (bucket_id = 'inbody-scans' and public.owns_client(((storage.foldername(name))[1])::uuid));

drop policy if exists "delete own or coached inbody printouts" on storage.objects;
create policy "delete own or coached inbody printouts"
  on storage.objects for delete
  using (bucket_id = 'inbody-scans' and public.owns_client(((storage.foldername(name))[1])::uuid));
