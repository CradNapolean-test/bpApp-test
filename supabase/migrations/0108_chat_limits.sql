-- Chat limits, enforced by the database rather than only by the apps.
--
-- Found while building the member chat (slice 5; see docs/SECURITY_DEFINER_AUDIT.md): chat_messages.text had no length
-- limit and the chat-photos / voice-notes buckets accepted any file of any type up to the project-wide cap, so a member
-- could store a multi-megabyte message or upload e.g. an HTML file into a bucket whose contents a coach later opens.
-- Row Level Security already stops anyone reaching another member's thread or files; this only bounds what a member can
-- put into their own.
--
-- The limits are generous next to what the apps send: photos are shrunk to 1600 px JPEG (a few hundred KB), voice notes
-- are a few MB at most (the web recorder has no length cap, so 20 MB leaves room), and messages are a few hundred
-- characters (the mobile app stops at 4000).

-- Text: 4000 characters. NOT VALID so rows that already exist (on a database that has been in use) are not checked or
-- rejected by this migration; every new or edited row is. Run `alter table ... validate constraint` later if wanted.
alter table public.chat_messages
  drop constraint if exists chat_messages_text_length;
alter table public.chat_messages
  add constraint chat_messages_text_length check (text is null or char_length(text) <= 4000) not valid;

-- Files: size and type, per bucket.
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
where id = 'chat-photos';

update storage.buckets
set file_size_limit = 20 * 1024 * 1024,
    allowed_mime_types = array['audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav']
where id = 'voice-notes';
