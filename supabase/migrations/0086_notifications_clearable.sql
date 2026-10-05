-- Members can clear notifications. read_at still means "seen" (it drives the bell dot); cleared_at
-- means "dismissed" and hides the notification from their list. The existing policy that lets a
-- member update their own notifications already covers this -- no policy change.
alter table public.notifications add column if not exists cleared_at timestamptz;
