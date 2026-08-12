-- Postgres grants EXECUTE on a newly created function to PUBLIC by default. Three cron-only
-- RPCs in this codebase carry a comment claiming they're "NOT granted to authenticated"
-- (0005's replenish_due_memberships, 0007's send_checkin_reminders, 0031's
-- send_due_communications), but none of them ever actually revoked the default PUBLIC grant --
-- the comments described the intent, not the enforced state. Verified live: an anon-key client
-- could call send_due_communications() directly and have it succeed (no error, real row
-- processing). All three get the same fix here: only the service-role client (which bypasses
-- grants entirely) can call them going forward.
revoke execute on function public.send_due_communications() from public, anon, authenticated;
revoke execute on function public.send_checkin_reminders() from public, anon, authenticated;
revoke execute on function public.replenish_due_memberships() from public, anon, authenticated;
