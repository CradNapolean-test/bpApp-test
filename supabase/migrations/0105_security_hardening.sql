-- Security hardening found by the SECURITY DEFINER audit (see docs/SECURITY_DEFINER_AUDIT.md).
--
-- Root causes:
--  1. Functions were never locked down. Postgres/Supabase grant EXECUTE on new functions to PUBLIC, anon and
--     authenticated by default, and most migrations only ADDED "grant ... to authenticated" without revoking the
--     default. So a logged-out caller could run them. Three internal helpers (top_up_membership_credits,
--     clear_membership_credits, expire_bonus_credits) had no permission check at all.
--  2. Permission checks that are NULL for a caller with no gym or no login. auth.uid() is NULL when logged out and
--     my_gym_id() is NULL for anyone who is not a coach, so "if not (a or b) then raise" and "if x != my_gym_id()
--     then raise" evaluate to NULL, and PL/pgSQL treats NULL as false, so the check silently passes.
--
-- Fix: (A) internal functions: nobody can call them directly (other SECURITY DEFINER functions and the service-role
-- cron still can); (B) every function meant for logged-in users: revoke from PUBLIC and anon; (C) NULL-safe checks in
-- the six functions where the gap was reachable; (D) new functions are no longer executable by anon by default.

-- (A) Internal helpers: only other SECURITY DEFINER functions / the service role may call these.
revoke execute on function public.top_up_membership_credits(uuid) from public, anon, authenticated;
revoke execute on function public.clear_membership_credits(uuid) from public, anon, authenticated;
revoke execute on function public.expire_bonus_credits() from public, anon, authenticated;

-- (B) Logged-in-only RPCs: remove the default grant to PUBLIC and anon (the explicit grant to authenticated stays).
revoke execute on function public.add_coach_to_gym(uuid,boolean) from public, anon;
revoke execute on function public.apply_programme_rollout(uuid) from public, anon;
revoke execute on function public.assign_education_course(uuid,uuid) from public, anon;
revoke execute on function public.assign_form(uuid,uuid) from public, anon;
revoke execute on function public.assign_membership(uuid,uuid) from public, anon;
revoke execute on function public.book_class(uuid,date) from public, anon;
revoke execute on function public.book_class_for_client(uuid,uuid,date) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.cancel_class_occurrence(uuid,date,text) from public, anon;
revoke execute on function public.check_in_booking(uuid,date) from public, anon;
revoke execute on function public.class_booking_counts(uuid[],date[]) from public, anon;
revoke execute on function public.clear_scheduled_end(uuid) from public, anon;
revoke execute on function public.coach_cancel_booking(uuid,boolean) from public, anon;
revoke execute on function public.copy_education_course_to_gym(uuid,uuid) from public, anon;
revoke execute on function public.create_communication(text,text,uuid,timestamptz,text,text) from public, anon;
revoke execute on function public.credit_pack_usage() from public, anon;
revoke execute on function public.duplicate_program_template(uuid,text) from public, anon;
revoke execute on function public.end_membership(uuid,date) from public, anon;
revoke execute on function public.event_signup_counts() from public, anon;
revoke execute on function public.get_coach_chat_overview() from public, anon;
revoke execute on function public.get_my_coach_display_name() from public, anon;
revoke execute on function public.get_my_coach_email() from public, anon;
revoke execute on function public.instantiate_program_template(uuid,uuid,text,date) from public, anon;
revoke execute on function public.mark_attendance(uuid,boolean) from public, anon;
revoke execute on function public.mark_attendance_status(uuid,text) from public, anon;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
revoke execute on function public.mark_chat_unread(uuid) from public, anon;
revoke execute on function public.member_reward_progress() from public, anon;
revoke execute on function public.my_scoping_gym_id() from public, anon;
revoke execute on function public.owner_gym_stats() from public, anon;
revoke execute on function public.owner_gyms_overview() from public, anon;
revoke execute on function public.plan_member_counts() from public, anon;
revoke execute on function public.red_flag_report(date) from public, anon;
revoke execute on function public.restore_class_occurrence(uuid,date) from public, anon;
revoke execute on function public.set_checkin_reminder_days(uuid,integer) from public, anon;
revoke execute on function public.set_client_admin_details(uuid,date,text,text) from public, anon;
revoke execute on function public.set_default_checkin_reminder_days(integer) from public, anon;
revoke execute on function public.set_display_name(text) from public, anon;
revoke execute on function public.set_gym_admin(uuid,boolean) from public, anon;
revoke execute on function public.set_gym_booking_settings(text,time,time) from public, anon;
revoke execute on function public.set_gym_name(text) from public, anon;
revoke execute on function public.set_logo_path(text) from public, anon;
revoke execute on function public.set_nutrition_tracking_mode(uuid,text) from public, anon;
revoke execute on function public.set_theme_preference(text) from public, anon;
revoke execute on function public.start_membership(uuid,uuid,date,date) from public, anon;
revoke execute on function public.submit_form_response(uuid,jsonb) from public, anon;
revoke execute on function public.switch_active_gym(uuid) from public, anon;

-- (C) NULL-safe permission checks (exact copies of the current definitions with one condition changed each).

create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_booking record;
  v_deduction record;
  v_count integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if public.my_gym_id() is null or v_class.gym_id is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;

  insert into class_exceptions (class_id, occurrence_date, cancelled_by, reason)
  values (p_class_id, p_date, auth.uid(), v_reason)
  on conflict (class_id, occurrence_date) do update set reason = coalesce(excluded.reason, class_exceptions.reason);

  for v_booking in
    select id, client_id, status
    from bookings
    where class_id = p_class_id
    and booking_date = p_date
    and status in ('booked', 'waitlist')
  loop
    if v_booking.status = 'booked' then
      for v_deduction in
        select bucket, -delta as amount from credits_ledger where booking_id = v_booking.id and delta < 0
      loop
        insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
        values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name || ' (cancelled)', v_deduction.bucket, v_booking.id);
      end loop;
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (
      v_booking.client_id,
      'Class cancelled: ' || v_class.name || ' on ' || p_date || '.' || case when v_reason is null then '' else ' ' || v_reason end
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.restore_class_occurrence(p_class_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if public.my_gym_id() is null or v_class.gym_id is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;

  delete from class_exceptions where class_id = p_class_id and occurrence_date = p_date;
end;
$$;

create or replace function public.coach_cancel_booking(p_booking_id uuid, p_refund boolean)
returns bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking bookings;
  v_class classes;
  v_was_booked boolean;
  v_deduction record;
  v_candidate record;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_cost integer;
  v_from_membership integer;
  v_from_bonus integer;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  select * into v_class from classes where id = v_booking.class_id;
  if not coalesce(public.is_coach_of(v_booking.client_id) or v_class.gym_id = public.my_gym_id(), false) then
    raise exception 'Not authorized';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  v_was_booked := v_booking.status = 'booked';
  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_was_booked and p_refund then
    for v_deduction in
      select bucket, -delta as amount from credits_ledger where booking_id = p_booking_id and delta < 0
    loop
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
      values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name || ' (removed by coach)', v_deduction.bucket, p_booking_id);
    end loop;
  end if;

  insert into notifications (client_id, message)
  values (
    v_booking.client_id,
    'You have been taken off ' || v_class.name || ' on ' || v_booking.booking_date ||
      case when v_was_booked and p_refund then '. Your credit was refunded.' else '.' end
  );

  if v_was_booked then
    for v_candidate in
      select b.id, b.client_id
      from bookings b
      where b.class_id = v_booking.class_id
      and b.booking_date = v_booking.booking_date
      and b.status = 'waitlist'
      order by b.created_at asc
    loop
      v_cost := v_class.credit_cost;
      select coalesce(sum(delta), 0) into v_membership_balance
      from credits_ledger where client_id = v_candidate.client_id and bucket = 'membership';
      select coalesce(sum(delta), 0) into v_bonus_balance
      from credits_ledger where client_id = v_candidate.client_id and bucket = 'bonus';

      if v_membership_balance + v_bonus_balance >= v_cost then
        update bookings set status = 'booked' where id = v_candidate.id;

        v_from_membership := least(v_cost, greatest(v_membership_balance, 0));
        v_from_bonus := v_cost - v_from_membership;
        if v_from_membership > 0 then
          insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
          values (v_candidate.client_id, -v_from_membership, 'Booked ' || v_class.name, 'membership', v_candidate.id);
        end if;
        if v_from_bonus > 0 then
          insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
          values (v_candidate.client_id, -v_from_bonus, 'Booked ' || v_class.name, 'bonus', v_candidate.id);
        end if;

        insert into notifications (client_id, message)
        values (
          v_candidate.client_id,
          'You have been moved off the waitlist for ' || v_class.name || ' on ' || v_booking.booking_date || '.'
        );
        exit;
      end if;
    end loop;
  end if;

  return v_booking;
end;
$fn$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_class classes;
  v_gym gyms;
  v_cutoff timestamptz;
  v_refund boolean := false;
  v_was_booked boolean;
  v_deduction record;
  v_candidate record;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_cost integer;
  v_from_membership integer;
  v_from_bonus integer;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;
  if not coalesce(public.is_self(v_booking.client_id) or public.is_coach_of(v_booking.client_id), false) then
    raise exception 'Not authorized';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  v_was_booked := v_booking.status = 'booked';

  select * into v_class from classes where id = v_booking.class_id;
  select * into v_gym from gyms where id = v_class.gym_id;
  v_cutoff := public.class_cancel_deadline(
    v_booking.booking_date, v_class.start_time, v_class.cutoff_hours,
    coalesce(v_gym.timezone, 'UTC'), v_gym.blackout_start, v_gym.blackout_end
  );
  v_refund := v_was_booked and now() < v_cutoff;

  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_refund then
    for v_deduction in
      select bucket, -delta as amount from credits_ledger where booking_id = p_booking_id and delta < 0
    loop
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
      values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name, v_deduction.bucket, p_booking_id);
    end loop;
  end if;

  if v_was_booked then
    for v_candidate in
      select b.id, b.client_id
      from bookings b
      where b.class_id = v_booking.class_id
      and b.booking_date = v_booking.booking_date
      and b.status = 'waitlist'
      order by b.created_at asc
    loop
      v_cost := v_class.credit_cost;
      select coalesce(sum(delta), 0) into v_membership_balance
      from credits_ledger where client_id = v_candidate.client_id and bucket = 'membership';
      select coalesce(sum(delta), 0) into v_bonus_balance
      from credits_ledger where client_id = v_candidate.client_id and bucket = 'bonus';

      if v_membership_balance + v_bonus_balance >= v_cost then
        update bookings set status = 'booked' where id = v_candidate.id;

        v_from_membership := least(v_cost, greatest(v_membership_balance, 0));
        v_from_bonus := v_cost - v_from_membership;
        if v_from_membership > 0 then
          insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
          values (v_candidate.client_id, -v_from_membership, 'Booked ' || v_class.name, 'membership', v_candidate.id);
        end if;
        if v_from_bonus > 0 then
          insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
          values (v_candidate.client_id, -v_from_bonus, 'Booked ' || v_class.name, 'bonus', v_candidate.id);
        end if;

        insert into notifications (client_id, message)
        values (
          v_candidate.client_id,
          'You''ve been moved off the waitlist for ' || v_class.name || ' on ' || v_booking.booking_date || '.'
        );
        exit;
      end if;
    end loop;
  end if;

  return v_booking;
end;
$$;

create or replace function public.submit_form_response(p_assignment_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment form_assignments;
  v_answer record;
begin
  select * into v_assignment from form_assignments where id = p_assignment_id;
  if v_assignment is null or not coalesce(is_self(v_assignment.client_id), false) then
    raise exception 'Not authorized';
  end if;
  if v_assignment.completed_at is not null then
    raise exception 'Form already submitted';
  end if;

  for v_answer in select * from jsonb_to_recordset(p_answers) as x(question_id uuid, answer jsonb)
  loop
    insert into form_responses (assignment_id, question_id, answer)
    values (p_assignment_id, v_answer.question_id, v_answer.answer);
  end loop;

  update form_assignments set completed_at = now() where id = p_assignment_id;
end;
$$;

create or replace function public.mark_chat_read(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(owns_client(p_client_id), false) then
    raise exception 'Not authorized';
  end if;

  insert into chat_threads (client_id, client_last_read_at, coach_last_read_at)
  values (
    p_client_id,
    case when is_self(p_client_id) then now() end,
    case when is_coach_of(p_client_id) then now() end
  )
  on conflict (client_id) do update set
    client_last_read_at = case when is_self(p_client_id) then now() else chat_threads.client_last_read_at end,
    coach_last_read_at = case when is_coach_of(p_client_id) then now() else chat_threads.coach_last_read_at end;
end;
$$;

-- (D) Future functions: not executable by anon unless a migration grants it explicitly.
alter default privileges in schema public revoke execute on functions from public, anon;
