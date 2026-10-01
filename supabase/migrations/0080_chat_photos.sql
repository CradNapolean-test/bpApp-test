-- Photo attachments in 1:1 chat. Mirrors voice notes (0040): private bucket, path
-- {client_id}/{filename}, select + insert gated by owns_client so either the member or their
-- coach can send a photo into the shared thread. Messages stay immutable (no delete policy).
insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', false)
on conflict (id) do nothing;

drop policy if exists "select own or coached chat photos" on storage.objects;
create policy "select own or coached chat photos"
  on storage.objects for select
  using (
    bucket_id = 'chat-photos'
    and public.owns_client(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "client or coach uploads chat photos" on storage.objects;
create policy "client or coach uploads chat photos"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-photos'
    and public.owns_client(((storage.foldername(name))[1])::uuid)
  );

alter table public.chat_messages add column if not exists image_path text;
