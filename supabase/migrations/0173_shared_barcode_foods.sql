-- Shared barcode foods (the owner's list, item 6, decided 20 Nov 2026: "shared with everyone straight away; coaches can correct or hide it
-- in Library > Foods").
--
-- When a member scans a product (or searches for one) that is not in the food list and not on Open Food Facts, they can now add it from
-- the pack: its name, brand, serving and the protein, carbs and fat. It goes straight into the shared food list as a scanned product
-- (source 'scan', per gram, like every product a scan has cached since 0106), so the next person who scans that barcode gets it, on the
-- web and the phone. Coaches correct or hide it in Library > Foods with the rules they already have for scanned products (0128). A
-- member's own foods (0169: source 'own', owner_id, no barcode) are not touched: they stay private, and this never makes one.
--
-- Apply this BEFORE the web app (and phone app) of this batch is deployed: the new "Add this product" form calls add_barcode_food, which
-- does not exist until this has run (the form would say "Could not add that product" for everyone). The coach's Library > Foods reads
-- food_additions and shows the list without "Added by" if it is missing, so that screen keeps working either way.
--
-- Guard: before changing anything, the migration checks that add_barcode_food and record_barcode_food_addition do not exist yet (or are
-- already this file's, so it is safe to run twice), that the helpers it uses exist (my_gym_id, owns_client, is_same_gym_as_client,
-- valid_serving_options), and that the scanned-food insert rule it runs under ("authenticated users cache scanned foods", 0106) is there.
-- If not, nothing is changed and it stops with "... already exists and is not this file's ...", "... is missing ..." or "the scanned-food
-- insert rule is missing ...". Then send the PRE-FLIGHT's results to the developer instead.
--
-- What it adds:
--   1. food_additions: who added each scanned product, when, and whether they typed it in from the pack (true) or it came from Open Food
--      Facts (false). One row per product. Read rule: the member who added it, their own coach and the other coaches at their gym (the
--      same reach as their diary, 0053 and 0169). Other members, coaches at another gym and the gym owner cannot see who added a product
--      (they still see the product itself, as everyone does). No write rule: only the trigger in 2. writes it. Deleting a member keeps the
--      products they added (shared now) and empties added_by; deleting a product deletes its row.
--      Products scanned before this file have no row: who scanned them was never stored.
--   2. A trigger on foods (after a scanned product is inserted by a signed-in user, by any route: Open Food Facts or typed in) that writes
--      the food_additions row. A member (not a coach) can add at most 30 new products in 24 hours; the 31st is refused with
--      "You have added a lot of new products today ...". That stops a runaway or mischievous member filling the shared list; a real
--      member scanning their cupboard is nowhere near it.
--   3. add_barcode_food(barcode, name, brand, protein, carbs, fat, serving_options): adds a product typed in from the pack. Figures are per
--      gram (the app converts from per 100 g or per serving). It runs as the caller, so the scanned-food insert rule (0106) still decides
--      what may be inserted, and checks the same limits first with readable messages (name 1-100 characters, brand up to 60, protein,
--      carbs and fat 0-1 g a gram each and at most 1.05 together, not all 0, a valid serving). One shared food per barcode: if the product
--      is already there under any spelling of its number (a UPC-A read as 12 digits and the same product as a 13-digit EAN with a leading
--      0, and so on), that food is returned with "existing" true and nothing is added; two members adding the same product at the same
--      moment wait for each other (a lock per product number), so the second gets the first one's food. A product a coach hid is refused
--      ("A coach has taken this product off the food list ..."), not added again. Returns {"food": <the foods row>, "existing": bool}.
--
-- PRE-FLIGHT (read-only):
--   select to_regclass('public.food_additions') as table_exists;
-- Expected before: null.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('add_barcode_food', 'record_barcode_food_addition', 'my_gym_id', 'owns_client', 'is_same_gym_as_client',
--                       'valid_serving_options')
--   order by 1;
-- Expected before: my_gym_id, owns_client, is_same_gym_as_client and valid_serving_options only (no add_barcode_food or
-- record_barcode_food_addition).
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'foods' order by 1;
-- Expected before: "authenticated users cache scanned foods" INSERT, "authenticated users read foods" SELECT, "coaches correct scanned
-- foods" UPDATE, "coaches delete scanned foods" DELETE, "members save their own foods" INSERT.
--   select tgname from pg_trigger where tgrelid = 'public.foods'::regclass and not tgisinternal order by 1;
-- Expected before: no rows.
--   select count(*) filter (where source = 'scan') as scanned, count(*) filter (where source = 'scan' and hidden) as scanned_hidden
--   from public.foods;
-- Note the numbers (for the AFTER check: this file adds no foods).
--   select ltrim(barcode, '0') as product, array_agg(barcode order by barcode) as spellings, count(*)
--   from public.foods where barcode is not null group by 1 having count(*) > 1 order by 3 desc limit 20;
-- Information only: products already in the list twice under different spellings of their number (from before this file). The add uses
-- the first one that is not hidden, so nothing new is added for them; a coach can hide the wrong one.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: food_additions.
--   select relrowsecurity from pg_class where oid = 'public.food_additions'::regclass;
-- Expected: true.
--   select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'food_additions';
-- Expected: one row, "the adder and their gym's coaches read food_additions" SELECT with qual ((added_by = auth.uid()) OR
-- owns_client(added_by) OR is_same_gym_as_client(added_by)).
--   (the PRE-FLIGHT's pg_proc query again)
-- Expected after: also add_barcode_food a802ee322f31f0f3115753e96c36e64b false and record_barcode_food_addition
-- 07ad68a8531d183c2f63b21066fce3f6 true (this file's bodies; the same values as in the guard below).
--   select has_function_privilege('authenticated', 'public.add_barcode_food(text, text, text, numeric, numeric, numeric, jsonb)', 'execute') as members,
--          has_function_privilege('anon', 'public.add_barcode_food(text, text, text, numeric, numeric, numeric, jsonb)', 'execute') as anyone;
-- Expected: true, false.
--   (the PRE-FLIGHT's pg_trigger query again)
-- Expected after: foods_record_barcode_addition.
--   (the PRE-FLIGHT's pg_policies query on foods, and the count query, again)
-- Expected after: the same five rules and the same numbers as before (nothing about foods' rules or rows changes).
--   select count(*) from public.food_additions;
-- Expected right after applying: 0.
-- Write checks (test accounts, sandbox): node supabase/tests/security-audit/barcode-foods-check.cjs --ref=<sandbox project ref> adds a
-- product as member A, finds it as member B by the same and another spelling of its number, checks B adding it again gets A's food
-- ("existing"), that nobody can write food_additions, that A, A's coach and another coach at A's gym can see who added it and that member
-- B and a coach at another gym cannot, that the figures are checked, that a hidden product is refused, and that the 31st product in a day
-- is refused.
-- Then, in the app (test member): scan, or type into "Can't scan it?", a barcode that is in neither list (Open Food Facts has nothing for
-- it), fill in "Add this product" and add it: it goes on to "how much" and into the diary. As another test member, scan the same barcode:
-- it is found straight away, on the web and the phone. As a coach, Library > Foods > "Added by members" lists it with who added it; correct
-- its figures there, then hide it: the second member's scan says a coach took it off the list.
--
-- REVERSE: drop trigger if exists foods_record_barcode_addition on public.foods; drop function if exists public.add_barcode_food(text, text,
--   text, numeric, numeric, numeric, jsonb); drop function if exists public.record_barcode_food_addition(); drop table if exists
--   public.food_additions. The products members added stay in foods as ordinary scanned products (the 0128 rules still let coaches correct,
--   hide or delete them); only the record of who added them goes.
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_md5 text;
  v_check record;
  v_name text;
begin
  for v_check in
    select * from (values
      ('add_barcode_food', array['a802ee322f31f0f3115753e96c36e64b']),
      ('record_barcode_food_addition', array['07ad68a8531d183c2f63b21066fce3f6'])
    ) as t(name, accepted)
  loop
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is not null and not (v_md5 = any (v_check.accepted)) then
      raise exception '% already exists and is not this file''s (body md5 %), so nothing was changed.', v_check.name, v_md5;
    end if;
  end loop;

  foreach v_name in array array['my_gym_id', 'owns_client', 'is_same_gym_as_client', 'valid_serving_options'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name) then
      raise exception '% is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'foods' and policyname = 'authenticated users cache scanned foods' and cmd = 'INSERT'
  ) then
    raise exception 'the scanned-food insert rule is missing ("authenticated users cache scanned foods", 0106), so nothing was changed.';
  end if;
end
$guard$;

-- =====================================================================================================================================
-- 1. Who added each scanned product
-- =====================================================================================================================================
create table if not exists public.food_additions (
  food_id uuid primary key references public.foods(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  -- typed in from the pack by the member (add_barcode_food), not found on Open Food Facts
  typed boolean not null default false
);

create index if not exists food_additions_added_by_idx on public.food_additions (added_by, added_at desc);
create index if not exists food_additions_typed_idx on public.food_additions (added_at desc) where typed;

alter table public.food_additions enable row level security;
revoke all on public.food_additions from anon;

-- Who added a product is about that member, so it reads like their diary: themselves, their own coach and the other coaches at their gym.
drop policy if exists "the adder and their gym's coaches read food_additions" on public.food_additions;
create policy "the adder and their gym's coaches read food_additions"
  on public.food_additions for select
  to authenticated
  using (added_by = auth.uid() or public.owns_client(added_by) or public.is_same_gym_as_client(added_by));

-- =====================================================================================================================================
-- 2. Record who added it, and at most 30 new products a day for a member
-- =====================================================================================================================================
create or replace function public.record_barcode_food_addition()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me uuid := auth.uid();
begin
  -- a load or fix run by the developer (service role) is nobody's addition
  if v_me is null then
    return null;
  end if;
  if public.my_gym_id() is null
     and (select count(*) from public.food_additions a where a.added_by = v_me and a.added_at > now() - interval '24 hours') >= 30 then
    raise exception 'You have added a lot of new products today. Try again tomorrow, or use Quick Add for now.';
  end if;
  insert into public.food_additions (food_id, added_by, typed)
  select new.id, v_me, coalesce(current_setting('ballistic.typed_barcode_food', true), '') = 'on'
  where exists (select 1 from public.profiles p where p.id = v_me)
  on conflict (food_id) do nothing;
  return null;
end;
$fn$;

revoke execute on function public.record_barcode_food_addition() from public, anon, authenticated;

drop trigger if exists foods_record_barcode_addition on public.foods;
create trigger foods_record_barcode_addition
  after insert on public.foods
  for each row
  when (new.source = 'scan')
  execute function public.record_barcode_food_addition();

-- =====================================================================================================================================
-- 3. Add a product typed in from the pack: one shared food per barcode
-- =====================================================================================================================================
create or replace function public.add_barcode_food(
  p_barcode text,
  p_name text,
  p_brand text,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric,
  p_serving_options jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_digits text := regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g');
  v_stripped text;
  v_name text := btrim(coalesce(p_name, ''));
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_food public.foods;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if v_digits !~ '^[0-9]{6,14}$' then
    raise exception 'That is not a product barcode (6 to 14 digits).';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception 'Give the product a name of up to 100 characters.';
  end if;
  if v_brand is not null and char_length(v_brand) > 60 then
    raise exception 'Keep the brand under 60 characters.';
  end if;
  if p_protein is null or p_carbs is null or p_fat is null
     or p_protein < 0 or p_carbs < 0 or p_fat < 0
     or p_protein > 1 or p_carbs > 1 or p_fat > 1
     or p_protein + p_carbs + p_fat > 1.05 then
    raise exception 'Those figures are not possible for a food. Check the protein, carbs and fat on the pack.';
  end if;
  if p_protein + p_carbs + p_fat = 0 then
    raise exception 'Enter at least one of protein, carbs and fat.';
  end if;
  if not public.valid_serving_options(p_serving_options) then
    raise exception 'That serving is not valid.';
  end if;

  -- The product's number without its leading zeros: every spelling of the same product (8, 12, 13 or 14 digits) comes to this.
  v_stripped := coalesce(nullif(ltrim(v_digits, '0'), ''), v_digits);
  -- One add at a time per product, so two members adding the same pack at the same moment end with one food.
  perform pg_advisory_xact_lock(hashtextextended('add_barcode_food:' || v_stripped, 0));

  select f.* into v_food
  from public.foods f
  where f.barcode in (
    select v_digits
    union select v_stripped
    union select lpad(v_stripped, n, '0') from generate_series(char_length(v_stripped), 14) as n
  )
  order by f.hidden, f.id
  limit 1;

  if found then
    if v_food.hidden then
      raise exception 'A coach has taken this product off the food list. Use Quick Add for it, or ask your coach.';
    end if;
    return jsonb_build_object('food', to_jsonb(v_food), 'existing', true);
  end if;

  -- read by the trigger in 2., so the coach sees this product was typed in from the pack
  perform set_config('ballistic.typed_barcode_food', 'on', true);
  begin
    insert into public.foods (name, brand, portion, protein, carbs, fat, barcode, source, serving_options)
    values (v_name, v_brand, '1 gram', p_protein, p_carbs, p_fat, v_digits, 'scan', p_serving_options)
    returning * into v_food;
  exception when unique_violation then
    -- A scan cached this very number a moment ago (that route does not wait for the lock above): use that food.
    perform set_config('ballistic.typed_barcode_food', 'off', true);
    select f.* into v_food from public.foods f where f.barcode = v_digits;
    if v_food.hidden then
      raise exception 'A coach has taken this product off the food list. Use Quick Add for it, or ask your coach.';
    end if;
    return jsonb_build_object('food', to_jsonb(v_food), 'existing', true);
  end;
  perform set_config('ballistic.typed_barcode_food', 'off', true);
  return jsonb_build_object('food', to_jsonb(v_food), 'existing', false);
end;
$fn$;

revoke execute on function public.add_barcode_food(text, text, text, numeric, numeric, numeric, jsonb) from public, anon;
grant execute on function public.add_barcode_food(text, text, text, numeric, numeric, numeric, jsonb) to authenticated;

notify pgrst, 'reload schema';
