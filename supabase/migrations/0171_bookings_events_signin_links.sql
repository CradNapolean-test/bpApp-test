-- Bookings, events and sign-in links (live review decisions of 11 Nov 2026). Four parts, each with its own before/after below:
--   1. D13a (BK11, RO9b): when a plan ends, its member's upcoming bookings are cancelled and refunded.
--   2. D13b (BK10, RO9a): a booking's credit counts in the week the session runs, not the week it was booked in.
--   3. Events: any coach adds them and changes their own; only gym admins and the owner change or delete others' or message their sign-ups.
--   4. D22 (SE8): every one-time sign-in (password) link made is recorded: who, for whom, when. Gym admins and the owner can read it.
--
-- Apply the WHOLE file in one go, after 0167. It must be applied BEFORE the web app that goes with it is deployed: the Book screens ask
-- member_session_credits (part 2) what each day's sessions can be paid with, and the sign-in link routes refuse to give out a link they
-- cannot record in sign_in_links (part 4).
--
-- 1. D13a. Ending a plan (end_membership now, or the overnight job when a planned last day has passed) removed the member's weekly credits
--    (clear_membership_credits, 0088) but kept their bookings, so sessions booked with that plan's credits still happened after it ended.
--    New: cancel_bookings_for_ended_plan(member), internal. Every booked or waitlisted session of the member that has not started yet (the
--      session's date and start time, in the gym's timezone) is cancelled. A booked one is refunded through refund_booking_credits (0132),
--      the one refund path, so the ledger only gains rows: a bonus credit goes back to the bonus credits and stays; a weekly credit goes
--      back to the weekly credits, which are then cleared with the plan (the ledger shows both rows). The freed place goes to the waitlist
--      (promote_from_waitlist, 0158). Sessions that have already started are left alone. The member gets one notice listing them. Weekly
--      credits still held for a later week (part 2) are dropped: with the plan ended, that week has no weekly credits.
--    Changed: clear_membership_credits(member) calls it first, then clears the weekly credits as before (now also a balance below 0, which
--      part 2 can leave after a plan change; before, it could not happen). It is called only when a plan ends
--      (end_membership and replenish_due_memberships), so both ways of ending a plan do it. Changing a member's plan today
--      (start_membership) ends the old plan without calling it: the member is still on a plan, so their bookings stay.
--    The web's "End plan now" confirm says the bookings are cancelled. Part 2 also stops anyone booking a session after a plan's planned
--    last day, since the plan's end would cancel it.
--
-- 2. D13b. Weekly credits reset on Saturday (0144; a credit week runs Saturday to Friday) to the plan's allowance, and a booking took its
--    credit from whatever was left at the time it was made. So a member could spend this week's leftover credits on next week's sessions
--    on Friday, be reset to the full allowance on Saturday and book again: up to twice the allowance in one week. And a member who booked
--    next week on Friday had fewer credits left for this week.
--    Now a session is paid from the weekly credits of the credit week it runs in:
--      * In a week that has started for the member (their plan's reset has run for it), it is charged from their weekly balance at once,
--        as before.
--      * In a later week, the weekly credits are HELD, not charged: bookings.weekly_credits (new column) records how many, and nothing is
--        taken from this week's balance. That week can hold at most the plan's allowance. When that week's reset runs (the Saturday job, or
--        the top-up when a plan starts or changes), the balance is set to the allowance less what that week's sessions already took, and
--        each held booking is charged ("Booked <session>, <day date at time>"), so the ledger still has one charge row per booking.
--      * Bonus credits pay what the weekly credits can't, and are charged at once whichever week the session is in.
--      * A day after the plan's planned last day, or before it starts, has no weekly credits; no plan, no weekly credits.
--    Cancelling: a held booking cancelled in time had nothing charged, so nothing comes back. refund_booking_credits (the one refund
--      path: a member's cancel, a coach's removal with a refund, a cancelled or retired session, a plan's end) now also drops the hold
--      (weekly_credits back to 0), so that week's credits are free again. A held booking cancelled after its deadline, or removed by a
--      coach without a refund, keeps its hold and that week's reset charges it ("Booked <session>, <day> (cancelled, no refund)"): the
--      credit is lost from the week the session was in, as any late cancel is, and nothing is taken from the week the member cancelled in.
--      A charged booking is refunded as before (capped at the weekly allowance, 0132). cancel_booking and coach_cancel_booking are not
--      changed.
--    The Saturday reset (0144): same day (the 03:00 UTC job), same "membership reset: week of <Saturday>" row and last_reset_week. The
--      only difference: after it, each held booking of that week is charged. A session booked between midnight and the job is held until
--      the job runs, a few hours later.
--    Bookings already made: the 0 in weekly_credits means "paid when booked" and they are left exactly as they are. Live on 18 Nov 2026
--      none was paid ahead (2 upcoming bookings, both this credit week, paid this week), so nobody keeps an extra week's credits.
--    Changing a plan mid-week: the new plan's credits for this week are its allowance less this week's sessions already charged (before:
--      the full allowance again). Sessions held for later weeks stay booked and are charged from the new plan's weeks. If the new plan
--      has fewer credits than were held for a week, that week starts below 0 (nothing more can be booked with weekly credits that week);
--      the Saturday after resets it as usual, and a plan's end clears a weekly balance below 0 as well as above.
--    New: session_credit_sources(member, day), charge_booking, start_credit_week (all internal), and member_session_credits(member,
--      days[]) for the Book screens (the member, their coach or a coach at their gym).
--    Changed: book_class and book_class_for_client (pay through charge_booking; refuse a day after the plan's planned last day),
--      promote_from_waitlist (pays the same way; passes over someone whose plan ends first), refund_booking_credits (drops a hold),
--      top_up_membership_credits and replenish_due_memberships (through start_credit_week).
--    The web Book screen, the phone Book screen and the coach's "add to session" panel check a session's own week before booking.
--
-- 3. Events (decision of 11 Nov). One policy (0065) let any coach at the gym change or delete any event, and notify_event_signups (0135)
--    let any of them message anyone's sign-ups. Now any coach at the gym adds events (as themself) and changes, deletes or messages the
--    sign-ups of their OWN; a gym admin of that gym or the owner (can_manage_gym_business, 0161) does it for anyone's. The admins and the
--    owner can also read the gym's events and sign-ups. An event keeps its author and gym (trigger gym_event_keep_author). The rule is
--    may_manage_gym_event(gym, author); the web's server actions check it first, and the Events tab hides Edit and Delete on events the
--    coach can't change.
--
-- 4. D22 (SE8). A member's coach or a gym admin can make a one-time "choose a new password" link for a member, and is shown it (kept, by
--    decision); whoever adds a new coach is shown that coach's link. Nothing recorded either. New table sign_in_links: one row per link
--    (gym, made_by, made_for, kind 'member' or 'new_coach', created_at), written only by the web server with the service role, after its
--    checks and BEFORE the link is shown or emailed (if the row can't be written, no link is given out). Row Level Security: the gym's
--    admins and the owner read it; nobody signed in can add, change or remove a row. gym_sign_in_links(gym, limit) lists the recent
--    ones with names for the owner's gym page, Team tab.
--
-- Guard: before changing anything, the migration checks that each function it replaces is the one from the migration named below (or
-- already this file's), comparing the bodies with spaces and line breaks squeezed out. If one has been changed some other way since, nothing
-- is changed and it stops with "... is not the one from migration ...". Then send the PRE-FLIGHT's results to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('book_class', 'book_class_for_client', 'clear_membership_credits', 'notify_event_signups', 'promote_from_waitlist',
--                       'refund_booking_credits', 'replenish_due_memberships', 'top_up_membership_credits')
--   order by 1;
-- Expected before (one row each): book_class e2b0c419b0b19d6c9b2ad4154fd1649a (0132), book_class_for_client 270fb63ff2e3fd54d21b295fb1f4a1da
-- (0132), clear_membership_credits 9483ea3b336f92c5782a64761083e605 (0088), notify_event_signups a1f6463fe410d59274e8f92b881cdc62 (0135),
-- promote_from_waitlist 9fc7b15cf12a122b341485bd76bac407 (0158), refund_booking_credits 1012d9b77036d76674168aa35f86a0e5 (0132),
-- replenish_due_memberships 39d57cc8c876aa4555c9d2d89042b47f (0144), top_up_membership_credits 5421724d514d7888bd0895a4f3618733 (0144).
--
--   -- 1. Upcoming bookings that ending a plan would cancel today: members with no open plan, and bookings after a planned last day.
--   select count(*) filter (where cm.client_id is null) as no_open_plan,
--          count(*) filter (where cm.scheduled_end is not null and b.booking_date > cm.scheduled_end) as after_planned_end
--   from public.bookings b
--   left join public.client_memberships cm on cm.client_id = b.client_id and cm.ended_at is null
--   where b.status in ('booked', 'waitlist') and b.booking_date >= current_date;
-- Live on 18 Nov 2026 (counted read-only from the app): 0 and 0 (2 upcoming bookings in all, both on open plans with no planned end).
--
--   -- 2. Upcoming bookings paid with weekly credits in an EARLIER credit week than the session's (kept as they are, see part 2):
--   select count(*) from public.bookings b
--   where b.status = 'booked' and b.booking_date >= current_date
--     and exists (select 1 from public.credits_ledger l where l.booking_id = b.id and l.bucket = 'membership' and l.delta < 0
--                   and (l.created_at at time zone 'UTC')::date
--                       < b.booking_date - ((extract(isodow from b.booking_date)::int + 1) % 7));
--   -- and each running plan's last reset (every one should be the latest Saturday):
--   select last_reset_week, count(*) from public.client_memberships where ended_at is null group by 1 order by 1;
-- Live on 18 Nov 2026: 0; 15 plans, all 2026-11-14.
--
--   -- 3. The events policies today, and events by author:
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('gym_events', 'event_signups') order by 1, 2;
--   select e.gym_id, count(*) as events, count(*) filter (where e.created_by is null) as no_author, count(distinct e.created_by) as authors
--   from public.gym_events e group by 1;
-- Expected before: event_signups "member leaves event" DELETE, "member signs up for gym event" INSERT, "read own or gym event_signups"
-- SELECT; gym_events "gym coaches manage gym_events" ALL, "gym reads gym_events" SELECT. An event with no author can then be changed by
-- admins and the owner only. Live on 18 Nov 2026 (read-only from the app): 2 events, at one gym, both with an author (one coach).
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after (this file's bodies): book_class a036ea14d2d41fdb4536a532caa468a0, book_class_for_client 6cfad2f3ee0675e7a8b3a2aac7ed17b6,
-- clear_membership_credits 216799244135448524bd8309db709627, notify_event_signups bf7f98bb5f245ed6c0a7025cf369fda7,
-- promote_from_waitlist 0b3ac0cbc60ba30bd9f15abc0ca08aa7, refund_booking_credits 4322efbcdd73c453183fd02b49afa736,
-- replenish_due_memberships b3bf7a41c4fb73ce65584ae7d4312e0c, top_up_membership_credits cf4bc960cdab6a80b45101f33e3b0c45.
--   (the events policies query again) -> event_signups as before; gym_events "event author or gym admins change gym_events" UPDATE,
--   "event author or gym admins remove gym_events" DELETE, "gym coaches add gym_events" INSERT, "gym reads gym_events" SELECT.
--   select tgname from pg_trigger where tgrelid = 'public.gym_events'::regclass and not tgisinternal;  -> gym_event_keep_author
--   select relrowsecurity from pg_class where oid = 'public.sign_in_links'::regclass;  -> true
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'sign_in_links';
--     -> "gym admins and owner read sign_in_links" SELECT (only)
--   select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'sign_in_links'
--     and grantee in ('anon', 'authenticated') order by 1;  -> SELECT only (for authenticated)
--   select has_function_privilege('authenticated', 'public.gym_sign_in_links(uuid, integer)', 'execute'),
--          has_function_privilege('anon', 'public.gym_sign_in_links(uuid, integer)', 'execute');  -> true, false
--
--   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as signed_in, has_function_privilege('anon', p.oid, 'execute') as anyone
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('cancel_bookings_for_ended_plan', 'clear_membership_credits', 'session_credit_sources', 'charge_booking',
--                       'start_credit_week', 'refund_booking_credits', 'member_session_credits', 'book_class', 'may_manage_gym_event',
--                       'gym_event_keep_author', 'notify_event_signups')
--   order by 1;
-- Expected: book_class, may_manage_gym_event, member_session_credits and notify_event_signups true, false; every other one false, false
-- (only other database functions, or the trigger, call them).
--   select column_name, data_type, column_default, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'bookings' and column_name = 'weekly_credits';
-- Expected: integer, 0, NO. And every existing booking has 0: select count(*) from public.bookings where weekly_credits <> 0;  -> 0
--
-- Live checks with a test member on a 3-a-week plan (a test session each day; clean up after):
--   1. D13a: book a session for later this week, End plan now. The booking shows as cancelled, the member has a notice "Your plan has
--      ended, so ...", and their Credits history shows "Refunded <session> (plan ended)" then "membership ended".
--   2. D13b, on a weekday before Saturday: book 3 sessions next week. The Book screen's "credits left" for this week does not change, and
--      the booking sheet for next week says what is left that week; a 4th next-week session is refused ("Not enough credits") unless the
--      member has bonus credits. Then cancel one next-week booking: nothing is refunded (nothing was charged), and it can be booked again.
--   3. The Saturday after: the Credits history shows "membership reset: week of <Saturday>" and one "Booked ..." row per held booking; the
--      weekly balance is 3 less those bookings. A next-week session cancelled after its deadline shows as "Booked ... (cancelled, no
--      refund)" there, not in the week it was cancelled in.
--   4. Set a planned last day; booking a session after it is refused ("Your plan ends on ...").
--   5. Events, with two test coaches at one gym (neither an admin): coach A adds a test event; coach B sees it without Edit or Delete and
--      "Added by another coach"; A edits it (a member signed up is told) and deletes it. Then switch Admin on for B (owner -> gym ->
--      Team): B sees Edit and Delete on A's events.
--   6. D22: on a test member's page, "send a password link" still shows the link; the owner's gym page, Team tab, lists it under "Sign-in
--      links made" with the coach's and the member's names. Signed in as a coach who is not an admin,
--      select count(*) from public.sign_in_links;  -> 0 (no rows readable).
--
-- REVERSE: run, from the migration named in the guard, the definitions of clear_membership_credits (0088), top_up_membership_credits and
-- replenish_due_memberships (0144), book_class, book_class_for_client and refund_booking_credits (0132), and promote_from_waitlist
-- (0158). Held bookings (weekly_credits > 0 with no membership row in credits_ledger) are then never charged: charge them first, or cancel
-- them. The new functions and the column can stay (nothing else uses them).
-- Events: run notify_event_signups from 0135 and the gym_events / event_signups policies from 0065, drop the policies "gym coaches add
-- gym_events", "event author or gym admins change gym_events" and "event author or gym admins remove gym_events", and drop trigger
-- gym_event_keep_author on public.gym_events.
-- Sign-in links: drop function public.gym_sign_in_links(uuid, integer); the table sign_in_links can stay (a deploy of the web app before
-- this file refuses to give out links, since it cannot record them: deploy the code after this file, or roll the code back with it).
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_md5 text;
  v_check record;
begin
  for v_check in
    select * from (values
      ('clear_membership_credits', '0088', array['9483ea3b336f92c5782a64761083e605', '216799244135448524bd8309db709627']),
      ('top_up_membership_credits', '0144', array['5421724d514d7888bd0895a4f3618733', 'cf4bc960cdab6a80b45101f33e3b0c45']),
      ('replenish_due_memberships', '0144', array['39d57cc8c876aa4555c9d2d89042b47f', 'b3bf7a41c4fb73ce65584ae7d4312e0c']),
      ('book_class', '0132', array['e2b0c419b0b19d6c9b2ad4154fd1649a', 'a036ea14d2d41fdb4536a532caa468a0']),
      ('book_class_for_client', '0132', array['270fb63ff2e3fd54d21b295fb1f4a1da', '6cfad2f3ee0675e7a8b3a2aac7ed17b6']),
      ('promote_from_waitlist', '0158', array['9fc7b15cf12a122b341485bd76bac407', '0b3ac0cbc60ba30bd9f15abc0ca08aa7']),
      ('refund_booking_credits', '0132', array['1012d9b77036d76674168aa35f86a0e5', '4322efbcdd73c453183fd02b49afa736']),
      ('notify_event_signups', '0135', array['a1f6463fe410d59274e8f92b881cdc62', 'bf7f98bb5f245ed6c0a7025cf369fda7'])
    ) as t(name, migration, accepted)
  loop
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is null or not (v_md5 = any (v_check.accepted)) then
      raise exception '% is not the one from migration % (body md5 %), so nothing was changed.', v_check.name, v_check.migration, coalesce(v_md5, 'missing');
    end if;
  end loop;
end
$guard$;

-- =====================================================================================================================================
-- 1. D13a: a plan's end cancels and refunds its member's upcoming bookings
-- =====================================================================================================================================

-- Cancels every booked or waitlisted session of a member that has not started yet, refunding the booked ones through the shared refund
-- function and giving each freed place to the waitlist. Returns how many were cancelled. Called by clear_membership_credits (a plan has
-- ended), after the plan's ended_at is set, so refund_booking_credits finds no plan and gives back what each booking cost; the weekly part
-- is then cleared with the plan.
create or replace function public.cancel_bookings_for_ended_plan(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking record;
  v_count integer := 0;
  v_list text := '';
begin
  if p_client is null then
    return 0;
  end if;

  for v_booking in
    select b.id, b.status, b.class_id, b.booking_date, c.name, c.start_time
    from bookings b
    join classes c on c.id = b.class_id
    join gyms g on g.id = c.gym_id
    where b.client_id = p_client
      and b.status in ('booked', 'waitlist')
      and ((b.booking_date + coalesce(c.start_time, time '00:00')) at time zone coalesce(nullif(g.timezone, ''), 'UTC')) > now()
    order by b.booking_date, c.start_time, b.created_at
  loop
    update bookings set status = 'cancelled' where id = v_booking.id and status in ('booked', 'waitlist');
    if not found then
      continue;
    end if;

    if v_booking.status = 'booked' then
      perform public.refund_booking_credits(v_booking.id, 'Refunded ' || v_booking.name || ' (plan ended)');
      perform public.promote_from_waitlist(v_booking.class_id, v_booking.booking_date);
    end if;

    v_count := v_count + 1;
    if v_count <= 4 then
      v_list := v_list || case when v_count > 1 then '; ' else '' end
        || v_booking.name || ', ' || public.session_label(v_booking.booking_date, v_booking.start_time);
    end if;
  end loop;

  -- Weekly credits still held for a later week and never charged (a session there cancelled after its deadline; part 2): with the plan
  -- ended, that week has no weekly credits, so the hold goes.
  update bookings b set weekly_credits = 0
  where b.client_id = p_client
    and b.weekly_credits > 0
    and not exists (select 1 from credits_ledger l where l.booking_id = b.id and l.bucket = 'membership');

  if v_count > 0 then
    insert into notifications (client_id, message)
    values (
      p_client,
      'Your plan has ended, so '
        || case when v_count = 1 then 'your upcoming booking was' else 'your ' || v_count || ' upcoming bookings were' end
        || ' cancelled: ' || v_list || case when v_count > 4 then ' and ' || (v_count - 4) || ' more' else '' end
        || '. Any bonus credits they used are back in your account.'
    );
  end if;

  return v_count;
end;
$fn$;

revoke execute on function public.cancel_bookings_for_ended_plan(uuid) from public, anon, authenticated;

-- Called when a plan ends (end_membership, replenish_due_memberships). The 0088 definition with the bookings cancelled first (D13a), so
-- the weekly credits their refunds give back are cleared with the rest, and a weekly balance below 0 (part 2) is cleared too.
create or replace function public.clear_membership_credits(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  perform public.cancel_bookings_for_ended_plan(p_client_id);

  perform pg_advisory_xact_lock(hashtext('credits:' || p_client_id::text));
  select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = p_client_id and bucket = 'membership';
  if v_balance <> 0 then
    insert into credits_ledger (client_id, delta, reason, bucket)
    values (p_client_id, -v_balance, 'membership ended', 'membership');
  end if;
end;
$$;

revoke execute on function public.clear_membership_credits(uuid) from public, anon, authenticated;

-- =====================================================================================================================================
-- 2. D13b: a booking's credit counts in the week the session runs
-- =====================================================================================================================================

-- The weekly credits a booking takes from the credit week its session is in (Saturday to Friday). Set when the booking is paid (booked,
-- or moved off the waitlist); back to 0 when a refund drops a hold that was never charged. Bookings made before 0171 have 0: they were
-- paid from the week they were booked in. A booking holds its weekly credits (set here, no ledger row yet) until its week's reset.
alter table public.bookings add column if not exists weekly_credits integer not null default 0 check (weekly_credits >= 0);

-- What a member can pay for a session on p_date with, read-only:
--   weekly_left    weekly credits left for that session's credit week: 0 without a plan running on that day (none, not started yet, or
--                  past its planned last day). When the member's credit week has already started (the reset has run for that week:
--                  last_reset_week), it is their weekly balance. For a later week it is the plan's allowance less what that week's
--                  sessions already take: each booking's held weekly_credits (booked, or cancelled after its deadline), or what was
--                  charged for it if anything was.
--   weekly_now     true when those weekly credits are charged straight away, false when they are held until that week's reset.
--   bonus_left     bonus credits (any week).
--   plan_last_day  the plan's planned last day, if it has one.
create or replace function public.session_credit_sources(p_client uuid, p_date date)
returns table (weekly_left integer, weekly_now boolean, bonus_left integer, plan_last_day date)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_week date := public.credit_week_start(p_date);
  v_started date;
  v_end date;
  v_reset date;
  v_allowance integer;
  v_membership integer;
  v_taken integer;
begin
  select coalesce(sum(l.delta) filter (where l.bucket = 'membership'), 0)::integer,
         coalesce(sum(l.delta) filter (where l.bucket = 'bonus'), 0)::integer
  into v_membership, bonus_left
  from credits_ledger l
  where l.client_id = p_client;

  select cm.started_at, cm.scheduled_end, cm.last_reset_week, coalesce(mp.credits_per_week, 0)
  into v_started, v_end, v_reset, v_allowance
  from client_memberships cm
  join membership_packages mp on mp.id = cm.package_id
  where cm.client_id = p_client and cm.ended_at is null
  order by cm.started_at desc
  limit 1;

  plan_last_day := v_end;
  weekly_left := 0;
  weekly_now := false;

  if v_started is null or p_date is null or p_date < v_started or (v_end is not null and p_date > v_end) then
    return next;
    return;
  end if;

  if v_reset is not null and v_week <= v_reset then
    weekly_now := true;
    weekly_left := greatest(v_membership, 0);
  else
    -- A hold counts whatever the booking's status: a refund drops it (weekly_credits 0), so a cancelled booking still holding credits
    -- was cancelled after its deadline and that week's reset will charge it.
    select coalesce(sum(
             case
               when c.net is not null then greatest(-c.net, 0)
               else b.weekly_credits
             end), 0)::integer
    into v_taken
    from bookings b
    left join lateral (
      select sum(l.delta) as net from credits_ledger l where l.booking_id = b.id and l.bucket = 'membership'
    ) c on true
    where b.client_id = p_client
      and b.weekly_credits > 0
      and b.booking_date between v_week and v_week + 6;
    weekly_left := greatest(v_allowance - v_taken, 0);
  end if;

  return next;
end;
$fn$;

revoke execute on function public.session_credit_sources(uuid, date) from public, anon, authenticated;

-- Pays for a booking that has just been booked or moved off the waitlist: weekly credits of the session's week first, then bonus credits.
-- Weekly credits of a week that has started are charged now; those of a later week are held (bookings.weekly_credits) and charged by
-- that week's reset (start_credit_week). Bonus credits are always charged now. Answers false, and writes nothing, when the member cannot
-- pay. Locks the member's credits, as refunds and grants do, so two bookings at once cannot spend the same credit.
create or replace function public.charge_booking(p_booking uuid, p_cost integer, p_reason text, p_by uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client uuid;
  v_date date;
  v_weekly_left integer;
  v_weekly_now boolean;
  v_bonus_left integer;
  v_cost integer := greatest(coalesce(p_cost, 0), 0);
  v_weekly integer;
  v_bonus integer;
begin
  select client_id, booking_date into v_client, v_date from bookings where id = p_booking;
  if v_client is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || v_client::text));

  select s.weekly_left, s.weekly_now, s.bonus_left into v_weekly_left, v_weekly_now, v_bonus_left
  from public.session_credit_sources(v_client, v_date) s;

  v_weekly := least(v_cost, v_weekly_left);
  v_bonus := v_cost - v_weekly;
  if v_bonus > greatest(v_bonus_left, 0) then
    return false;
  end if;

  if v_weekly > 0 and v_weekly_now then
    insert into credits_ledger (client_id, delta, reason, bucket, booking_id, granted_by)
    values (v_client, -v_weekly, p_reason, 'membership', p_booking, p_by);
  end if;
  if v_bonus > 0 then
    insert into credits_ledger (client_id, delta, reason, bucket, booking_id, granted_by)
    values (v_client, -v_bonus, p_reason, 'bonus', p_booking, p_by);
  end if;

  update bookings set weekly_credits = v_weekly where id = p_booking;
  return true;
end;
$fn$;

revoke execute on function public.charge_booking(uuid, integer, text, uuid) from public, anon, authenticated;

-- Starts a credit week for one plan: the weekly reset (Saturday, replenish_due_memberships) and the top-up when a plan starts or changes
-- (top_up_membership_credits). The weekly balance becomes the plan's allowance LESS what that week's sessions were already charged (after
-- a plan change mid-week, the week's sessions booked so far; at a Saturday reset, nothing). Bookings made before 0171 (weekly_credits 0)
-- are not counted: they were paid from the week they were booked in. Then every hold for this week (or, if a reset was missed, an earlier
-- one) is charged: sessions booked ahead, and ones cancelled after their deadline or removed without a refund. Same reason text as before
-- ("membership reset: week of <Saturday>"), and last_reset_week is set to that Saturday as before.
create or replace function public.start_credit_week(p_membership uuid, p_week date)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client uuid;
  v_allowance integer;
  v_balance integer;
  v_used integer;
  v_held record;
begin
  select cm.client_id, coalesce(mp.credits_per_week, 0) into v_client, v_allowance
  from client_memberships cm
  join membership_packages mp on mp.id = cm.package_id
  where cm.id = p_membership;
  if v_client is null or p_week is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || v_client::text));

  select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = v_client and bucket = 'membership';
  -- Net weekly credits already charged for this week's sessions (charges are negative, refunds positive).
  select coalesce(sum(l.delta), 0) into v_used
  from credits_ledger l
  join bookings b on b.id = l.booking_id
  where l.client_id = v_client
    and l.bucket = 'membership'
    and b.weekly_credits > 0
    and b.booking_date between p_week and p_week + 6;

  insert into credits_ledger (client_id, delta, reason, bucket)
  values (v_client, v_allowance + v_used - v_balance, 'membership reset: week of ' || p_week, 'membership');
  update client_memberships set last_reset_week = p_week where id = p_membership;

  -- The holds: never charged (a refund drops a hold, so a cancelled booking here was cancelled after its deadline).
  for v_held in
    select b.id, b.weekly_credits, b.status, c.name, c.start_time, b.booking_date
    from bookings b
    join classes c on c.id = b.class_id
    where b.client_id = v_client
      and b.weekly_credits > 0
      and b.booking_date <= p_week + 6
      and not exists (select 1 from credits_ledger l where l.booking_id = b.id and l.bucket = 'membership')
    order by b.booking_date, c.start_time, b.created_at
  loop
    insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
    values (
      v_client,
      -v_held.weekly_credits,
      'Booked ' || v_held.name || ', ' || public.session_label(v_held.booking_date, v_held.start_time)
        || case when v_held.status = 'cancelled' then ' (cancelled, no refund)' else '' end,
      'membership',
      v_held.id
    );
  end loop;
end;
$fn$;

revoke execute on function public.start_credit_week(uuid, date) from public, anon, authenticated;

-- The immediate top-up when a plan starts or changes today (start_membership). The 0144 definition, now through start_credit_week.
create or replace function public.top_up_membership_credits(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.start_credit_week(p_membership_id, public.credit_week_start(current_date));
end;
$$;

revoke execute on function public.top_up_membership_credits(uuid) from public, anon, authenticated;

-- The overnight job. The 0144 definition: close plans whose planned last day has passed (clear_membership_credits now also cancels their
-- upcoming bookings, part 1), then start the new credit week for every running plan not yet reset this week, through start_credit_week.
create or replace function public.replenish_due_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_week date := public.credit_week_start(current_date);
  v_membership record;
  v_count integer := 0;
begin
  for v_membership in
    select id, client_id, scheduled_end from client_memberships
    where ended_at is null and scheduled_end is not null and scheduled_end < current_date
  loop
    update client_memberships set ended_at = v_membership.scheduled_end where id = v_membership.id;
    perform clear_membership_credits(v_membership.client_id);
  end loop;

  for v_membership in
    select cm.id
    from client_memberships cm
    where cm.ended_at is null
    and cm.started_at <= current_date
    and (cm.last_reset_week is null or cm.last_reset_week < v_current_week)
  loop
    perform public.start_credit_week(v_membership.id, v_current_week);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.replenish_due_memberships() from public, anon, authenticated;

-- The one refund path (a member's cancel in time, a coach's removal with a refund, a cancelled or retired session, a plan's end). The
-- 0132 definition (D1 cap) with one change: a booking still holding weekly credits for a later week (never charged) drops the hold, so
-- that week's credits are free again. Without a refund (a late cancel, a removal without one) the hold stays and its week's reset
-- charges it.
create or replace function public.refund_booking_credits(p_booking uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_row record;
  v_allowance integer;
  v_membership_balance integer;
  v_amount integer;
  v_total integer := 0;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Refunded booking');
begin
  select client_id into v_client from bookings where id = p_booking;
  if v_client is null then
    return 0;
  end if;

  -- One member's credit movements one at a time, so the balance read below is the balance the refund lands on.
  perform pg_advisory_xact_lock(hashtext('credits:' || v_client::text));

  -- A hold that was never charged has nothing to give back: it just goes (0171, D13b).
  update bookings b set weekly_credits = 0
  where b.id = p_booking
    and b.weekly_credits > 0
    and not exists (select 1 from credits_ledger l where l.booking_id = b.id and l.bucket = 'membership');

  select mp.credits_per_week into v_allowance
  from client_memberships cm
  join membership_packages mp on mp.id = cm.package_id
  where cm.client_id = v_client and cm.ended_at is null
  limit 1;

  for v_row in
    -- What this booking still has charged against it, per bucket (deductions less refunds already made).
    select bucket, -sum(delta) as net
    from credits_ledger
    where booking_id = p_booking
    group by bucket
    having -sum(delta) > 0
    order by bucket
  loop
    v_amount := v_row.net;
    if v_row.bucket = 'membership' and v_allowance is not null then
      select coalesce(sum(delta), 0) into v_membership_balance
      from credits_ledger where client_id = v_client and bucket = 'membership';
      v_amount := least(v_amount, greatest(v_allowance - v_membership_balance, 0));
    end if;

    insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
    values (
      v_client,
      v_amount,
      case
        when v_amount = 0 then v_reason || ' (nothing to add: already at the weekly allowance)'
        when v_amount < v_row.net then v_reason || ' (limited to the weekly allowance)'
        else v_reason
      end,
      v_row.bucket,
      p_booking
    );
    v_total := v_total + v_amount;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.refund_booking_credits(uuid, text) from public, anon, authenticated;

-- book_class: the 0132 definition. New: a session after the last day of the member's plan is refused (the plan's end would cancel it,
-- part 1), and the booking is paid through charge_booking (the session's week's credits, then bonus credits).
create or replace function public.book_class(p_class_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_capacity integer;
  v_cost integer;
  v_class_name text;
  v_class_gym uuid;
  v_dow integer;
  v_specific date;
  v_retired timestamptz;
  v_tz text;
  v_booked_count integer;
  v_plan_last_day date;
  v_status text;
  v_booking bookings;
begin
  if v_client_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity, credit_cost, name, gym_id, day_of_week, specific_date, retired_at
  into v_capacity, v_cost, v_class_name, v_class_gym, v_dow, v_specific, v_retired
  from classes where id = p_class_id for share;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  -- 1. The class must be at the member's own gym (this function bypasses RLS, so check it explicitly).
  if v_class_gym is distinct from public.client_gym_id(v_client_id) then
    raise exception 'Class not found';
  end if;
  if v_retired is not null then
    raise exception 'That session is no longer running';
  end if;
  -- 2. Not in the past (the gym's own calendar day).
  select coalesce(timezone, 'UTC') into v_tz from gyms where id = v_class_gym;
  if p_booking_date < (now() at time zone coalesce(v_tz, 'UTC'))::date then
    raise exception 'You can''t book a session in the past';
  end if;
  -- 3. The session must actually run on that date: its one-off date, or its weekday (0 = Sunday).
  if not (
    (v_specific is not null and p_booking_date = v_specific)
    or (v_specific is null and v_dow is not null and extract(dow from p_booking_date)::integer = v_dow)
  ) then
    raise exception 'That session doesn''t run on that date';
  end if;
  -- 4. And it must not have been cancelled by the coach.
  if exists (select 1 from class_exceptions where class_id = p_class_id and occurrence_date = p_booking_date) then
    raise exception 'That session has been cancelled';
  end if;
  -- 5. Not after the last day of the member's plan (D13a): the plan's end would cancel it.
  select s.plan_last_day into v_plan_last_day from public.session_credit_sources(v_client_id, p_booking_date) s;
  if v_plan_last_day is not null and p_booking_date > v_plan_last_day then
    raise exception 'Your plan ends on %, so you can''t book after that.', public.session_label(v_plan_last_day, null);
  end if;

  select count(*) into v_booked_count
  from bookings
  where class_id = p_class_id and booking_date = p_booking_date and status = 'booked';

  v_status := case when v_booked_count < v_capacity then 'booked' else 'waitlist' end;

  insert into bookings (class_id, client_id, booking_date, status)
  values (p_class_id, v_client_id, p_booking_date, v_status)
  returning * into v_booking;

  -- Paid from the weekly credits of the week the session runs (D13b), then bonus credits. Not enough: the booking is undone.
  if v_status = 'booked' then
    if not public.charge_booking(v_booking.id, v_cost, 'Booked ' || v_class_name, null) then
      raise exception 'Not enough credits';
    end if;
    select * into v_booking from bookings where id = v_booking.id;
  end if;

  return v_booking;
end;
$$;

-- book_class_for_client: the 0132 definition with the same two changes as book_class.
create or replace function public.book_class_for_client(p_class_id uuid, p_client_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client_id uuid := p_client_id;
  v_capacity integer;
  v_cost integer;
  v_class_name text;
  v_class_gym uuid;
  v_dow integer;
  v_specific date;
  v_retired timestamptz;
  v_tz text;
  v_booked_count integer;
  v_plan_last_day date;
  v_status text;
  v_booking bookings;
begin
  if not public.is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity, credit_cost, name, gym_id, day_of_week, specific_date, retired_at
  into v_capacity, v_cost, v_class_name, v_class_gym, v_dow, v_specific, v_retired
  from classes where id = p_class_id for share;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  -- 1. The class must be at the member's gym.
  if not public.same_gym_as_client(v_class_gym, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;
  if v_retired is not null then
    raise exception 'That session is no longer running';
  end if;
  -- 2. Not in the past (the gym's own calendar day).
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class_gym;
  if p_booking_date < public.local_date(v_tz) then
    raise exception 'You can''t book a session in the past';
  end if;
  -- 3. The session must actually run on that date: its one-off date, or its weekday (0 = Sunday).
  if not (
    (v_specific is not null and p_booking_date = v_specific)
    or (v_specific is null and v_dow is not null and extract(dow from p_booking_date)::integer = v_dow)
  ) then
    raise exception 'That session doesn''t run on that date';
  end if;
  -- 4. And it must not have been cancelled by the coach.
  if exists (select 1 from class_exceptions where class_id = p_class_id and occurrence_date = p_booking_date) then
    raise exception 'That session has been cancelled';
  end if;
  -- 5. Not after the last day of the member's plan (D13a): the plan's end would cancel it.
  select s.plan_last_day into v_plan_last_day from public.session_credit_sources(v_client_id, p_booking_date) s;
  if v_plan_last_day is not null and p_booking_date > v_plan_last_day then
    raise exception 'This member''s plan ends on %, so they can''t be booked after that.', public.session_label(v_plan_last_day, null);
  end if;

  select count(*) into v_booked_count
  from bookings
  where class_id = p_class_id and booking_date = p_booking_date and status = 'booked';

  v_status := case when v_booked_count < v_capacity then 'booked' else 'waitlist' end;

  insert into bookings (class_id, client_id, booking_date, status)
  values (p_class_id, v_client_id, p_booking_date, v_status)
  returning * into v_booking;

  -- Paid from the weekly credits of the week the session runs (D13b), then bonus credits. Not enough: the booking is undone.
  if v_status = 'booked' then
    if not public.charge_booking(v_booking.id, v_cost, 'Booked ' || v_class_name || ' (by coach)', auth.uid()) then
      raise exception 'Not enough credits';
    end if;
    select * into v_booking from bookings where id = v_booking.id;
  end if;

  return v_booking;
end;
$fn$;

-- promote_from_waitlist: the 0158 definition. New: the member is paid for through charge_booking (the session's week's credits, then
-- bonus credits), and someone whose plan ends before the session is passed over.
create or replace function public.promote_from_waitlist(p_class_id uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class classes;
  v_gym gyms;
  v_tz text;
  v_start timestamptz;
  v_cutoff timestamptz;
  v_late boolean;
  v_booked integer;
  v_candidate record;
  v_plan_last_day date;
  v_deadline_local timestamp;
  v_message text;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class.id is null or v_class.retired_at is not null then
    return null;
  end if;
  if exists (select 1 from class_exceptions where class_id = p_class_id and occurrence_date = p_date) then
    return null;
  end if;

  select * into v_gym from gyms where id = v_class.gym_id;
  v_tz := coalesce(nullif(v_gym.timezone, ''), 'UTC');
  v_start := (p_date + coalesce(v_class.start_time, time '00:00')) at time zone v_tz;
  -- Once the session has started nobody is moved in: they could not get there, and could no longer cancel for a refund.
  if now() >= v_start then
    return null;
  end if;

  -- The same lock as book_class for this session and date: one place, one promotion.
  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_date::text));

  select count(*) into v_booked
  from bookings where class_id = p_class_id and booking_date = p_date and status = 'booked';
  if v_booked >= v_class.capacity then
    return null;
  end if;

  v_cutoff := public.class_cancel_deadline(p_date, v_class.start_time, v_class.cutoff_hours, v_tz, v_gym.blackout_start, v_gym.blackout_end);
  v_late := now() >= v_cutoff;

  for v_candidate in
    select b.id, b.client_id
    from bookings b
    where b.class_id = p_class_id and b.booking_date = p_date and b.status = 'waitlist'
    order by b.created_at asc, b.id
  loop
    select s.plan_last_day into v_plan_last_day from public.session_credit_sources(v_candidate.client_id, p_date) s;
    if v_plan_last_day is null or p_date <= v_plan_last_day then
      if public.charge_booking(v_candidate.id, v_class.credit_cost, 'Booked ' || v_class.name, null) then
        update bookings
        set status = 'booked', promoted_at = now(), promoted_after_cutoff = v_late
        where id = v_candidate.id;

        v_message := 'You''re off the waitlist and booked into ' || v_class.name || ' on ' || public.session_label(p_date, v_class.start_time)
          || case
               when v_class.credit_cost = 1 then ' (1 credit used).'
               when v_class.credit_cost > 1 then ' (' || v_class.credit_cost || ' credits used).'
               else '.'
             end;
        if v_late then
          v_message := v_message || ' A place opened after the cancel deadline, so you can still cancel for a full refund any time before it starts.';
        else
          v_deadline_local := v_cutoff at time zone v_tz;
          v_message := v_message || ' Can''t make it? Cancel by '
            || case when extract(minute from v_deadline_local) = 0 then to_char(v_deadline_local, 'FMHH12am') else to_char(v_deadline_local, 'FMHH12:MIam') end
            || ' on ' || to_char(v_deadline_local, 'FMDay FMDD FMMonth') || ' to get your credit back.';
        end if;

        insert into notifications (client_id, message) values (v_candidate.client_id, v_message);
        return v_candidate.id;
      end if;
    end if;
  end loop;

  return null;
end;
$fn$;

revoke execute on function public.promote_from_waitlist(uuid, date) from public, anon, authenticated;

-- create or replace keeps the grants from 0105 (book_class and book_class_for_client: signed-in people only); restated for clarity.
revoke execute on function public.book_class(uuid, date) from public, anon;
revoke execute on function public.book_class_for_client(uuid, uuid, date) from public, anon;
grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.book_class_for_client(uuid, uuid, date) to authenticated;

-- For the Book screens: what a member can pay with for a session on each of the given days (at most 62), by the rule above. The member
-- themself, their coach, or a coach working in the member's gym (as for the rest of a member's credits).
create or replace function public.member_session_credits(p_client uuid, p_dates date[])
returns table (session_date date, weekly_left integer, this_week boolean, bonus integer, plan_last_day date)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if auth.uid() is null or p_client is null
     or not coalesce(public.is_self(p_client) or public.is_coach_of(p_client) or public.client_gym_id(p_client) = public.my_gym_id(), false) then
    raise exception 'Not authorized';
  end if;
  if coalesce(array_length(p_dates, 1), 0) > 62 then
    raise exception 'Ask for 62 days at most.';
  end if;

  return query
    select d.on_day, s.weekly_left, s.weekly_now, s.bonus_left, s.plan_last_day
    from (select distinct x as on_day from unnest(p_dates) as x where x is not null) d
    cross join lateral public.session_credit_sources(p_client, d.on_day) s
    order by d.on_day;
end;
$fn$;

revoke execute on function public.member_session_credits(uuid, date[]) from public, anon;
grant execute on function public.member_session_credits(uuid, date[]) to authenticated;

-- =====================================================================================================================================
-- 3. Events: any coach at the gym adds them and changes their own; gym admins and the owner change anyone's
-- =====================================================================================================================================

-- May the signed-in person change, delete or message the sign-ups of an event at p_gym added by p_created_by? The coach who added it,
-- while they work at that gym, or a gym admin of that gym or the owner (can_manage_gym_business, 0161). An event with no author (none
-- today) is for admins and the owner only. Used by the policies below and notify_event_signups.
create or replace function public.may_manage_gym_event(p_gym uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select p_gym is not null
    and auth.uid() is not null
    and (
      (p_created_by = auth.uid() and coalesce(p_gym = public.my_gym_id() or public.is_coach_in_gym(p_gym), false))
      or coalesce(public.can_manage_gym_business(p_gym), false)
    );
$fn$;

revoke execute on function public.may_manage_gym_event(uuid, uuid) from public, anon;
grant execute on function public.may_manage_gym_event(uuid, uuid) to authenticated;

-- One policy for everything ("gym coaches manage gym_events", 0065) let any coach at the gym change or delete any event. Now:
drop policy if exists "gym coaches manage gym_events" on public.gym_events;

-- Read: the gym's coaches and members as before, plus the gym's admins and the owner (who have no active gym there).
drop policy if exists "gym reads gym_events" on public.gym_events;
create policy "gym reads gym_events"
  on public.gym_events for select to authenticated
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()) or public.can_manage_gym_business(gym_id));

-- Add: any coach at their active gym, or an admin or the owner; always as themself.
drop policy if exists "gym coaches add gym_events" on public.gym_events;
create policy "gym coaches add gym_events"
  on public.gym_events for insert to authenticated
  with check (created_by = auth.uid() and (gym_id = public.my_gym_id() or public.can_manage_gym_business(gym_id)));

-- Change and delete: the coach who added it, a gym admin or the owner.
drop policy if exists "event author or gym admins change gym_events" on public.gym_events;
create policy "event author or gym admins change gym_events"
  on public.gym_events for update to authenticated
  using (public.may_manage_gym_event(gym_id, created_by))
  with check (public.may_manage_gym_event(gym_id, created_by));

drop policy if exists "event author or gym admins remove gym_events" on public.gym_events;
create policy "event author or gym admins remove gym_events"
  on public.gym_events for delete to authenticated
  using (public.may_manage_gym_event(gym_id, created_by));

-- An event keeps its author and its gym: an edit cannot hand an event to someone else (or take it to another gym) to get round the
-- rule above.
create or replace function public.gym_event_keep_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.created_by := old.created_by;
  new.gym_id := old.gym_id;
  return new;
end;
$fn$;

revoke execute on function public.gym_event_keep_author() from public, anon, authenticated;

drop trigger if exists gym_event_keep_author on public.gym_events;
create trigger gym_event_keep_author
  before update on public.gym_events
  for each row execute function public.gym_event_keep_author();

-- Who signed up: the member themself, the gym's coaches (the "who is in" list, as before), and now the gym's admins and the owner.
drop policy if exists "read own or gym event_signups" on public.event_signups;
create policy "read own or gym event_signups"
  on public.event_signups for select
  using (
    public.is_self(client_id)
    or exists (
      select 1 from gym_events e
      where e.id = event_id and (e.gym_id = public.my_gym_id() or public.can_manage_gym_business(e.gym_id))
    )
  );

-- notify_event_signups: the 0135 definition. Telling the people signed up (a changed time or place, a cancelled event) is now for whoever
-- may change the event: the coach who added it, a gym admin or the owner (before: any coach at the gym).
create or replace function public.notify_event_signups(p_event uuid, p_message text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event gym_events;
  v_message text := btrim(coalesce(p_message, ''));
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;
  select * into v_event from gym_events where id = p_event;
  if v_event is null or not coalesce(public.is_coach_in_gym(v_event.gym_id) or public.can_manage_gym_business(v_event.gym_id), false) then
    raise exception 'Event not found';
  end if;
  if not public.may_manage_gym_event(v_event.gym_id, v_event.created_by) then
    raise exception 'Only the coach who added this event, a gym admin or the owner can message the people signed up.';
  end if;
  if char_length(v_message) < 1 or char_length(v_message) > 300 then
    raise exception 'The message must be 1 to 300 characters.';
  end if;

  insert into notifications (client_id, message)
  select s.client_id, v_message from event_signups s where s.event_id = p_event;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.notify_event_signups(uuid, text) from public, anon;
grant execute on function public.notify_event_signups(uuid, text) to authenticated;

-- =====================================================================================================================================
-- 4. D22 (SE8): every sign-in link made is recorded
-- =====================================================================================================================================

-- One row per one-time "choose a password" link: a member's, made by their coach or a gym admin (the member page), or a new coach's,
-- made by whoever added them (Team, "Add a coach"). Who made it, for whom, at which gym, when. Written only by the web server (the
-- service role) after its own checks, and before the link is shown or emailed; nobody signed in can add, change or remove a row. Read by
-- the gym's admins and the owner (can_manage_gym_business, 0161); the owner sees the recent ones on the gym's Team tab.
create table if not exists public.sign_in_links (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references public.gyms(id) on delete set null,
  made_by uuid references public.profiles(id) on delete set null,
  made_for uuid references public.profiles(id) on delete set null,
  kind text not null default 'member' check (kind in ('member', 'new_coach')),
  created_at timestamptz not null default now()
);

create index if not exists sign_in_links_gym_created_idx on public.sign_in_links (gym_id, created_at desc);

alter table public.sign_in_links enable row level security;

revoke all on table public.sign_in_links from anon;
revoke insert, update, delete, truncate on table public.sign_in_links from authenticated;
grant select on table public.sign_in_links to authenticated;

drop policy if exists "gym admins and owner read sign_in_links" on public.sign_in_links;
create policy "gym admins and owner read sign_in_links"
  on public.sign_in_links for select to authenticated
  using (public.can_manage_gym_business(gym_id));

-- The recent links of one gym with names, for the owner's Team tab (and a gym admin): newest first, at most 100.
create or replace function public.gym_sign_in_links(p_gym uuid, p_limit integer default 20)
returns table (id uuid, kind text, created_at timestamptz, made_by uuid, made_by_name text, made_for uuid, made_for_name text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if auth.uid() is null or not coalesce(public.can_manage_gym_business(p_gym), false) then
    raise exception 'Not authorized';
  end if;

  return query
    select l.id, l.kind, l.created_at,
           l.made_by, coalesce(nullif(btrim(pb.display_name), ''), pb.email),
           l.made_for, coalesce(nullif(btrim(cp.name), ''), nullif(btrim(pf.display_name), ''), pf.email)
    from sign_in_links l
    left join profiles pb on pb.id = l.made_by
    left join profiles pf on pf.id = l.made_for
    left join client_profiles cp on cp.client_id = l.made_for
    where l.gym_id = p_gym
    order by l.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$fn$;

revoke execute on function public.gym_sign_in_links(uuid, integer) from public, anon;
grant execute on function public.gym_sign_in_links(uuid, integer) to authenticated;