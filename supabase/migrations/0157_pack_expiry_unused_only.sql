-- RO1 (live review, 6 Nov 2026): when bonus credits expire, take back only the part of THAT grant the member has not used.
--
-- expire_bonus_credits (0055, still the live definition) took least(grant size, current bonus balance) for each expired grant. It never
-- looked at how much of the grant had been spent, so it could take credits that came from a newer pack or a goodwill grant. Example: a
-- member uses 8 of a 10-credit pack, buys a second 10-pack, and the first pack expires: 10 credits were removed instead of 2, so 8 credits
-- of the second (paid) pack were lost. The same happens with "Extra session" (1 credit for 7 days): a member who used it still lost a
-- credit when it expired, as long as they had any other bonus credit.
--
-- Now:
--   bonus_credit_lots(member)  replays the member's bonus credits in time order and says how much of each grant is still unspent. A booking
--                              (or a coach removal) spends the credits that expire soonest first, and credits that never expire last; on a
--                              tie, the older grant first. A refund goes back into the grants that booking was paid from, so a cancelled
--                              booking returns its credit to the pack it came from (and it expires with that pack). Once the expiry job has
--                              processed a grant, the grant is closed: a later refund of a booking paid from it stays as a credit that does
--                              not expire, as before. Read-only; only other functions and the SQL editor can call it.
--   expire_bonus_credits()     for each expired grant, takes back that grant's unspent part (from bonus_credit_lots), never more than the
--                              member's bonus balance, under the same per-member lock as grants, removals and refunds (0132, 0133). Each
--                              grant is still stamped expired_at once, whatever was left of it. Same name, arguments and return value, so
--                              the daily job (app/api/cron/expire-credits) is unchanged.
--
-- Nothing to repair: on 6 Nov 2026 the live database had 0 ledger rows with an expiry date, 0 "Expired: ..." rows and 0 credit packs, so
-- the old rule never removed anything (docs/live-review/revenue-owner.md, read-only check). Apply this before the first pack with an
-- expiry is created or the first "Extra session" is given (RO18 waits on it). Membership (weekly) credits are not touched.
--
-- PRE-FLIGHT (read-only; expect 0 and 0 as on 6 Nov. If the second number is not 0, the old rule has already run on real grants: send
-- the rows to the developer before applying, they may need a refund):
--   select count(*) filter (where expires_at is not null) as grants_with_expiry,
--          count(*) filter (where reason like 'Expired: %') as expiry_rows
--   from public.credits_ledger where bucket = 'bonus';
--
-- CHECK after applying (read-only):
--   1. Both functions exist and nobody but the database owner can call them (expect 2 rows, both false/false):
--        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
--               has_function_privilege('authenticated', p.oid, 'execute') as signed_in
--        from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('bonus_credit_lots', 'expire_bonus_credits');
--   2. The replay adds up: for every member with bonus credits, what is left across their grants equals their bonus balance
--      (expect 0 rows; a row means that member's history has more spent than granted and needs a look):
--        select b.client_id, b.balance, (select coalesce(sum(l.remaining), 0) from public.bonus_credit_lots(b.client_id) l) as unspent
--        from public.credits_balance_by_bucket b
--        where b.bucket = 'bonus'
--          and b.balance <> (select coalesce(sum(l.remaining), 0) from public.bonus_credit_lots(b.client_id) l);
--
-- Safe to run again.

create or replace function public.bonus_credit_lots(p_client uuid)
returns table (ledger_id uuid, granted integer, remaining integer, expires_at timestamptz, expired_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  -- One entry per lot: the ledger row that added the credits (a grant, or a refund that had nowhere to go back to).
  v_id uuid[] := '{}';
  v_amount integer[] := '{}';
  v_unspent integer[] := '{}';
  v_expires timestamptz[] := '{}';  -- null = never expires
  v_open boolean[] := '{}';         -- false once the expiry job has processed the grant and nothing was left of it
  -- What each booking took from each lot, so a refund goes back where it came from.
  v_draw_booking uuid[] := '{}';
  v_draw_lot integer[] := '{}';
  v_draw_amount integer[] := '{}';
  v_debt integer := 0;              -- spent beyond every lot (only possible with odd old data); paid off by the next credits in
  v_need integer;
  v_take integer;
  v_best integer;
  i integer;
  e record;
begin
  for e in
    select x.id, x.happened, x.step, x.delta, x.booking_id
    from (
      -- step 1: credits in (grants and refunds), step 2: credits out (bookings, removals, expiries),
      -- step 3: the expiry job processed a grant. Same moment: in before out before processed.
      select l.id, coalesce(l.created_at, '-infinity'::timestamptz) as happened, 1 as step, l.delta, l.booking_id
      from credits_ledger l
      where l.client_id = p_client and l.bucket = 'bonus' and l.delta > 0
      union all
      select l.id, coalesce(l.created_at, '-infinity'::timestamptz), 2, l.delta, l.booking_id
      from credits_ledger l
      where l.client_id = p_client and l.bucket = 'bonus' and l.delta < 0
      union all
      select l.id, l.expired_at, 3, 0, null::uuid
      from credits_ledger l
      where l.client_id = p_client and l.bucket = 'bonus' and l.delta > 0 and l.booking_id is null and l.expired_at is not null
    ) x
    order by x.happened, x.step, x.id
  loop
    if e.step = 1 then
      v_need := e.delta;
      v_take := least(v_need, v_debt);
      v_debt := v_debt - v_take;
      v_need := v_need - v_take;

      if e.booking_id is not null then
        -- A refund: back into the lots this booking was paid from (last taken, first returned), while they are still open.
        for i in reverse coalesce(array_length(v_draw_booking, 1), 0) .. 1 loop
          exit when v_need = 0;
          if v_draw_booking[i] = e.booking_id and v_draw_amount[i] > 0 and v_open[v_draw_lot[i]] then
            v_take := least(v_need, v_draw_amount[i]);
            v_unspent[v_draw_lot[i]] := v_unspent[v_draw_lot[i]] + v_take;
            v_draw_amount[i] := v_draw_amount[i] - v_take;
            v_need := v_need - v_take;
          end if;
        end loop;
        if v_need > 0 then
          -- Nothing (left) to go back into: the credits stay, without an expiry.
          v_id := array_append(v_id, e.id);
          v_amount := array_append(v_amount, e.delta);
          v_unspent := array_append(v_unspent, v_need);
          v_expires := array_append(v_expires, null::timestamptz);
          v_open := array_append(v_open, true);
        end if;
      else
        -- A grant (coach grant, credit pack, Extra session): a new lot with its own expiry.
        v_id := array_append(v_id, e.id);
        v_amount := array_append(v_amount, e.delta);
        v_unspent := array_append(v_unspent, v_need);
        v_expires := array_append(v_expires, (select l.expires_at from credits_ledger l where l.id = e.id));
        v_open := array_append(v_open, true);
      end if;

    elsif e.step = 2 then
      v_need := -e.delta;
      while v_need > 0 loop
        -- The open lot with credits left that expires soonest (never-expiring last; on a tie, the older lot).
        v_best := null;
        for i in 1 .. coalesce(array_length(v_id, 1), 0) loop
          if v_open[i] and v_unspent[i] > 0 and (
               v_best is null
               or (v_expires[i] is not null and (v_expires[v_best] is null or v_expires[i] < v_expires[v_best]))
             ) then
            v_best := i;
          end if;
        end loop;
        exit when v_best is null;

        v_take := least(v_need, v_unspent[v_best]);
        v_unspent[v_best] := v_unspent[v_best] - v_take;
        v_need := v_need - v_take;
        if e.booking_id is not null then
          v_draw_booking := array_append(v_draw_booking, e.booking_id);
          v_draw_lot := array_append(v_draw_lot, v_best);
          v_draw_amount := array_append(v_draw_amount, v_take);
        end if;
      end loop;
      v_debt := v_debt + v_need;

    else
      -- The expiry job processed this grant. Whatever it left (nothing, under this migration's rule) stays without an expiry.
      v_best := array_position(v_id, e.id);
      if v_best is not null then
        if v_unspent[v_best] = 0 then
          v_open[v_best] := false;
        else
          v_expires[v_best] := null;
        end if;
      end if;
    end if;
  end loop;

  return query
    select u.id, u.amount, u.unspent, l.expires_at, l.expired_at
    from unnest(v_id, v_amount, v_unspent) with ordinality as u(id, amount, unspent, ord)
    join credits_ledger l on l.id = u.id
    order by u.ord;
end;
$fn$;

revoke execute on function public.bonus_credit_lots(uuid) from public, anon, authenticated;

create or replace function public.expire_bonus_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_grant record;
  v_unspent integer;
  v_bonus_balance integer;
  v_clawback integer;
  v_count integer := 0;
begin
  for v_grant in
    select id, client_id, reason
    from credits_ledger
    where bucket = 'bonus' and delta > 0 and booking_id is null
      and expires_at is not null and expires_at <= now() and expired_at is null
    order by client_id, expires_at, created_at, id
  loop
    -- The same lock as grants, removals and refunds, so nothing moves this member's credits while the unspent part is worked out.
    perform pg_advisory_xact_lock(hashtext('credits:' || v_grant.client_id::text));

    select b.remaining into v_unspent
    from public.bonus_credit_lots(v_grant.client_id) b
    where b.ledger_id = v_grant.id;

    select coalesce(sum(delta), 0) into v_bonus_balance
    from credits_ledger where client_id = v_grant.client_id and bucket = 'bonus';

    -- Only what is left of THIS grant, and never more than the member has.
    v_clawback := least(coalesce(v_unspent, 0), greatest(v_bonus_balance, 0));
    if v_clawback > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket)
      values (v_grant.client_id, -v_clawback, 'Expired: ' || v_grant.reason, 'bonus');
    end if;

    update credits_ledger set expired_at = now() where id = v_grant.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

-- Still for the daily job only (service role), as in 0105.
revoke execute on function public.expire_bonus_credits() from public, anon, authenticated;
