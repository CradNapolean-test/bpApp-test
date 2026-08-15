-- Client-owned email opt-out, alongside the existing notifications_enabled (0023 -- in-app
-- check-in nudges only). Distinct because they're the only two notification-adjacent client
-- sends that exist today: in-app check-in reminders (send_checkin_reminders, unaffected by
-- this column) and broadcast emails (lib/email.ts's sendBroadcastEmail, called from both
-- composeCommunication's immediate-send path and the send-communications cron route) --
-- this column gates the latter.
alter table client_profiles
  add column email_notifications_enabled boolean not null default true;

-- No RLS change needed -- same "client updates own client_profiles" policy as every other
-- Setup-adjacent field.
