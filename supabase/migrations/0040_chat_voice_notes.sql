-- Audio voice notes in 1:1 chat. Storage bucket mirrors progress-photos (0006) / food-photos
-- (0035): private bucket, path {client_id}/{filename} so storage.foldername(name)[1] recovers
-- the owning client_id for RLS, signed URLs generated on read (server-side for initial load,
-- client-side for realtime inserts -- see lib/data/chat.ts and ChatTab.tsx).
--
-- Unlike the photo buckets, both select AND insert use owns_client (not is_self) -- either the
-- client or their coach can send a voice note into the shared thread, same as chat_messages'
-- own insert policy already allows for text. No delete policy: chat_messages has none either
-- (messages are immutable at the RLS level), so voice notes follow the same rule.
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

create policy "select own or coached voice notes"
  on storage.objects for select
  using (
    bucket_id = 'voice-notes'
    and public.owns_client(((storage.foldername(name))[1])::uuid)
  );

create policy "client or coach uploads voice notes"
  on storage.objects for insert
  with check (
    bucket_id = 'voice-notes'
    and public.owns_client(((storage.foldername(name))[1])::uuid)
  );

-- An audio-only message has no text; a text-only message keeps text not null in practice via
-- application code, but the column itself has to allow null for the audio case.
alter table chat_messages
  alter column text drop not null,
  add column audio_path text,
  add column audio_duration_seconds integer;
