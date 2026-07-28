-- Phase 3: Chat — enable Realtime on chat_messages so both sides see new messages live
-- instead of polling. RLS still applies to realtime changefeeds (Supabase enforces the
-- table's own policies), so this doesn't widen who can see what.
alter publication supabase_realtime add table chat_messages;
